import { describe, expect, it } from '@jest/globals';
import { buildMermaidRepairPrompt, stripRepairResponse } from '../../src/mermaid/repairDesignMermaid.js';
import type { MermaidValidationFailure } from '../../src/mermaid/validateDesignMermaid.js';

describe('buildMermaidRepairPrompt', () => {
  const generationPrompt = [
    'Your goal is to analyze the provided source code.',
    '',
    '## Main',
    'file.ts',
  ].join('\n');

  const designDoc = [
    '# Widget Design',
    '',
    '## Architecture',
    '',
    '```mermaid',
    'graph TD',
    '  A-->',
    '```',
  ].join('\n');

  const failures: MermaidValidationFailure[] = [
    {
      blockIndex: 0,
      line: 6,
      source: 'graph TD\n  A-->\n',
      error: 'Invalid flowchart diagram syntax',
    },
  ];

  it('includes generation context, current design, and failure details', () => {
    const prompt = buildMermaidRepairPrompt({ designDoc, failures, generationPrompt });

    expect(prompt).toContain('## Reference context (source analysis prompt)');
    expect(prompt).toContain(generationPrompt);
    expect(prompt).toContain('## Current design document');
    expect(prompt).toContain(designDoc);
    expect(prompt).toContain('## Failures');
    expect(prompt).toContain('Block index 0 (starts at line 6)');
    expect(prompt).toContain('Parse error: Invalid flowchart diagram syntax');
    expect(prompt).toContain('graph TD');
    expect(prompt).toContain('A-->');
  });

  it('instructs the model to fix only invalid mermaid blocks', () => {
    const prompt = buildMermaidRepairPrompt({ designDoc, failures, generationPrompt });

    expect(prompt).toContain('Fix ONLY the listed invalid ```mermaid``` blocks');
    expect(prompt).toContain('Return the COMPLETE design markdown');
    expect(prompt).toContain('Do not add, remove, or rewrite non-diagram sections');
    expect(prompt).toContain('Do not regenerate the document from scratch');
    expect(prompt).toContain('Preserve all valid ```mermaid``` blocks');
  });

  it('numbers multiple failures', () => {
    const multiFailures: MermaidValidationFailure[] = [
      failures[0]!,
      {
        blockIndex: 1,
        line: 12,
        source: 'classDiagram\n  class Foo<T>\n',
        error: 'Invalid class diagram syntax',
      },
    ];

    const prompt = buildMermaidRepairPrompt({
      designDoc,
      failures: multiFailures,
      generationPrompt,
    });

    expect(prompt).toContain('1. Block index 0 (starts at line 6)');
    expect(prompt).toContain('2. Block index 1 (starts at line 12)');
    expect(prompt).toContain('Parse error: Invalid class diagram syntax');
  });
});

describe('stripRepairResponse', () => {
  it('returns raw responses unchanged', () => {
    const content = '# Widget Design\n\nFixed diagram content.';

    expect(stripRepairResponse(content)).toBe(content);
  });

  it('unwraps a single outer markdown fence', () => {
    const content = [
      '```markdown',
      '# Widget Design',
      '',
      '```mermaid',
      'graph TD',
      '  A-->B',
      '```',
      '```',
    ].join('\n');

    expect(stripRepairResponse(content)).toBe([
      '# Widget Design',
      '',
      '```mermaid',
      'graph TD',
      '  A-->B',
      '```',
    ].join('\n'));
  });

  it('unwraps a single outer fence without a language tag', () => {
    const content = '```\n# Widget Design\n```';

    expect(stripRepairResponse(content)).toBe('# Widget Design');
  });

  it('preserves leading and trailing whitespace when no outer fence is present', () => {
    const content = '  # Widget Design\n';

    expect(stripRepairResponse(content)).toBe(content);
  });
});
