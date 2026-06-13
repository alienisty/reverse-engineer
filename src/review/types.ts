export type ChecklistCategory = 'main' | 'dependency' | 'use';

export interface CoverageChecklistItem {
  id: string;
  label: string;
  sourceFile: string;
  searchTerms: string[];
  category: ChecklistCategory;
}

export type ReviewStatus = 'COMPLETE' | 'NEEDS_REVISION';

export interface ChecklistCoverageEntry {
  id: string;
  label: string;
  sourceFile: string;
  covered: boolean;
  category: ChecklistCategory;
}

export interface DesignReviewFeedbackItem {
  section?: string;
  description: string;
  codeReference?: string;
}

export interface DesignReviewResult {
  status: ReviewStatus;
  checklist: ChecklistCoverageEntry[];
  feedbackItems: DesignReviewFeedbackItem[];
  rawResponse: string;
}

export interface ParseDesignReviewResponseResult {
  result?: DesignReviewResult;
  error?: string;
}

export interface BuildDesignReviewPromptInput {
  designDocument: string;
  sourceContext: string;
  checklist: CoverageChecklistItem[];
}

export interface BuildReviewParseRetryPromptInput {
  reviewPrompt: string;
  failedResponse: string;
  parseError: string;
}

export const MAX_REVIEW_PARSE_ATTEMPTS = 3;
export const MAX_REVIEW_ROUNDS = 3;

export interface BuildDesignRevisionPromptInput {
  designDocument: string;
  generationPrompt: string;
  feedbackItems: DesignReviewFeedbackItem[];
  allowedSections: string[];
}

export interface BuildRevisionRetryPromptInput {
  originalPrompt: string;
  failedResponse: string;
  validationErrors: string[];
}
