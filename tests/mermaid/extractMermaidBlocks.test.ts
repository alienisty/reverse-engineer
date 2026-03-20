import { describe, expect, it } from '@jest/globals';
import { extractMermaidBlocks } from '../../src/mermaid/extractMermaidBlocks.js';

describe('extractMermaidBlocks', () => {
  it('returns an empty array when no mermaid fences exist', () => {
    expect(extractMermaidBlocks('# Title\n\nSome prose.')).toEqual([]);
  });

  it('extracts a single block with index, offsets, source, and line', () => {
    const design = '# Design\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nFooter';
    const fence = '```mermaid\ngraph TD\n  A-->B\n```';
    const start = design.indexOf(fence);
    const blocks = extractMermaidBlocks(design);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      index: 0,
      start,
      end: start + fence.length,
      source: 'graph TD\n  A-->B\n',
      line: 3,
    });
  });

  it('extracts multiple blocks in document order', () => {
    const design = [
      'Intro',
      '',
      '```mermaid',
      'graph TD',
      '  A-->B',
      '```',
      '',
      'Middle text',
      '',
      '```mermaid',
      'sequenceDiagram',
      '  Alice->>Bob: hi',
      '```',
    ].join('\n');

    const blocks = extractMermaidBlocks(design);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.index).toBe(0);
    expect(blocks[0]?.line).toBe(3);
    expect(blocks[0]?.source).toBe('graph TD\n  A-->B\n');
    expect(blocks[1]?.index).toBe(1);
    expect(blocks[1]?.line).toBe(10);
    expect(blocks[1]?.source).toBe('sequenceDiagram\n  Alice->>Bob: hi\n');
    expect(blocks[0]?.end).toBeLessThan(blocks[1]?.start ?? 0);
  });

  it('handles an empty mermaid block', () => {
    const design = '```mermaid\n```';
    const blocks = extractMermaidBlocks(design);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.source).toBe('');
    expect(blocks[0]?.line).toBe(1);
  });

  it('preserves trailing newline inside the fence', () => {
    const design = '```mermaid\ngraph TD\nA-->B\n```';
    const blocks = extractMermaidBlocks(design);

    expect(blocks[0]?.source).toBe('graph TD\nA-->B\n');
  });

  it('ignores non-mermaid fenced code blocks', () => {
    const design = '```typescript\nconst x = 1;\n```\n\n```mermaid\ngraph TD\nA-->B\n```';
    const blocks = extractMermaidBlocks(design);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.source).toBe('graph TD\nA-->B\n');
    expect(blocks[0]?.line).toBe(5);
  });

  it('extracts multiple diagram types from a design-like document', () => {
    const design = [
      '# Architecture',
      '',
      '```mermaid',
      'graph TD',
      '    A[Service] --> B[Database]',
      '```',
      '',
      '## Class Diagram',
      '',
      '```mermaid',
      'classDiagram',
      '    class Foo',
      '```',
      '',
      '## Sequence',
      '',
      '```mermaid',
      'sequenceDiagram',
      '    Alice->>Bob: hello',
      '```',
      '',
      '## State',
      '',
      '```mermaid',
      'stateDiagram-v2',
      '    [*] --> Running',
      '```',
    ].join('\n');
    const blocks = extractMermaidBlocks(design);

    expect(blocks).toHaveLength(4);
    expect(blocks.map((block) => block.line)).toEqual([3, 10, 17, 24]);
    expect(blocks[0]?.source).toMatch(/^graph TD\n/);
    expect(blocks[0]?.source).toContain('A[Service]');
    expect(blocks[1]?.source).toMatch(/^classDiagram\n/);
    expect(blocks[2]?.source).toMatch(/^sequenceDiagram\n/);
    expect(blocks[3]?.source).toMatch(/^stateDiagram-v2\n/);
  });
});
