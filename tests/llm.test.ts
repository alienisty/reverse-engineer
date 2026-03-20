import {
  CONTEXT_CLASSIFICATION_SYSTEM_PROMPT,
  DESIGN_REVISION_SYSTEM_PROMPT,
  DESIGN_REVIEW_SYSTEM_PROMPT,
  LLMService,
  MERMAID_REPAIR_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  collectStreamedContent,
  type LLMStreamChunk,
  type LLMTransport
} from '../src/llm.js';
import { jest } from '@jest/globals';

async function* createStream(...chunks: LLMStreamChunk[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe('collectStreamedContent', () => {
  it('joins streamed content fragments into a single document', async () => {
    const result = await collectStreamedContent(createStream(
      { choices: [{ delta: { content: 'Mocked ' } }] },
      { choices: [{ delta: { content: 'design ' } }] },
      { choices: [{ delta: { content: 'document' } }] }
    ));

    expect(result).toBe('Mocked design document');
  });

  it('preserves literal thought tags in model output', async () => {
    const result = await collectStreamedContent(createStream(
      { choices: [{ delta: { content: 'Here is literal XML: ' } }] },
      { choices: [{ delta: { content: '</thought>' } }] },
      { choices: [{ delta: { content: ' kept in the final doc.' } }] }
    ));

    expect(result).toBe('Here is literal XML: </thought> kept in the final doc.');
  });

  it('ignores chunks without text content', async () => {
    const result = await collectStreamedContent(createStream(
      {},
      { choices: [] },
      { choices: [{ delta: {} }] },
      { choices: [{ delta: { content: null } }] },
      { choices: [{ delta: { content: 'kept' } }] }
    ));

    expect(result).toBe('kept');
  });
});

describe('LLMService', () => {
  it('requests a streamed completion from the transport', async () => {
    const mockTransport: LLMTransport = {
      streamDesignDocument: jest.fn<any>().mockResolvedValue(createStream(
        { choices: [{ delta: { content: 'Mocked ' } }] },
        { choices: [{ delta: { content: 'design ' } }] },
        { choices: [{ delta: { content: 'document' } }] }
      )),
      streamMermaidRepair: jest.fn<any>(),
      streamDesignReview: jest.fn<any>(),
      streamDesignRevision: jest.fn<any>(),
      streamContextClassification: jest.fn<any>(),
    };

    const service = new LLMService(
      { baseUrl: 'http://localhost', apiKey: 'test-key', model: 'gpt-4' },
      undefined,
      mockTransport
    );

    const result = await service.generateDesignDocument('Analyze this code.');

    expect(result).toBe('Mocked design document');
    expect(mockTransport.streamDesignDocument).toHaveBeenCalledWith({
      model: 'gpt-4',
      prompt: 'Analyze this code.',
      systemPrompt: SYSTEM_PROMPT
    });
  });

  it('requests mermaid repair from the transport with the repair system prompt', async () => {
    const mockTransport: LLMTransport = {
      streamDesignDocument: jest.fn<any>(),
      streamMermaidRepair: jest.fn<any>().mockResolvedValue(createStream(
        { choices: [{ delta: { content: 'Repaired ' } }] },
        { choices: [{ delta: { content: 'design document' } }] }
      )),
      streamDesignReview: jest.fn<any>(),
      streamDesignRevision: jest.fn<any>(),
      streamContextClassification: jest.fn<any>(),
    };

    const service = new LLMService(
      { baseUrl: 'http://localhost', apiKey: 'test-key', model: 'gpt-4' },
      undefined,
      mockTransport
    );

    const result = await service.repairDesignMermaid('Fix the invalid mermaid blocks.');

    expect(result).toBe('Repaired design document');
    expect(mockTransport.streamMermaidRepair).toHaveBeenCalledWith({
      model: 'gpt-4',
      prompt: 'Fix the invalid mermaid blocks.',
      systemPrompt: MERMAID_REPAIR_SYSTEM_PROMPT
    });
  });

  it('requests design review from the transport with the review system prompt', async () => {
    const mockTransport: LLMTransport = {
      streamDesignDocument: jest.fn<any>(),
      streamMermaidRepair: jest.fn<any>(),
      streamDesignReview: jest.fn<any>().mockResolvedValue(createStream(
        { choices: [{ delta: { content: '## Coverage Check\n' } }] },
        { choices: [{ delta: { content: 'STATUS: COMPLETE' } }] }
      )),
      streamDesignRevision: jest.fn<any>()
    };

    const service = new LLMService(
      { baseUrl: 'http://localhost', apiKey: 'test-key', model: 'gpt-4' },
      undefined,
      mockTransport
    );

    const result = await service.reviewDesignDocument('Review this design.');

    expect(result).toBe('## Coverage Check\nSTATUS: COMPLETE');
    expect(mockTransport.streamDesignReview).toHaveBeenCalledWith({
      model: 'gpt-4',
      prompt: 'Review this design.',
      systemPrompt: DESIGN_REVIEW_SYSTEM_PROMPT
    });
  });

  it('requests design revision from the transport with the revision system prompt', async () => {
    const mockTransport: LLMTransport = {
      streamDesignDocument: jest.fn<any>(),
      streamMermaidRepair: jest.fn<any>(),
      streamDesignReview: jest.fn<any>(),
      streamDesignRevision: jest.fn<any>().mockResolvedValue(createStream(
        { choices: [{ delta: { content: '# Revised ' } }] },
        { choices: [{ delta: { content: 'Design' } }] }
      )),
      streamContextClassification: jest.fn<any>(),
    };

    const service = new LLMService(
      { baseUrl: 'http://localhost', apiKey: 'test-key', model: 'gpt-4' },
      undefined,
      mockTransport
    );

    const result = await service.reviseDesignDocument('Revise ## Component Design only.');

    expect(result).toBe('# Revised Design');
    expect(mockTransport.streamDesignRevision).toHaveBeenCalledWith({
      model: 'gpt-4',
      prompt: 'Revise ## Component Design only.',
      systemPrompt: DESIGN_REVISION_SYSTEM_PROMPT
    });
  });

  it('requests context classification from the transport with the classification system prompt', async () => {
    const mockTransport: LLMTransport = {
      streamDesignDocument: jest.fn<any>(),
      streamMermaidRepair: jest.fn<any>(),
      streamDesignReview: jest.fn<any>(),
      streamDesignRevision: jest.fn<any>(),
      streamContextClassification: jest.fn<any>().mockResolvedValue(createStream(
        { choices: [{ delta: { content: 'src/Dep.ts' } }] },
      )),
    };

    const service = new LLMService(
      { baseUrl: 'http://localhost', apiKey: 'test-key', model: 'gpt-4' },
      undefined,
      mockTransport,
    );

    const result = await service.classifyDependencies('Classify dependency candidates.');

    expect(result).toBe('src/Dep.ts');
    expect(mockTransport.streamContextClassification).toHaveBeenCalledWith({
      model: 'gpt-4',
      prompt: 'Classify dependency candidates.',
      systemPrompt: CONTEXT_CLASSIFICATION_SYSTEM_PROMPT,
    });
  });
});
