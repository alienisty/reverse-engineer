import type { MermaidValidationFailure } from './validateDesignMermaid.js';

export interface MermaidRepairPromptInput {
  designDoc: string;
  failures: MermaidValidationFailure[];
  generationPrompt: string;
}

const OUTER_FENCE_PATTERN = /^```(?:\w+)?\s*\n([\s\S]*?)\n```\s*$/;

export function buildMermaidRepairPrompt(input: MermaidRepairPromptInput): string {
  const failureList = input.failures
    .map((failure, index) => {
      return [
        `${index + 1}. Block index ${failure.blockIndex} (starts at line ${failure.line})`,
        `   Parse error: ${failure.error}`,
        '   Invalid mermaid source:',
        '   ```mermaid',
        ...failure.source.split('\n').map((line) => `   ${line}`),
        '   ```',
      ].join('\n');
    })
    .join('\n\n');

  return [
    'The design document below contains invalid Mermaid diagram blocks that failed parsing.',
    'Fix ONLY the listed invalid ```mermaid``` blocks. Return the COMPLETE design markdown.',
    '',
    'Rules:',
    '- Change only the broken ```mermaid``` fenced blocks listed under Failures.',
    '- Do not add, remove, or rewrite non-diagram sections, headings, or prose.',
    '- Do not regenerate the document from scratch.',
    '- Preserve all valid ```mermaid``` blocks and all other markdown verbatim except required diagram fixes.',
    '',
    '## Reference context (source analysis prompt)',
    input.generationPrompt,
    '',
    '## Current design document',
    input.designDoc,
    '',
    '## Failures',
    failureList,
  ].join('\n');
}

export function stripRepairResponse(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(OUTER_FENCE_PATTERN);
  if (match) {
    return match[1] ?? trimmed;
  }

  return content;
}
