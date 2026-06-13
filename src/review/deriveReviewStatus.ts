import { checklistEntryBlocksComplete } from './checklistCategory.js';
import type {
  ChecklistCoverageEntry,
  CoverageChecklistItem,
  DesignReviewFeedbackItem,
  DesignReviewResult,
  ReviewStatus,
} from './types.js';

export interface DeriveReviewStatusInput {
  parsed: DesignReviewResult;
  expectedChecklist: CoverageChecklistItem[];
  designDocument: string;
}

export interface DeriveReviewStatusResult {
  result: DesignReviewResult;
  statusOverridden: boolean;
  honestyFailures: string[];
}

function buildChecklistGapFeedback(entry: ChecklistCoverageEntry): DesignReviewFeedbackItem {
  return {
    description: entry.label,
    codeReference: entry.sourceFile,
  };
}

function hasBlockingUncoveredItems(checklist: ChecklistCoverageEntry[]): boolean {
  return checklist.some((entry) => !entry.covered && checklistEntryBlocksComplete(entry));
}

function deriveStatus(
  checklist: ChecklistCoverageEntry[],
  feedbackItems: DesignReviewFeedbackItem[],
  advisoryStatus: ReviewStatus,
): ReviewStatus {
  if (hasBlockingUncoveredItems(checklist) || feedbackItems.length > 0) {
    return 'NEEDS_REVISION';
  }

  return advisoryStatus === 'NEEDS_REVISION' ? 'NEEDS_REVISION' : 'COMPLETE';
}

export function deriveReviewStatus(input: DeriveReviewStatusInput): DeriveReviewStatusResult {
  const checklist = input.parsed.checklist;
  const originallyUncoveredIds = new Set(
    input.parsed.checklist.filter((entry) => !entry.covered).map((entry) => entry.id),
  );
  const checklistGapFeedback = checklist
    .filter(
      (entry) =>
        !entry.covered &&
        originallyUncoveredIds.has(entry.id) &&
        checklistEntryBlocksComplete(entry),
    )
    .map(buildChecklistGapFeedback);
  const feedbackItems: DesignReviewFeedbackItem[] = [
    ...checklistGapFeedback,
    ...input.parsed.feedbackItems,
  ];

  const dedupedFeedback = deduplicateFeedback(feedbackItems);
  const programmaticStatus = deriveStatus(checklist, dedupedFeedback, input.parsed.status);
  const statusOverridden =
    input.parsed.status === 'COMPLETE' && programmaticStatus === 'NEEDS_REVISION';

  return {
    result: {
      status: programmaticStatus,
      checklist,
      feedbackItems: dedupedFeedback,
      rawResponse: input.parsed.rawResponse,
    },
    statusOverridden,
    honestyFailures: [],
  };
}

function deduplicateFeedback(items: DesignReviewFeedbackItem[]): DesignReviewFeedbackItem[] {
  const seen = new Set<string>();
  const deduped: DesignReviewFeedbackItem[] = [];

  for (const item of items) {
    const key = `${item.codeReference ?? ''}|${item.description}|${item.section ?? ''}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}
