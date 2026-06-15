import { Orchestrator } from '../src/orchestrator.js';
import { describe, it, expect, jest } from '@jest/globals';
import { LSPManager } from '../src/lspManager.js';
import { LLMService } from '../src/llm.js';
import { DiscoveryService } from '../src/discovery.js';
import { PromptBuilder } from '../src/promptBuilder.js';

describe('Orchestrator Integration', () => {
  it('should shut down LSP manager even when LLM generation fails', async () => {
    const mockLsp = {
      startServer: (jest.fn() as any).mockResolvedValue(undefined),
      shutdown: jest.fn(),
    } as any;
    
    const mockLlm = {
      generateDesignDocument: (jest.fn() as any).mockRejectedValue(new Error('LLM Failed')),
    } as any;

    const mockDiscovery = {
        discoverImplementations: (jest.fn() as any).mockResolvedValue(['service.ts']),
        discoverContext: (jest.fn() as any).mockResolvedValue({ main: [], dependencies: [], uses: [] }),
    } as any;

    const mockPromptBuilder = {
        buildPrompt: jest.fn().mockReturnValue('Prompt'),
    } as any;
    
    const mockFs = {
        existsSync: jest.fn().mockReturnValue(true),
        mkdirSync: jest.fn(),
        writeFileSync: jest.fn(),
    };
    
    const mockLoadLSPConfig = jest.fn().mockReturnValue({
        servers: { typescript: { command: 'ts', args: [] } },
        extensions: { ts: 'typescript' }
    });

    const mockMermaidPostProcessor = {
      postProcess: jest.fn<any>(),
    };

    const orchestrator = new Orchestrator(
      mockLsp,
      mockLlm,
      mockDiscovery,
      mockPromptBuilder,
      mockMermaidPostProcessor,
      mockFs as any,
      mockLoadLSPConfig as any,
    );
    
    await expect(orchestrator.run({
      name: 'test-project',
      files: ['service.ts'],
      pwd: '.',
    })).rejects.toThrow('LLM Failed');

    expect(mockLsp.shutdown).toHaveBeenCalledTimes(1);
    expect(mockMermaidPostProcessor.postProcess).not.toHaveBeenCalled();
  });
});
