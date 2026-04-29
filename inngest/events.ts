import { eventType, staticSchema } from "inngest";

export const topicSelected = eventType("topic.selected", {
  schema: staticSchema<{
    siteId: string;
    headline: string;
    sourceUrls: string[];
    keywordCluster: string;
  }>(),
});

export const articlePublished = eventType("article.published", {
  schema: staticSchema<{
    articleId: string;
    siteId: string;
    url: string;
  }>(),
});

export const assessmentFlagged = eventType("assessment.flagged", {
  schema: staticSchema<{
    articleId: string;
    assessmentId: string;
    issueType: string;
  }>(),
});

export const improvementProposed = eventType("improvement.proposed", {
  schema: staticSchema<{
    improvementId: string;
    articleId: string;
  }>(),
});

export const improvementDecided = eventType("improvement.decided", {
  schema: staticSchema<{
    improvementId: string;
    action: "approve" | "approve_with_edits" | "reject";
    editedPatch?: Record<string, unknown>;
    decidedBy: string;
    channel: "discord" | "email" | "dashboard";
    rejectionReason?: string;
  }>(),
});

// Re-export legacy Events type for backwards compat with any code that imports it
export type Events = {
  "topic.selected": {
    data: {
      siteId: string;
      headline: string;
      sourceUrls: string[];
      keywordCluster: string;
    };
  };
  "article.published": {
    data: {
      articleId: string;
      siteId: string;
      url: string;
    };
  };
  "assessment.flagged": {
    data: {
      articleId: string;
      assessmentId: string;
      issueType: string;
    };
  };
  "improvement.proposed": {
    data: {
      improvementId: string;
      articleId: string;
    };
  };
  "improvement.decided": {
    data: {
      improvementId: string;
      action: "approve" | "approve_with_edits" | "reject";
      editedPatch?: object;
      decidedBy: string;
      channel: "discord" | "email" | "dashboard";
      rejectionReason?: string;
    };
  };
};
