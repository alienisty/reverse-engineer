import {
  normalizeSectionBody,
  normalizeSectionName,
  splitDesignSections,
} from './designSections.js';
import { revisionSectionsForChecklistId } from './checklistCategory.js';
import type { ChecklistCoverageEntry, DesignReviewFeedbackItem } from './types.js';

export interface ValidateRevisionPreservationInput {
  original: string;
  revised: string;
  feedbackItems: DesignReviewFeedbackItem[];
  uncoveredChecklist: ChecklistCoverageEntry[];
}

export interface ValidateRevisionPreservationResult {
  errors: string[];
}

interface SectionRange {
  heading: string;
  bodyStart: number;
  end: number;
}

function getSectionRanges(markdown: string): SectionRange[] {
  const headingPattern = /^##\s+(.+?)\s*$/gm;
  const matches = [...markdown.matchAll(headingPattern)];
  const ranges: SectionRange[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (!match || match.index === undefined) {
      continue;
    }

    const nextMatch = matches[index + 1];
    const bodyStart = match.index + match[0].length;
    const end = nextMatch?.index ?? markdown.length;
    ranges.push({
      heading: normalizeSectionName(match[1] ?? ''),
      bodyStart,
      end,
    });
  }

  return ranges;
}

export function lockRevisionToAllowedSections(
  original: string,
  revised: string,
  allowedSections: string[],
): string {
  const allowed = new Set(allowedSections.map((section) => normalizeSectionName(section)));
  const originalSections = splitDesignSections(original);
  const revisedRanges = getSectionRanges(revised);

  if (revisedRanges.length === 0) {
    return revised;
  }

  let result = revised;
  for (let index = revisedRanges.length - 1; index >= 0; index -= 1) {
    const range = revisedRanges[index]!;
    if (allowed.has(range.heading)) {
      continue;
    }

    const originalBody = originalSections.get(range.heading);
    if (originalBody === undefined) {
      continue;
    }

    result = `${result.slice(0, range.bodyStart)}\n${originalBody}${result.slice(range.end)}`;
  }

  return result;
}

export function deriveAllowedRevisionSections(
  feedbackItems: DesignReviewFeedbackItem[],
  uncoveredChecklist: ChecklistCoverageEntry[],
): string[] {
  const allowed = new Set<string>();

  for (const item of feedbackItems) {
    if (item.section?.trim()) {
      allowed.add(normalizeSectionName(item.section));
    }
  }

  for (const entry of uncoveredChecklist) {
    if (entry.covered) {
      continue;
    }

    for (const section of revisionSectionsForChecklistId(entry.id)) {
      allowed.add(section);
    }
  }

  return [...allowed].sort((left, right) => left.localeCompare(right));
}

export function validateRevisionPreservation(
  input: ValidateRevisionPreservationInput,
): ValidateRevisionPreservationResult {
  const errors: string[] = [];
  const originalSections = splitDesignSections(input.original);
  const revisedSections = splitDesignSections(input.revised);
  const allowedSections = new Set(
    deriveAllowedRevisionSections(input.feedbackItems, input.uncoveredChecklist),
  );

  for (const heading of originalSections.keys()) {
    if (!revisedSections.has(heading)) {
      errors.push(`Revised design is missing section: ## ${heading}`);
    }
  }

  for (const [heading, originalBody] of originalSections) {
    if (allowedSections.has(heading)) {
      continue;
    }

    const revisedBody = revisedSections.get(heading);
    if (revisedBody === undefined) {
      continue;
    }

    if (normalizeSectionBody(originalBody) !== normalizeSectionBody(revisedBody)) {
      errors.push(`## ${heading} changed but is not in allowed sections`);
    }
  }

  const feedbackTargetSections = new Set(
    input.feedbackItems
      .filter((item) => item.section?.trim())
      .map((item) => normalizeSectionName(item.section!)),
  );

  for (const heading of feedbackTargetSections) {
    if (!allowedSections.has(heading)) {
      continue;
    }

    const originalBody = originalSections.get(heading);
    const revisedBody = revisedSections.get(heading);
    if (originalBody === undefined || revisedBody === undefined) {
      continue;
    }

    if (normalizeSectionBody(originalBody) === normalizeSectionBody(revisedBody)) {
      errors.push(`## ${heading} unchanged but feedback requested changes`);
    }
  }

  return { errors };
}
