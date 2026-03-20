import { checklistEntryBlocksComplete } from './checklistCategory.js';
import type {
  ChecklistCoverageEntry,
  CoverageChecklistItem,
  DesignReviewFeedbackItem,
} from './types.js';

export interface ValidateCoverageHonestyInput {
  checklist: ChecklistCoverageEntry[];
  expectedChecklist: CoverageChecklistItem[];
  designDocument: string;
}

export interface ValidateCoverageHonestyResult {
  checklist: ChecklistCoverageEntry[];
  feedbackItems: DesignReviewFeedbackItem[];
  failedItemIds: string[];
}

function designMentionsTerm(designDocument: string, term: string): boolean {
  return designDocument.toLowerCase().includes(term.toLowerCase());
}

function itemPassesHonesty(
  entry: ChecklistCoverageEntry,
  expected: CoverageChecklistItem | undefined,
  designDocument: string,
): boolean {
  const searchTerms = expected?.searchTerms ?? [];
  if (searchTerms.length === 0) {
    return true;
  }

  return searchTerms.some((term) => designMentionsTerm(designDocument, term));
}

export function validateCoverageHonesty(
  input: ValidateCoverageHonestyInput,
): ValidateCoverageHonestyResult {
  const expectedById = new Map(input.expectedChecklist.map((item) => [item.id, item]));
  const updatedChecklist = input.checklist.map((entry) => ({ ...entry }));
  const feedbackItems: DesignReviewFeedbackItem[] = [];
  const failedItemIds: string[] = [];

  for (let index = 0; index < updatedChecklist.length; index += 1) {
    const entry = updatedChecklist[index]!;
    if (!entry.covered || !checklistEntryBlocksComplete(entry)) {
      continue;
    }

    const expected = expectedById.get(entry.id);
    if (itemPassesHonesty(entry, expected, input.designDocument)) {
      continue;
    }

    entry.covered = false;
    failedItemIds.push(entry.id);
    feedbackItems.push({
      description: `Design does not mention ${entry.label} despite coverage claim`,
      codeReference: entry.sourceFile,
    });
  }

  return {
    checklist: updatedChecklist,
    feedbackItems,
    failedItemIds,
  };
}
