import { google } from "googleapis";

export async function submitToGoogleIndexingApi(url: string): Promise<{ jobId: string; status: string }> {
  const serviceAccountJson = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error("GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON is not set");

  const serviceAccount = JSON.parse(serviceAccountJson) as object;

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/indexing"],
  });

  const indexing = google.indexing({ version: "v3", auth });

  const response = await indexing.urlNotifications.publish({
    requestBody: {
      url,
      type: "URL_UPDATED",
    },
  });

  return {
    jobId: response.data.urlNotificationMetadata?.url ?? url,
    status: "submitted",
  };
}
