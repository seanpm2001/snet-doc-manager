// netlify/functions/commitNonExistingDocsWithComments.js
import { google } from 'googleapis';
import { Octokit } from '@octokit/rest';
import { getDocumentTextAndComments } from '../../utils/getDocumentTextAndComments';

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

async function commitNonExistingDocsToGitHub(docs) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  for (const doc of docs) {
    const existingDocIds = new Set();
    const path = `Data/${doc.entity}/Content/${doc.workgroup}/Docs/GoogleDocs/${doc.google_id}`;

    try {
      const { data: existingFiles } = await octokit.repos.getContent({
        owner: "SingularityNET-Archive",
        repo: "SingularityNET-Archive",
        path,
      });
      existingFiles.forEach((file) => {
        const docId = file.name.replace(".md", "");
        existingDocIds.add(docId);
      });
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }

    if (!existingDocIds.has(doc.google_id)) {
      const textWithComments = await getDocumentTextAndComments(doc);
      // Check if the generated Markdown content includes comments
      if (textWithComments.includes('> [Comments]')) {
        await octokit.repos.createOrUpdateFileContents({
          owner: "SingularityNET-Archive",
          repo: "SingularityNET-Archive",
          path: `${path}/doc-with-comments.md`,
          message: `Add document text and comments for ${doc.google_id}`,
          content: Buffer.from(textWithComments).toString('base64'),
        });
      } else {
        console.log(`No comments found for document ${doc.google_id}. Skipping commit.`);
      }
    }
  }
}
  
  export async function handler(event, context) {
    try {
      const { docs, test } = JSON.parse(event.body);
      if (!test) {
        await commitNonExistingDocsToGitHub(docs);
      }
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Non-existing docs committed successfully' }),
      };
    } catch (error) {
      console.error('Error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal Server Error' }),
      };
    }
  }