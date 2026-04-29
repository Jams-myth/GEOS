import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "seo-geo-pipeline",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
