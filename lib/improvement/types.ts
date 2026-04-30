export type PatchType =
  | "replace_section"
  | "insert_section"
  | "update_meta"
  | "update_tldr"
  | "update_faq"
  | "add_footnote"
  | "update_schema";

export type PatchPriority = "critical" | "recommended" | "optional";

export interface PatchChange {
  type: PatchType;
  priority: PatchPriority;
  /** H2 heading, position hint, "meta", "tldr", question text, sentence to annotate, or "schema_type" */
  target: string;
  rationale: string;
  proposed_content: string;
}

export interface ProposedChanges {
  article_id: string;
  article_version_at_proposal: number;
  assessment_id: string;
  expected_impact: string;
  estimated_position_gain: number;
  changes: PatchChange[];
  gemini_review_required: boolean;
  notes: string;
}

export interface GeminiReview {
  approved: boolean;
  confidence: number;
  issues: string[];
  notes: string;
}
