import { describe, expect, it } from '@jest/globals';
import { validateDesignMermaid } from '../../src/mermaid/validateDesignMermaid.js';
import type { MermaidDiagramValidationResult } from '../../src/mermaid/validateMermaid.js';

describe('validateDesignMermaid', () => {
  it('reports valid when all extracted blocks pass validation', async () => {
    const design = [
      '# Design',
      '',
      '```mermaid',
      'graph TD',
      '  A-->B',
      '```',
    ].join('\n');

    const validateFn = async (): Promise<MermaidDiagramValidationResult> => ({ valid: true });

    const result = await validateDesignMermaid(design, validateFn);

    expect(result.valid).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('reports a single failure with block metadata', async () => {
    const design = [
      '# Design',
      '',
      '```mermaid',
      'graph TD',
      '  A-->',
      '```',
    ].join('\n');

    const validateFn = async (source: string): Promise<MermaidDiagramValidationResult> =>
      source.includes('A-->') && !source.includes('A-->B')
        ? { valid: false, error: 'Invalid flowchart diagram syntax' }
        : { valid: true };

    const result = await validateDesignMermaid(design, validateFn);

    expect(result.valid).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toEqual({
      blockIndex: 0,
      line: 3,
      source: 'graph TD\n  A-->\n',
      error: 'Invalid flowchart diagram syntax',
    });
  });

  it('reports multiple failures across blocks', async () => {
    const design = [
      '```mermaid',
      'graph TD',
      '  A-->',
      '```',
      '',
      '```mermaid',
      'graph TD',
      '  subgraph x',
      '```',
    ].join('\n');

    const validateFn = async (source: string): Promise<MermaidDiagramValidationResult> =>
      source.includes('A-->') || source.includes('subgraph x')
        ? { valid: false, error: `Invalid diagram: ${source.trim()}` }
        : { valid: true };

    const result = await validateDesignMermaid(design, validateFn);

    expect(result.valid).toBe(false);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0]?.blockIndex).toBe(0);
    expect(result.failures[0]?.line).toBe(1);
    expect(result.failures[1]?.blockIndex).toBe(1);
    expect(result.failures[1]?.line).toBe(6);
  });

  it('validates real mermaid blocks with the official mermaid parser', async () => {
    const design = [
      '```mermaid',
      'graph TD',
      '  A-->B',
      '```',
      '',
      '```mermaid',
      'graph TD',
      '  A-->',
      '```',
    ].join('\n');

    const result = await validateDesignMermaid(design);

    expect(result.valid).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.blockIndex).toBe(1);
    expect(result.failures[0]?.error).toMatch(/parse error/i);
  });

  it('flags class-diagram edge syntax used in a flowchart as invalid', async () => {
    const design = [
      '```mermaid',
      'graph TD',
      '    BaseQueue[Service]',
      '    Debouncer[Worker]',
      '    BaseQueue *-- Debouncer',
      '```',
    ].join('\n');

    const result = await validateDesignMermaid(design);

    expect(result.valid).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.source).toContain('BaseQueue *-- Debouncer');
    expect(result.failures[0]?.error).toMatch(/parse error/i);
  });

  it('validates every block in a multi-diagram design', async () => {
    const design = [
      '```mermaid',
      'graph TD',
      '    A-->B',
      '```',
      '',
      '```mermaid',
      'classDiagram',
      '    class Foo',
      '```',
      '',
      '```mermaid',
      'sequenceDiagram',
      '    Alice->>Bob: hi',
      '```',
      '',
      '```mermaid',
      'stateDiagram-v2',
      '    [*] --> Idle',
      '```',
    ].join('\n');

    const result = await validateDesignMermaid(design);

    expect(result.valid).toBe(true);
    expect(result.failures).toHaveLength(0);
  });
});
