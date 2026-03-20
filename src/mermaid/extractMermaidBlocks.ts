const MERMAID_FENCE_PATTERN = /```mermaid\s*\n([\s\S]*?)```/g;

export interface MermaidBlock {
  index: number;
  start: number;
  end: number;
  source: string;
  line: number;
}

function lineNumberAt(design: string, offset: number): number {
  return (design.slice(0, offset).match(/\n/g) ?? []).length + 1;
}

export function extractMermaidBlocks(design: string): MermaidBlock[] {
  const blocks: MermaidBlock[] = [];
  let match: RegExpExecArray | null;

  MERMAID_FENCE_PATTERN.lastIndex = 0;
  while ((match = MERMAID_FENCE_PATTERN.exec(design)) !== null) {
    const fullMatch = match[0];
    const source = match[1] ?? '';
    const start = match.index;
    blocks.push({
      index: blocks.length,
      start,
      end: start + fullMatch.length,
      source,
      line: lineNumberAt(design, start),
    });
  }

  return blocks;
}
