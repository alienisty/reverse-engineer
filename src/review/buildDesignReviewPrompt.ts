import type { BuildDesignReviewPromptInput, CoverageChecklistItem } from './types.js';

export { buildReviewSourceContext } from './reviewSourceContext.js';

export function formatChecklistLine(item: CoverageChecklistItem, covered = false): string {
  const marker = covered ? 'x' : ' ';
  return `- [${marker}] ${item.id} — ${item.label}`;
}

export function buildChecklistSection(checklist: CoverageChecklistItem[]): string {
  if (checklist.length === 0) {
    return '## Coverage Check\n(none)';
  }

  return ['## Coverage Check', ...checklist.map((item) => formatChecklistLine(item))].join('\n');
}

const RESPONSE_TEMPLATE = `## Review Result
STATUS: COMPLETE

## Feedback Items
(none)`;

export function buildDesignReviewPrompt(input: BuildDesignReviewPromptInput): string {
  const checklistSection = buildChecklistSection(input.checklist);

  return [
    'Review the design document below against the source code context.',
    'Verify that every checklist item is adequately covered in the design.',
    '',
    'Rules:',
    '- Return only markdown with exactly these sections in order: ## Coverage Check, ## Review Result, ## Feedback Items.',
    '- Include every checklist line below unchanged except toggle [ ] to [x] when the design adequately covers that item.',
    '- Do not invent, remove, or reword checklist lines.',
    '- Set STATUS to COMPLETE or NEEDS_REVISION in ## Review Result.',
    '- Add manual feedback only for gaps not already represented by unchecked checklist items.',
    '- Every manual feedback item must include _Ref: filename_ pointing to a file from the source context.',
    '- Use (none) when there are no manual feedback items.',
    '- Apply the source role model: main: and symbol: drive non-Usage completeness (subject to programmatic honesty); dep: checks main implementation accuracy and does not block COMPLETE when unchecked; use: is Usage/integration (including tests) — mark [x] only when Usage documents the pattern with illustrative (non-verbatim) examples and does not block COMPLETE when unchecked.',
    '- **Usage vs Uses (your responsibility):** Compare each `use:` file in **Uses** to the **Usage** section. Flag copy-paste when Usage fenced code reproduces the consumer implementation body (class shells, fields, methods, merge logic) or production class names, packages, or file paths from that use file. Shared imports and main-library types alone are not copy-paste. Illustrative examples with fictional class names are acceptable.',
    '- When Usage copies a use file: leave the matching `use:` row unchecked, set STATUS to NEEDS_REVISION, and add manual feedback with **[Usage]**, _Ref: <use-file path>_, describing what was copied and that the example must be rewritten illustratively.',
    '',
    '## Source context',
    input.sourceContext,
    '',
    '## Design document',
    input.designDocument,
    '',
    '## Required response format',
    'Copy the checklist section below into your response and update coverage markers only:',
    '',
    checklistSection,
    '',
    RESPONSE_TEMPLATE,
  ].join('\n');
}
