// copyChangedDocs.js
import { google } from 'googleapis';
import { supabaseAdmin } from '../../lib/supabaseClient';

const client_id = process.env.GOOGLE_CLIENT_ID;
const client_secret = process.env.GOOGLE_CLIENT_SECRET;
const redirect_uris = process.env.GOOGLE_REDIRECT_URI;
const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

const oauth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris
);
oauth2Client.setCredentials({ refresh_token: refreshToken });

async function makeCopyOfDocument(docId) {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  try {
    const response = await drive.files.copy({
      fileId: docId,
      requestBody: {
        name: 'Copy of ' + docId, // You might want to customize the copied document's name
      },
    });
    console.log("Copied document ID:", response.data.id);
    return response.data.id;
  } catch (error) {
    if (error.code === 403) {
      console.warn('Access denied for document:', docId);
      return null; // Return null to indicate that the copy operation failed due to access denial
    } else if (error.code === 404) {
      console.warn('File not found:', docId);
      return null; // Return null to indicate that the copy operation failed due to file not found
    } else {
      console.error("Failed to copy document:", error);
      throw error; // Rethrow other errors
    }
  }
}

export const handler = async (event, context) => {
  const { docs, statusChangeResponse, test } = JSON.parse(event.body);

  if (!docs || !statusChangeResponse) {
    console.error('Missing docs or statusChangeResponse in the request body');
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Bad Request: Missing docs or statusChangeResponse' }),
    };
  }

  try {
    const changedDocsWithCopyIds = statusChangeResponse.map((changedDocId) => {
      const changedDoc = docs.find((doc) => doc.google_id === changedDocId);
      return {
        google_id: changedDoc.google_id,
        all_copy_ids: changedDoc.all_copy_ids,
      };
    });

    const copiedDocs = [];

    for (const doc of changedDocsWithCopyIds) {
      if (!test) {
        // Create a new copy
        const newDocId = await makeCopyOfDocument(doc.google_id);
        if (newDocId !== null) {
          // Update the all_copy_ids array by keeping the last two copies and adding the new one
          const updatedCopyIds = [...doc.all_copy_ids.slice(-2), newDocId].slice(-3);
          await supabaseAdmin
            .from('documents')
            .update({
              latest_copy_g_id: newDocId,
              all_copy_ids: updatedCopyIds,
            })
            .eq('google_id', doc.google_id);
          copiedDocs.push({
            google_id: doc.google_id,
            new_copy_id: newDocId,
            all_copy_ids: updatedCopyIds,
          });
        }
      }
    }

    console.log('Changed documents processed successfully');
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Changed documents processed successfully',
        copied_docs: copiedDocs,
      }),
    };
  } catch (error) {
    console.error('Error copying changed documents:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};