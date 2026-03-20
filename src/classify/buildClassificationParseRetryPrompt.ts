export interface BuildClassificationParseRetryPromptInput {
  parseError: string;
  classificationPrompt: string;
  failedResponse: string;
}

export function buildClassificationParseRetryPrompt(
  input: BuildClassificationParseRetryPromptInput,
): string {
  return [
    'Your previous context classification response could not be parsed or validated.',
    'Return a corrected response with only promoted dependency paths, one relative path per line.',
    '',
    `Failure: ${input.parseError}`,
    '',
    'Rules:',
    '- One relative path per line from the dependency candidate list (or empty when none promote).',
    '- No prose, bullets, or markdown headings.',
    '',
    '## Classification request',
    input.classificationPrompt,
    '',
    '## Previous invalid response',
    input.failedResponse,
  ].join('\n');
}
