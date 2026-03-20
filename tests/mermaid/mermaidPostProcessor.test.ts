import { describe, expect, it, jest } from '@jest/globals';
import { MermaidPostProcessor } from '../../src/mermaid/mermaidPostProcessor.js';
import type { MermaidValidationFailure, MermaidValidationResult } from '../../src/mermaid/validateDesignMermaid.js';

const generationPrompt = '## Main\nservice.ts';

function invalidResult(failures: MermaidValidationFailure[] = [
  {
    blockIndex: 0,
    line: 3,
    source: 'graph TD\n  A-->\n',
    error: 'Invalid flowchart diagram syntax',
  },
]): MermaidValidationResult {
  return { valid: false, failures };
}

describe('MermaidPostProcessor', () => {
  it('returns the design unchanged when all diagrams are valid', async () => {
    const designDoc = '# Design\n\nValid content.';
    const repairDesignMermaid = jest.fn<any>();
    const validateDesignMermaid = jest.fn<any>().mockResolvedValue({ valid: true, failures: [] });

    const processor = new MermaidPostProcessor({
      llmService: { repairDesignMermaid },
      validateDesignMermaid,
    });

    const result = await processor.postProcess(designDoc, generationPrompt);

    expect(result).toBe(designDoc);
    expect(repairDesignMermaid).not.toHaveBeenCalled();
    expect(validateDesignMermaid).toHaveBeenCalledTimes(1);
    expect(validateDesignMermaid).toHaveBeenCalledWith(designDoc);
  });

  it('repairs once when the first validation fails and the second succeeds', async () => {
    const designDoc = '# Design\n\n```mermaid\ngraph TD\n  A-->\n```';
    const repairedDoc = '# Design\n\n```mermaid\ngraph TD\n  A-->B\n```';
    const repairDesignMermaid = jest.fn<any>().mockResolvedValue(repairedDoc);
    const validateDesignMermaid = jest
      .fn<any>()
      .mockResolvedValueOnce(invalidResult())
      .mockResolvedValueOnce({ valid: true, failures: [] });

    const processor = new MermaidPostProcessor({
      llmService: { repairDesignMermaid },
      validateDesignMermaid,
    });

    const result = await processor.postProcess(designDoc, generationPrompt);

    expect(result).toBe(repairedDoc);
    expect(repairDesignMermaid).toHaveBeenCalledTimes(1);
    expect(repairDesignMermaid).toHaveBeenCalledWith(
      expect.stringContaining('## Reference context (source analysis prompt)'),
    );
    expect(repairDesignMermaid).toHaveBeenCalledWith(expect.stringContaining(generationPrompt));
    expect(repairDesignMermaid).toHaveBeenCalledWith(expect.stringContaining(designDoc));
    expect(validateDesignMermaid).toHaveBeenCalledTimes(2);
    expect(validateDesignMermaid).toHaveBeenNthCalledWith(1, designDoc);
    expect(validateDesignMermaid).toHaveBeenNthCalledWith(2, repairedDoc);
  });

  it('attempts up to three repairs then logs warnings when diagrams stay invalid', async () => {
    const designDoc = '# Design\n\n```mermaid\ngraph TD\n  A-->\n```';
    const repairDesignMermaid = jest.fn<any>().mockResolvedValue(designDoc);
    const validateDesignMermaid = jest.fn<any>().mockResolvedValue(invalidResult());
    const warnings: string[] = [];

    const processor = new MermaidPostProcessor({
      llmService: { repairDesignMermaid },
      validateDesignMermaid,
      logWarning: (message) => warnings.push(message),
    });

    const result = await processor.postProcess(designDoc, generationPrompt);

    expect(result).toBe(designDoc);
    expect(repairDesignMermaid).toHaveBeenCalledTimes(3);
    expect(validateDesignMermaid).toHaveBeenCalledTimes(4);
    expect(warnings).toEqual([
      'Mermaid diagram at line 3 (block 0) remains invalid: Invalid flowchart diagram syntax',
    ]);
  });

  it('strips an outer markdown fence from the repair response', async () => {
    const designDoc = '# Design\n\n```mermaid\ngraph TD\n  A-->\n```';
    const repairedInner = '# Design\n\n```mermaid\ngraph TD\n  A-->B\n```';
    const fencedResponse = ['```markdown', repairedInner, '```'].join('\n');
    const repairDesignMermaid = jest.fn<any>().mockResolvedValue(fencedResponse);
    const validateDesignMermaid = jest
      .fn<any>()
      .mockResolvedValueOnce(invalidResult())
      .mockResolvedValueOnce({ valid: true, failures: [] });

    const processor = new MermaidPostProcessor({
      llmService: { repairDesignMermaid },
      validateDesignMermaid,
    });

    const result = await processor.postProcess(designDoc, generationPrompt);

    expect(result).toBe(repairedInner);
    expect(validateDesignMermaid).toHaveBeenNthCalledWith(2, repairedInner);
  });
});
