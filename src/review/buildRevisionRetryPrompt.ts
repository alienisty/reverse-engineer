import type { BuildRevisionRetryPromptInput } from './types.js';

function formatValidationErrors(errors: string[]): string {
  return errors.map((error, index) => `${index + 1}. ${error}`).join('\n');
}

export function buildRevisionRetryPrompt(input: BuildRevisionRetryPromptInput): string {
  return [
    'Your previous revision could not be validated.',
    'Return a corrected complete design markdown that fixes every issue below.',
    '',
    'Validation failures:',
    formatValidationErrors(input.validationErrors),
    '',
    'Rules:',
    '- Change only the sections listed as allowed in the original revision request.',
    '- Keep all other section bodies verbatim (whitespace normalization aside).',
    '- Include every required section heading from the original design.',
    '- Preserve at least as many ```mermaid``` blocks as the original design.',
    '',
    '## Original revision request',
    input.originalPrompt,
    '',
    '## Previous invalid revision',
    input.failedResponse,
  ].join('\n');
}
