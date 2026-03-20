import { describe, it, expect, jest } from '@jest/globals';
import { DiscoveryService } from '../../src/discovery.js';
import { PromptBuilder } from '../../src/promptBuilder.js';
import type { ContextMap } from '../../src/types/context.js';
import * as fs from 'node:fs';

describe('Integration: Discovery and Prompt Generation', () => {
  it('should discover context and build a structured prompt', async () => {
    const mockLsp = {
      sendRequest: jest.fn<any>().mockResolvedValue(null),
      getSemanticTokensLegend: jest.fn<any>().mockReturnValue({ tokenTypes: [], tokenModifiers: [] }),
    } as any;

    const mockFs = {
      existsSync: jest.fn().mockReturnValue(true),
      readFileSync: jest.fn().mockReturnValue('file content'),
    } as any;

    const discoveryService = new DiscoveryService(mockLsp, {
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' },
    });
    const promptBuilder = new PromptBuilder(mockFs);

    const contextMap: ContextMap = {
      main: ['main.ts'],
      dependencies: ['ref.ts'],
      uses: [],
    };

    const prompt = promptBuilder.buildPrompt(contextMap);

    expect(prompt).toContain('## Main');
    expect(prompt).toContain('## Dependencies');
    expect(prompt).toContain('## Uses');
    expect(prompt).not.toContain('## References');
    expect(prompt).toContain('Core design subject');
    expect(prompt).toContain('Implementation context');
    expect(prompt).toContain('Read-only evidence');
    expect(prompt).toContain('file content');
  });
});
