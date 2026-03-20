import { toSectionHeading } from './designSections.js';
import type { BuildDesignRevisionPromptInput } from './types.js';

function formatFeedbackItems(
  feedbackItems: BuildDesignRevisionPromptInput['feedbackItems'],
): string {
  if (feedbackItems.length === 0) {
    return '(none)';
  }

  return feedbackItems
    .map((item, index) => {
      const section = item.section ? `**[${item.section}]** ` : '';
      const ref = item.codeReference ? ` _Ref: ${item.codeReference}_` : '';
      return `${index + 1}. ${section}${item.description}${ref}`;
    })
    .join('\n');
}

function formatAllowedSections(allowedSections: string[]): string {
  if (allowedSections.length === 0) {
    return '(none — keep the entire document verbatim except fixes required by feedback)';
  }

  return allowedSections.map((section) => toSectionHeading(section)).join(', ');
}

export function buildDesignRevisionPrompt(input: BuildDesignRevisionPromptInput): string {
  const allowedSections = formatAllowedSections(input.allowedSections);

  return [
    'Revise the design document below using the review feedback.',
    'Return the complete design markdown.',
    '',
    `You may change only: ${allowedSections}.`,
    'All other sections must remain verbatim (whitespace normalization aside).',
    'Preserve the document title, all required section headings, and at least as many ```mermaid``` blocks as the original.',
    '',
    '## Source context (generation prompt)',
    input.generationPrompt,
    '',
    '## Current design document',
    input.designDocument,
    '',
    '## Review feedback',
    formatFeedbackItems(input.feedbackItems),
  ].join('\n');
}
