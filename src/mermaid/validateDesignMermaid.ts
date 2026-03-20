import { extractMermaidBlocks } from './extractMermaidBlocks.js';
import { validateDiagram } from './validateMermaid.js';

export interface MermaidValidationFailure {
  blockIndex: number;
  line: number;
  source: string;
  error: string;
}

export interface MermaidValidationResult {
  valid: boolean;
  failures: MermaidValidationFailure[];
}

export type MermaidDiagramValidator = typeof validateDiagram;

export async function validateDesignMermaid(
  design: string,
  validateFn: MermaidDiagramValidator = validateDiagram,
): Promise<MermaidValidationResult> {
  const blocks = extractMermaidBlocks(design);
  const failures: MermaidValidationFailure[] = [];

  for (const block of blocks) {
    const result = await validateFn(block.source);
    if (!result.valid) {
      failures.push({
        blockIndex: block.index,
        line: block.line,
        source: block.source,
        error: result.error,
      });
    }
  }

  return {
    valid: failures.length === 0,
    failures,
  };
}
