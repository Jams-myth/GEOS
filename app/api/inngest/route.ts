import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { topicDiscovery } from "../../../inngest/functions/topic-discovery";
import { generateArticle } from "../../../inngest/functions/generate-article";
import { weeklyAssessment } from "../../../inngest/functions/weekly-assessment";
import { applyImprovement } from "../../../inngest/functions/apply-improvement";
import { pruneDatabase } from "../../../inngest/functions/prune-database";

const functions = [topicDiscovery, generateArticle, weeklyAssessment, applyImprovement, pruneDatabase];

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
  streaming: "allow",
});

export const maxDuration = 60;
