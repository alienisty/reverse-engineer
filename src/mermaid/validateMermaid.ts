import type { Mermaid } from 'mermaid';
import { ensureMermaidDom } from './setupMermaidDom.js';

export type MermaidDiagramValidationResult =
  | { valid: true }
  | { valid: false; error: string };

let mermaidModule: Mermaid | undefined;

async function getMermaid(): Promise<Mermaid> {
  await ensureMermaidDom();
  if (!mermaidModule) {
    mermaidModule = (await import('mermaid')).default;
    mermaidModule.initialize({ startOnLoad: false });
  }
  return mermaidModule;
}

async function errorMessageFromParse(mermaid: Mermaid, source: string): Promise<string> {
  try {
    await mermaid.parse(source);
  } catch (error: unknown) {
    return error instanceof Error ? error.message : 'Invalid Mermaid diagram syntax';
  }

  return 'Invalid Mermaid diagram syntax';
}

export async function validateDiagram(
  source: string,
): Promise<MermaidDiagramValidationResult> {
  const mermaid = await getMermaid();

  try {
    const result = await mermaid.parse(source, { suppressErrors: true });
    if (result !== false) {
      return { valid: true };
    }

    return { valid: false, error: await errorMessageFromParse(mermaid, source) };
  } catch (error: unknown) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid Mermaid diagram syntax',
    };
  }
}
