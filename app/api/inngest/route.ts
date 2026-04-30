import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { topicDiscovery } from "../../../inngest/functions/topic-discovery";
import { generateArticle } from "../../../inngest/functions/generate-article";
import { weeklyAssessment } from "../../../inngest/functions/weekly-assessment";

const functions = [topicDiscovery, generateArticle, weeklyAssessment];

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
