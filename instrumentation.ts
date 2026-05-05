import { schedule } from "node-cron";

export async function register() {
  // Only run the local scheduler in dev — Inngest cloud handles crons in production
  if (process.env.INNGEST_DEV !== "1") return;

  // Dynamically import to avoid pulling inngest client into edge runtime
  const { inngest } = await import("./inngest/client");

  async function triggerDiscovery() {
    try {
      await inngest.send({ name: "content/topic.discovery.requested", data: {} });
      console.log("[cron] topic-discovery triggered");
    } catch (err) {
      console.error("[cron] Failed to trigger topic-discovery:", err);
    }
  }

  // 6am and 6pm local time every day
  schedule("0 6 * * *", triggerDiscovery);
  schedule("0 18 * * *", triggerDiscovery);

  console.log("[cron] Local scheduler active — topic-discovery fires at 6am and 6pm");
}
