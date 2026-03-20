import { checklistCategoryFromId, checklistEntryBlocksComplete } from './checklistCategory.js';
import type {
  ChecklistCoverageEntry,
  CoverageChecklistItem,
  DesignReviewFeedbackItem,
  DesignReviewResult,
  ParseDesignReviewResponseResult,
  ReviewStatus,
} from './types.js';

const SECTION_HEADING_PATTERN = /^##\s+(.+?)\s*$/gm;
// Separator must be em/en dash only; ASCII hyphen appears in file paths (e.g. horus-core).
const CHECKLIST_LINE_PATTERN = /^\s*-\s*\[( |x|X)\]\s*(.+?)\s*(?:—|–)\s*(.+?)\s*$/;
const STATUS_LINE_PATTERN = /STATUS\s*:\s*(COMPLETE|NEEDS_REVISION)/i;
const FEEDBACK_ITEM_PATTERN =
  /^\s*(?:\d+\.\s*)?(?:[-*]\s*)?\*\*\[([^\]]+)\]\*\*\s*(.+?)(?:\s+_Ref:\s*([^_\n]+?)_)?\s*$/;
const REF_ONLY_PATTERN = /_Ref:\s*([^_\n]+?)_/;

interface ParsedSection {
  name: string;
  body: string;
}

function normalizeSectionName(name: string): string {
  return name.trim().toLowerCase();
}

function splitSections(response: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const matches = [...response.matchAll(SECTION_HEADING_PATTERN)];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (!match || match.index === undefined) {
      continue;
    }

    const nextMatch = matches[index + 1];
    const bodyStart = match.index + match[0].length;
    const bodyEnd = nextMatch?.index ?? response.length;
    const body = response.slice(bodyStart, bodyEnd).trim();

    sections.push({
      name: match[1]!.trim(),
      body,
    });
  }

  return sections;
}

function findSection(sections: ParsedSection[], expectedName: string): ParsedSection | undefined {
  const normalizedExpected = normalizeSectionName(expectedName);
  return sections.find((section) => normalizeSectionName(section.name) === normalizedExpected);
}

function parseChecklistId(id: string, expectedChecklist?: CoverageChecklistItem[]): {
  sourceFile: string;
  label: string;
} {
  const expected = expectedChecklist?.find((item) => item.id === id);
  if (expected) {
    return {
      sourceFile: expected.sourceFile,
      label: expected.label,
    };
  }

  const prefixEnd = id.indexOf(':');
  if (prefixEnd === -1) {
    return { sourceFile: id, label: id };
  }

  const prefix = id.slice(0, prefixEnd);
  const remainder = id.slice(prefixEnd + 1);

  if (prefix === 'main' || prefix === 'ref' || prefix === 'dep' || prefix === 'use') {
    return {
      sourceFile: remainder,
      label: remainder.split('/').pop() ?? remainder,
    };
  }

  if (prefix === 'symbol') {
    const lastColon = remainder.lastIndexOf(':');
    if (lastColon === -1) {
      return { sourceFile: remainder, label: remainder };
    }

    const sourceFile = remainder.slice(0, lastColon);
    const symbolName = remainder.slice(lastColon + 1);
    return {
      sourceFile,
      label: symbolName,
    };
  }

  return { sourceFile: remainder, label: remainder };
}

function parseChecklistSection(
  body: string,
  expectedChecklist?: CoverageChecklistItem[],
): { entries: ChecklistCoverageEntry[] } {
  const entries: ChecklistCoverageEntry[] = [];

  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '(none)') {
      continue;
    }

    const match = trimmed.match(CHECKLIST_LINE_PATTERN);
    if (!match) {
      continue;
    }

    const id = match[2]!.trim();
    const labelFromLine = match[3]!.trim();
    const parsedId = parseChecklistId(id, expectedChecklist);

    const expected = expectedChecklist?.find((item) => item.id === id);

    entries.push({
      id,
      label: labelFromLine || parsedId.label,
      sourceFile: parsedId.sourceFile,
      covered: match[1]!.toLowerCase() === 'x',
      category: expected?.category ?? checklistCategoryFromId(id),
    });
  }

  if (expectedChecklist && expectedChecklist.length > 0) {
    const parsedIds = new Set(entries.map((entry) => entry.id));
    const missing = expectedChecklist.filter((item) => !parsedIds.has(item.id));
    for (const item of missing) {
      entries.push({
        id: item.id,
        label: item.label,
        sourceFile: item.sourceFile,
        covered: false,
        category: item.category,
      });
    }
  }

  return { entries };
}

