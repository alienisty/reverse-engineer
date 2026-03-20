import { extractMermaidBlocks } from '../mermaid/extractMermaidBlocks.js';
import { REQUIRED_DESIGN_SECTIONS, splitDesignSections } from './designSections.js';

export const MIN_DESIGN_LENGTH_FLOOR = 500;

export interface ValidateDesignStructureInput {
  original: string;
  revised: string;
}

export interface ValidateDesignStructureResult {
  errors: string[];
}

const TITLE_PATTERN = /^#\s+.+/m;

export function validateDesignStructure(input: ValidateDesignStructureInput): ValidateDesignStructureResult {
  const errors: string[] = [];
  const { original, revised } = input;

  if (revised.trim().length === 0) {
    errors.push('Revised design is empty');
  }

  if (!TITLE_PATTERN.test(revised)) {
    errors.push('Revised design must include a markdown title (# Heading)');
  }

  const revisedSections = splitDesignSections(revised);
  for (const section of REQUIRED_DESIGN_SECTIONS) {
    if (!revisedSections.has(section)) {
      errors.push(`Missing required section: ## ${section}`);
    }
  }

  const minimumLength = Math.max(MIN_DESIGN_LENGTH_FLOOR, Math.floor(original.length * 0.5));
  if (revised.length < minimumLength) {
    errors.push(`Revised design is too short (${revised.length} chars; minimum ${minimumLength})`);
  }

  const originalMermaidCount = extractMermaidBlocks(original).length;
  const revisedMermaidCount = extractMermaidBlocks(revised).length;
  if (revisedMermaidCount < originalMermaidCount) {
    errors.push(
      `Revised design has fewer mermaid blocks (${revisedMermaidCount}) than the original (${originalMermaidCount})`,
    );
  }

  return { errors };
}
