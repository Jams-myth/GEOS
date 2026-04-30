import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { topicDiscovery } from "../../../inngest/functions/topic-discovery";
import { generateArticle } from "../../../inngest/functions/generate-article";
import { weeklyAssessment } from "../../../inngest/functions/weekly-assessment";
import { applyImprovement } from "../../../inngest/functions/apply-improvement";

const functions = [topicDiscovery, generateArticle, weeklyAssessment, applyImprovement];

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
