import type { BuildReviewParseRetryPromptInput } from './types.js';

export function buildReviewParseRetryPrompt(input: BuildReviewParseRetryPromptInput): string {
  return [
    'Your previous review response could not be parsed or validated.',
    'Return a corrected review using the exact required markdown structure.',
    '',
    `Failure: ${input.parseError}`,
    '',
    'Rules:',
    '- First section must be ## Coverage Check with every pre-injected checklist line present.',
    '- Toggle only [ ] to [x]; do not alter checklist ids or labels.',
    '- ## Review Result must contain STATUS: COMPLETE or STATUS: NEEDS_REVISION.',
    '- ## Feedback Items must list manual feedback or (none).',
    '- Every manual feedback item must include _Ref: filename_.',
    '',
    '## Review request',
    input.reviewPrompt,
    '',
    '## Previous invalid response',
    input.failedResponse,
  ].join('\n');
}
