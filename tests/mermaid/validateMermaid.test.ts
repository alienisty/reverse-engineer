import { describe, expect, it } from '@jest/globals';
import { validateDiagram } from '../../src/mermaid/validateMermaid.js';

describe('validateDiagram', () => {
  it('accepts known-good flowchart syntax', async () => {
    const result = await validateDiagram('graph TD;\n  A-->B');

    expect(result).toEqual({ valid: true });
  });

  it('rejects incomplete edge syntax with a stable error message', async () => {
    const result = await validateDiagram('graph TD;\n  A-->');

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(/parse error/i);
    }
  });

  it('rejects unclosed subgraph syntax', async () => {
    const result = await validateDiagram('graph TD\n  subgraph foo');

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('rejects class-diagram composition edges in a flowchart', async () => {
    const result = await validateDiagram('graph TD\n  A *-- B');

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(/parse error/i);
    }
  });
});