function parseStatus(body: string, response: string, checklist: ChecklistCoverageEntry[]): ReviewStatus | undefined {
  const sectionMatch = body.match(STATUS_LINE_PATTERN);
  if (sectionMatch) {
    return sectionMatch[1]!.toUpperCase() as ReviewStatus;
  }

  const globalMatch = response.match(STATUS_LINE_PATTERN);
  if (globalMatch) {
    return globalMatch[1]!.toUpperCase() as ReviewStatus;
  }

  if (checklist.length > 0) {
    const blocking = checklist.filter((entry) => checklistEntryBlocksComplete(entry));
    if (blocking.length === 0) {
      return 'COMPLETE';
    }

    return blocking.every((entry) => entry.covered) ? 'COMPLETE' : 'NEEDS_REVISION';
  }

  if (/\bNEEDS[_\s-]?REVISION\b/i.test(response)) {
    return 'NEEDS_REVISION';
  }

  if (/\bCOMPLETE\b/i.test(response)) {
    return 'COMPLETE';
  }

  return undefined;
}

function stripRefSuffix(description: string): string {
  return description.replace(/\s+_Ref:\s*[^_\n]+_\s*$/, '').trim();
}

function parseFeedbackSection(body: string): DesignReviewFeedbackItem[] {
  const trimmedBody = body.trim();
  if (!trimmedBody || trimmedBody === '(none)' || /^none\.?$/i.test(trimmedBody)) {
    return [];
  }

  const items: DesignReviewFeedbackItem[] = [];

  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const match = trimmed.match(FEEDBACK_ITEM_PATTERN);
    if (match) {
      items.push({
        section: match[1]!.trim(),
        description: stripRefSuffix(match[2]!.trim()),
        ...(match[3] ? { codeReference: match[3].trim() } : {}),
      });
      continue;
    }

    if (/^\s*(?:\d+\.\s*)?[-*]\s+/.test(trimmed)) {
      const refMatch = trimmed.match(REF_ONLY_PATTERN);
      const description = stripRefSuffix(trimmed.replace(/^\s*(?:\d+\.\s*)?[-*]\s+/, '').trim());
      if (description.length > 0) {
        items.push({
          description,
          ...(refMatch ? { codeReference: refMatch[1]!.trim() } : {}),
        });
      }
    }
  }

  return items;
}

export function parseDesignReviewResponse(
  response: string,
  expectedChecklist?: CoverageChecklistItem[],
): ParseDesignReviewResponseResult {
  const trimmed = response.trim();
  if (!trimmed) {
    return { error: 'Review response is empty' };
  }

  const sections = splitSections(trimmed);
  const coverageSection = findSection(sections, 'Coverage Check');
  if (!coverageSection) {
    return { error: 'Missing ## Coverage Check section' };
  }

  const reviewSection = findSection(sections, 'Review Result');
  if (!reviewSection) {
    return { error: 'Missing ## Review Result section' };
  }

  const feedbackSection = findSection(sections, 'Feedback Items');
  if (!feedbackSection) {
    return { error: 'Missing ## Feedback Items section' };
  }

  const checklistParse = parseChecklistSection(coverageSection.body, expectedChecklist);

  const status = parseStatus(reviewSection.body, trimmed, checklistParse.entries);
  if (!status) {
    return { error: 'Unable to parse STATUS from review response' };
  }

  const feedbackItems = parseFeedbackSection(feedbackSection.body);
  const result: DesignReviewResult = {
    status,
    checklist: checklistParse.entries,
    feedbackItems,
    rawResponse: response,
  };

  return { result };
}
