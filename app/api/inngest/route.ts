import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { topicDiscovery } from "../../../inngest/functions/topic-discovery";
import { generateArticle } from "../../../inngest/functions/generate-article";

const functions = [topicDiscovery, generateArticle];

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
