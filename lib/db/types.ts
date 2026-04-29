import type { Database, Json } from "./types.generated";

export type { Database, Json };

export type Article = Database["public"]["Tables"]["articles"]["Row"];
export type ArticleInsert = Database["public"]["Tables"]["articles"]["Insert"];
export type ArticleUpdate = Database["public"]["Tables"]["articles"]["Update"];

export type Site = Database["public"]["Tables"]["sites"]["Row"];
export type SiteInsert = Database["public"]["Tables"]["sites"]["Insert"];

export type KeywordCluster = Database["public"]["Tables"]["keyword_clusters"]["Row"];
export type TopicCandidate = Database["public"]["Tables"]["topic_candidates"]["Row"];
export type TopicCandidateInsert = Database["public"]["Tables"]["topic_candidates"]["Insert"];

export type SourceScrape = Database["public"]["Tables"]["source_scrapes"]["Row"];
export type SourceScrapeInsert = Database["public"]["Tables"]["source_scrapes"]["Insert"];

export type Revision = Database["public"]["Tables"]["revisions"]["Row"];
export type RevisionInsert = Database["public"]["Tables"]["revisions"]["Insert"];

export type Assessment = Database["public"]["Tables"]["assessments"]["Row"];
export type AssessmentInsert = Database["public"]["Tables"]["assessments"]["Insert"];

export type Improvement = Database["public"]["Tables"]["improvements"]["Row"];
export type ImprovementInsert = Database["public"]["Tables"]["improvements"]["Insert"];
export type ImprovementUpdate = Database["public"]["Tables"]["improvements"]["Update"];

export type ApiBatchLog = Database["public"]["Tables"]["api_batch_logs"]["Row"];

// Application-level union types
export type ArticleStatus = "draft" | "published" | "archived";
export type TopicCandidateStatus = "pending" | "selected" | "published" | "rejected" | "superseded" | "expired";
export type ImprovementStatus = "pending_approval" | "approved" | "applied" | "rejected" | "expired" | "rolled_back";
export type RevisionSourceType = "generation" | "revision" | "improvement" | "rollback";
export type ApprovalChannel = "discord" | "email" | "dashboard";
export type IndexingAdapter = "google" | "speedyindex" | "indexnow";
