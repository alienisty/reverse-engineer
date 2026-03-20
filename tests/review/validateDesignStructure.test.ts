import { describe, expect, it } from '@jest/globals';
import { validateDesignStructure } from '../../src/review/validateDesignStructure.js';
import { buildMinimalDesign } from './fixtures/minimalDesign.js';

describe('validateDesignStructure', () => {
  const original = buildMinimalDesign();

  it('passes when revised design preserves structure and size', () => {
    const revised = buildMinimalDesign({
      'Component Design': 'Updated component details with additional implementation notes and diagrams.',
    });

    expect(validateDesignStructure({ original, revised }).errors).toEqual([]);
  });

  it('fails when revised design is empty', () => {
    expect(validateDesignStructure({ original, revised: '   ' }).errors).toContain(
      'Revised design is empty',
    );
  });

  it('fails when revised design has no title', () => {
    const revised = buildMinimalDesign().replace(/^# .+\n/m, '');

    expect(validateDesignStructure({ original, revised }).errors).toContain(
      'Revised design must include a markdown title (# Heading)',
    );
  });

  it('fails when a required section is missing', () => {
    const revised = buildMinimalDesign()
      .split('\n')
      .filter((line) => !line.startsWith('## Usage'))
      .join('\n');

    expect(validateDesignStructure({ original, revised }).errors).toContain(
      'Missing required section: ## Usage',
    );
  });

  it('fails when revised design is shorter than half the original', () => {
    const revised = '# Short\n\n## Overview\nTiny.';

    expect(validateDesignStructure({ original, revised }).errors.some((error) => error.includes('too short'))).toBe(
      true,
    );
  });

  it('fails when revised design has fewer mermaid blocks than the original', () => {
    const revised = buildMinimalDesign({
      Architecture: 'Architecture without diagrams.',
    });

    expect(validateDesignStructure({ original, revised }).errors).toContainEqual(
      expect.stringContaining('fewer mermaid blocks'),
    );
  });

  it('passes when mermaid block count matches the original', () => {
    const revised = buildMinimalDesign({
      Architecture: ['Updated architecture.', '```mermaid', 'graph LR', '  X-->Y', '```'].join('\n'),
    });

    expect(validateDesignStructure({ original, revised }).errors).toEqual([]);
  });
});
