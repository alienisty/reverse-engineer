import { Orchestrator } from '../src/orchestrator.js';
import { describe, it, expect, jest } from '@jest/globals';
import * as path from 'node:path';
import { buildMinimalDesign } from './review/fixtures/minimalDesign.js';
import { extractCoverageChecklist } from '../src/review/extractCoverageChecklist.js';
import type { CoverageChecklistItem } from '../src/review/types.js';
import type { ProgressLogger } from '../src/progressLogger.js';

jest.mock('../src/lspManager.js');
jest.mock('../src/llm.js');
jest.mock('../src/discovery.js');
jest.mock('../src/promptBuilder.js');

function passthroughMermaidPostProcessor() {
  return {
    postProcess: jest.fn<any>().mockImplementation(async (designDoc: string) => designDoc),
  };
}

function buildContextChecklist(
  context: { main: string[]; dependencies: string[]; uses: string[] },
  pwd: string,
): CoverageChecklistItem[] {
  return extractCoverageChecklist(context, pwd);
}

function buildReviewResponse(
  checklist: CoverageChecklistItem[],
  options: { status: 'COMPLETE' | 'NEEDS_REVISION'; uncoveredIds?: string[] },
): string {
  const uncovered = new Set(options.uncoveredIds ?? []);
  const lines = checklist.map((item) => {
    const covered = options.status === 'COMPLETE' ? true : !uncovered.has(item.id);
    const marker = covered ? 'x' : ' ';
    return `- [${marker}] ${item.id} — ${item.label}`;
  });

  return [
    '## Coverage Check',
    ...lines,
    '',
    '## Review Result',
    `STATUS: ${options.status}`,
    '',
    '## Feedback Items',
    '(none)',
  ].join('\n');
}

function buildCompleteReviewResponse(checklist: CoverageChecklistItem[]): string {
  return buildReviewResponse(checklist, { status: 'COMPLETE' });
}

function buildNeedsRevisionResponse(checklist: CoverageChecklistItem[]): string {
  const firstMainId = checklist.find((item) => item.category === 'main' && item.id.startsWith('main:'))?.id;
  return buildReviewResponse(checklist, {
    status: 'NEEDS_REVISION',
    uncoveredIds: firstMainId ? [firstMainId] : [],
  });
}

const REVISED_DESIGN = buildMinimalDesign({
  'Component Design':
    'Updated component design details after review. Service behavior in service.ts integrates with type.ts.',
});

function buildMockFs() {
  return {
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn().mockReturnValue('export class Service {}'),
  } as any;
}

const DESIGN_WITH_TERMS = '# Design Doc\nService handles service.ts and type.ts references.\n';

function buildNoPromotionClassificationResponse(): string {
  return '';
}

function withClassificationMock(
  mockLlm: Record<string, unknown>,
  discoveryContext: { main: string[]; dependencies: string[]; uses: string[] },
  pwd: string,
): Record<string, unknown> {
  if (discoveryContext.dependencies.length === 0) {
    return mockLlm;
  }

  return {
    ...mockLlm,
    classifyDependencies: jest
      .fn<any>()
      .mockResolvedValue(
        buildNoPromotionClassificationResponse(),
      ),
  };
}

function captureProgressLogger(): { logger: ProgressLogger; messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    logger: {
      info: (message) => messages.push(message),
      warn: (message) => messages.push(`WARN:${message}`),
    },
  };
}

describe('Orchestrator', () => {
  it('logs progress for each pipeline step', async () => {
    const mockLoadLSPConfig = jest.fn().mockReturnValue({
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' },
    });

    const mockLsp = {
      startServer: jest.fn<any>().mockResolvedValue(undefined),
      shutdown: jest.fn<any>(),
    } as any;

    const discoveryContext = {
      main: ['service.ts'],
      dependencies: ['type.ts'],
      uses: ['consumer.ts'],
    };
    const checklist = buildContextChecklist(discoveryContext, '.');

    const mockLlm = withClassificationMock(
      {
        model: 'test-model',
        generateDesignDocument: jest.fn<any>().mockResolvedValue(DESIGN_WITH_TERMS),
        reviewDesignDocument: jest
          .fn<any>()
          .mockResolvedValue(buildCompleteReviewResponse(checklist)),
        reviseDesignDocument: jest.fn<any>().mockResolvedValue(REVISED_DESIGN),
      },
      discoveryContext,
      '.',
    ) as any;

    const mockDiscovery = {
      discoverContext: (jest.fn() as any).mockResolvedValue(discoveryContext),
    } as any;

    const mockPromptBuilder = {
      buildPrompt: jest.fn().mockReturnValue('Prompt'),
    } as any;

    const { logger, messages } = captureProgressLogger();

    const orchestrator = new Orchestrator(
      mockLsp,
      mockLlm,
      mockDiscovery,
      mockPromptBuilder,
      passthroughMermaidPostProcessor(),
      buildMockFs() as any,
      mockLoadLSPConfig as any,
      logger,
    );

    await orchestrator.run({
      name: 'test-project',
      files: ['service.ts'],
      pwd: '.',
    });

    expect(messages[0]).toBe('Starting design generation for project "test-project"');
    expect(messages).toEqual(
      expect.arrayContaining([
        'Detecting languages from 1 input file(s)',
        'Detected language(s): typescript',
        'Starting LSP server: typescript',
        'Discovering workspace context',
        'Discovery complete: 1 main, 1 dependencies, 1 uses',
        'Classifying dependencies for promotion to main',
        'Context classification: promoted 0 of 1 dependencies to main',
        'Context map after classification: 1 main, 1 dependencies, 1 uses',
        'Building generation prompt',
        'Generating design document (LLM)',
        'Post-processing Mermaid diagrams',
        expect.stringMatching(/^Writing artifacts to /),
        'Starting design review',
        'Wrote design.test-model.md',
        'Design generation finished for project "test-project"',
        'Shutting down language servers',
      ]),
    );
    expect(messages[messages.length - 1]).toBe('Shutting down language servers');
  });

  it('should orchestrate the design doc generation', async () => {
    const mockLoadLSPConfig = jest.fn().mockReturnValue({
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' }
    });

    const mockLsp = {
      startServer: jest.fn<any>().mockResolvedValue(undefined),
      shutdown: jest.fn<any>(),
    } as any;

    const discoveryContext = {
      main: ['service.ts'],
      dependencies: ['type.ts'],
      uses: [],
    };
    const checklist = buildContextChecklist(discoveryContext, '.');

    const mockLlm = withClassificationMock(
      {
        model: 'test-model',
        generateDesignDocument: jest.fn<any>().mockResolvedValue(DESIGN_WITH_TERMS),
        reviewDesignDocument: jest.fn<any>().mockResolvedValue(buildCompleteReviewResponse(checklist)),
        reviseDesignDocument: jest.fn<any>().mockResolvedValue(REVISED_DESIGN),
      },
      discoveryContext,
      '.',
    ) as any;

    const mockDiscovery = {
        discoverContext: (jest.fn() as any).mockResolvedValue(discoveryContext),
    } as any;

    const mockPromptBuilder = {
        buildPrompt: jest.fn().mockReturnValue('Prompt'),
    } as any;
    
    const mockFs = buildMockFs();

    const mockMermaidPostProcessor = passthroughMermaidPostProcessor();

    const orchestrator = new Orchestrator(
      mockLsp,
      mockLlm,
      mockDiscovery,
      mockPromptBuilder,
      mockMermaidPostProcessor,
      mockFs as any,
      mockLoadLSPConfig as any,
    );
    await orchestrator.run({
      name: 'test-project',
      files: ['service.ts'],
      pwd: '.',
    });

    expect(mockLsp.startServer).toHaveBeenCalledWith('typescript', '.');
    expect(mockPromptBuilder.buildPrompt).toHaveBeenCalled();
    expect(mockLlm.generateDesignDocument).toHaveBeenCalled();
    expect(mockLlm.reviewDesignDocument).toHaveBeenCalledTimes(1);
    expect(mockMermaidPostProcessor.postProcess).toHaveBeenCalledWith(DESIGN_WITH_TERMS, 'Prompt');
    
    const expectedOutputDir = path.resolve(process.cwd(), 'test-project');
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(expectedOutputDir, { recursive: true });
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join(expectedOutputDir, 'design.v0.test-model.md'),
      DESIGN_WITH_TERMS
    );
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join(expectedOutputDir, 'review.1.test-model.md'),
      buildCompleteReviewResponse(checklist)
    );
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join(expectedOutputDir, 'design.test-model.md'),
      DESIGN_WITH_TERMS
    );
    
    expect(mockLsp.shutdown).toHaveBeenCalled();
  });

  it('should post-process the design doc between generation and write', async () => {
    const mockLoadLSPConfig = jest.fn().mockReturnValue({
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' },
    });

    const mockLsp = {
      startServer: jest.fn<any>().mockResolvedValue(undefined),
      shutdown: jest.fn<any>(),
    } as any;

    const discoveryContext = {
      main: ['service.ts'],
      dependencies: [],
      uses: [],
    };
    const checklist = buildContextChecklist(discoveryContext, '.');

    const mockLlm = {
      model: 'test-model',
      generateDesignDocument: jest.fn<any>().mockResolvedValue(DESIGN_WITH_TERMS),
      reviewDesignDocument: jest.fn<any>().mockResolvedValue(buildCompleteReviewResponse(checklist)),
      reviseDesignDocument: jest.fn<any>().mockResolvedValue(REVISED_DESIGN),
    } as any;

    const mockDiscovery = {
      discoverContext: (jest.fn() as any).mockResolvedValue(discoveryContext),
    } as any;

    const mockPromptBuilder = {
      buildPrompt: jest.fn().mockReturnValue('Generation Prompt'),
    } as any;

    const mockMermaidPostProcessor = {
      postProcess: jest.fn<any>().mockResolvedValue('Repaired Design Doc service.ts type.ts Service'),
    };

    const mockFs = buildMockFs();

    const orchestrator = new Orchestrator(
      mockLsp,
      mockLlm,
      mockDiscovery,
      mockPromptBuilder,
      mockMermaidPostProcessor,
      mockFs as any,
      mockLoadLSPConfig as any,
    );

    await orchestrator.run({
      name: 'test-project',
      files: ['service.ts'],
      pwd: '.',
    });

    expect(mockLlm.generateDesignDocument).toHaveBeenCalledWith('Generation Prompt');
    expect(mockMermaidPostProcessor.postProcess).toHaveBeenCalledWith(
      DESIGN_WITH_TERMS,
      'Generation Prompt',
    );
    expect(mockMermaidPostProcessor.postProcess.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockLlm.generateDesignDocument.mock.invocationCallOrder[0],
    );

    const expectedOutputDir = path.resolve(process.cwd(), 'test-project');
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join(expectedOutputDir, 'design.test-model.md'),
      'Repaired Design Doc service.ts type.ts Service',
    );
  });

  it('should use pwd as the root for config resolution and output writing', async () => {
    const pwd = path.join(process.cwd(), 'target-workspace');
    const launcherOutputDir = path.resolve(process.cwd(), 'test-project');
    const expectedOutputDir = path.join(pwd, 'test-project');

    const mockLoadLSPConfig = jest.fn().mockReturnValue({
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' }
    });

    const mockLsp = {
      startServer: jest.fn<any>().mockResolvedValue(undefined),
      shutdown: jest.fn<any>(),
    } as any;

    const discoveryContext = {
      main: [path.join(pwd, 'service.ts')],
      dependencies: [path.join(pwd, 'type.ts')],
      uses: [],
    };
    const checklist = buildContextChecklist(discoveryContext, pwd);

    const mockLlm = withClassificationMock(
      {
        model: 'workspace-model',
        generateDesignDocument: jest.fn<any>().mockResolvedValue(DESIGN_WITH_TERMS),
        reviewDesignDocument: jest.fn<any>().mockResolvedValue(buildCompleteReviewResponse(checklist)),
        reviseDesignDocument: jest.fn<any>().mockResolvedValue(REVISED_DESIGN),
      },
      discoveryContext,
      pwd,
    ) as any;

    const mockDiscovery = {
      discoverContext: (jest.fn() as any).mockResolvedValue(discoveryContext),
    } as any;

    const mockPromptBuilder = {
      buildPrompt: jest.fn().mockReturnValue('Prompt'),
    } as any;

    const mockFs = buildMockFs();

    const orchestrator = new Orchestrator(
      mockLsp,
      mockLlm,
      mockDiscovery,
      mockPromptBuilder,
      passthroughMermaidPostProcessor(),
      mockFs as any,
      mockLoadLSPConfig as any
    );

    await orchestrator.run({
      name: 'test-project',
      files: ['service.ts'],
      pwd,
    });

    expect(mockLoadLSPConfig).toHaveBeenCalledWith(undefined, pwd);
    expect(expectedOutputDir).not.toBe(launcherOutputDir);
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(expectedOutputDir, { recursive: true });
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join(expectedOutputDir, 'design.workspace-model.md'),
      DESIGN_WITH_TERMS
    );
  });

  it('should write artifacts under output when provided', async () => {
    const pwd = path.join(process.cwd(), 'workspace');
    const outputRoot = path.join(process.cwd(), 'artifacts');
    const expectedOutputDir = path.join(outputRoot, 'test-project');

    const mockLoadLSPConfig = jest.fn().mockReturnValue({
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' }
    });

    const mockLsp = {
      startServer: jest.fn<any>().mockResolvedValue(undefined),
      shutdown: jest.fn<any>(),
    } as any;

    const discoveryContext = {
      main: ['service.ts'],
      dependencies: [],
      uses: [],
    };
    const checklist = buildContextChecklist(discoveryContext, pwd);

    const mockLlm = {
      model: 'gpt-4',
      generateDesignDocument: jest.fn<any>().mockResolvedValue(DESIGN_WITH_TERMS),
      reviewDesignDocument: jest.fn<any>().mockResolvedValue(buildCompleteReviewResponse(checklist)),
      reviseDesignDocument: jest.fn<any>().mockResolvedValue(REVISED_DESIGN),
    } as any;

    const mockDiscovery = {
      discoverContext: (jest.fn() as any).mockResolvedValue(discoveryContext),
    } as any;

    const mockPromptBuilder = {
      buildPrompt: jest.fn().mockReturnValue('Prompt'),
    } as any;

    const mockFs = buildMockFs();

    const orchestrator = new Orchestrator(
      mockLsp,
      mockLlm,
      mockDiscovery,
      mockPromptBuilder,
      passthroughMermaidPostProcessor(),
      mockFs as any,
      mockLoadLSPConfig as any
    );

    await orchestrator.run({
      name: 'test-project',
      files: ['service.ts'],
      pwd,
      output: outputRoot,
    });

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(expectedOutputDir, { recursive: true });
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join(expectedOutputDir, 'design.gpt-4.md'),
      DESIGN_WITH_TERMS
    );
  });

  it('should create a missing --output directory before writing artifacts', async () => {
    const outputRoot = path.join(process.cwd(), 'new-artifacts-root');

    const mockLoadLSPConfig = jest.fn().mockReturnValue({
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' },
    });

    const mockLsp = {
      startServer: jest.fn<any>().mockResolvedValue(undefined),
      shutdown: jest.fn<any>(),
    } as any;

    const mockLlm = {
      model: 'gpt-4',
      generateDesignDocument: jest.fn<any>().mockResolvedValue(DESIGN_WITH_TERMS),
      reviewDesignDocument: jest.fn<any>().mockResolvedValue(buildCompleteReviewResponse([])),
      reviseDesignDocument: jest.fn<any>().mockResolvedValue(REVISED_DESIGN),
    } as any;

    const mockDiscovery = {
      discoverContext: (jest.fn() as any).mockResolvedValue({ main: [], dependencies: [], uses: [] }),
    } as any;

    const mockPromptBuilder = {
      buildPrompt: jest.fn().mockReturnValue('Prompt'),
    } as any;

    const mockFs = buildMockFs();

    const orchestrator = new Orchestrator(
      mockLsp,
      mockLlm,
      mockDiscovery,
      mockPromptBuilder,
      passthroughMermaidPostProcessor(),
      mockFs as any,
      mockLoadLSPConfig as any
    );

    await orchestrator.run({
      name: 'my-design',
      files: ['service.ts'],
      pwd: process.cwd(),
      output: outputRoot,
    });

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(
      path.join(outputRoot, 'my-design'),
      { recursive: true }
    );
  });

  it('should persist review and revision artifacts for each round', async () => {
    const mockLoadLSPConfig = jest.fn().mockReturnValue({
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' },
    });

    const mockLsp = {
      startServer: jest.fn<any>().mockResolvedValue(undefined),
      shutdown: jest.fn<any>(),
    } as any;

    const discoveryContext = {
      main: ['service.ts'],
      dependencies: [],
      uses: [],
    };
    const checklist = buildContextChecklist(discoveryContext, '.');

    const mockLlm = {
      model: 'test-model',
      generateDesignDocument: jest.fn<any>().mockResolvedValue(DESIGN_WITH_TERMS),
      reviewDesignDocument: jest
        .fn<any>()
        .mockResolvedValueOnce(buildNeedsRevisionResponse(checklist))
        .mockResolvedValueOnce(buildCompleteReviewResponse(checklist)),
      reviseDesignDocument: jest.fn<any>().mockResolvedValue(REVISED_DESIGN),
    } as any;

    const mockDiscovery = {
      discoverContext: (jest.fn() as any).mockResolvedValue(discoveryContext),
    } as any;

    const mockPromptBuilder = {
      buildPrompt: jest.fn().mockReturnValue('Prompt'),
    } as any;

    const revisedAndPostProcessed = REVISED_DESIGN;
    const mockMermaidPostProcessor = {
      postProcess: jest
        .fn<any>()
        .mockResolvedValueOnce(DESIGN_WITH_TERMS)
        .mockResolvedValue(revisedAndPostProcessed),
    };

    const mockFs = buildMockFs();

    const orchestrator = new Orchestrator(
      mockLsp,
      mockLlm,
      mockDiscovery,
      mockPromptBuilder,
      mockMermaidPostProcessor,
      mockFs as any,
      mockLoadLSPConfig as any
    );

    await orchestrator.run({
      name: 'test-project',
      files: ['service.ts'],
      pwd: '.',
    });

    const expectedOutputDir = path.resolve(process.cwd(), 'test-project');
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join(expectedOutputDir, 'review.1.test-model.md'),
      buildNeedsRevisionResponse(checklist)
    );
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join(expectedOutputDir, 'review.2.test-model.md'),
      buildCompleteReviewResponse(checklist)
    );
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join(expectedOutputDir, 'design.v1.test-model.md'),
      revisedAndPostProcessed
    );
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join(expectedOutputDir, 'design.test-model.md'),
      revisedAndPostProcessed
    );
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join(expectedOutputDir, 'review-prompt.1.test-model.md'),
      expect.stringMatching(/Review the design document/s),
    );
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join(expectedOutputDir, 'revision-prompt.1.test-model.md'),
      expect.stringMatching(/revis(e|ing) a reverse-engineered design/i),
    );
  });

  it('promotes classified dependencies before building the generation prompt', async () => {
    const pwd = path.join(process.cwd(), 'classify-workspace');
    const queuePath = path.join(pwd, 'concurrent/Queue.java');
    const requestPath = path.join(pwd, 'concurrent/Request.java');
    const genericPath = path.join(pwd, 'util/Generic.java');
    const discoveryContext = {
      main: [queuePath],
      dependencies: [requestPath, genericPath],
      uses: [requestPath],
    };
    const classifiedContext = {
      main: [queuePath, requestPath],
      dependencies: [genericPath],
      uses: [],
    };
    const checklist = buildContextChecklist(classifiedContext, pwd);

    const mockLoadLSPConfig = jest.fn().mockReturnValue({
      servers: { java: { command: 'jdtls', args: [] } },
      extensions: { java: 'java' },
    });

    const mockLsp = {
      startServer: jest.fn<any>().mockResolvedValue(undefined),
      shutdown: jest.fn<any>(),
    } as any;

    const mockLlm = {
      model: 'test-model',
      classifyDependencies: jest.fn<any>().mockResolvedValue('concurrent/Request.java'),
      generateDesignDocument: jest.fn<any>().mockResolvedValue(DESIGN_WITH_TERMS),
      reviewDesignDocument: jest.fn<any>().mockResolvedValue(buildCompleteReviewResponse(checklist)),
      reviseDesignDocument: jest.fn<any>().mockResolvedValue(REVISED_DESIGN),
    } as any;

    const mockDiscovery = {
      discoverContext: jest.fn<any>().mockResolvedValue(discoveryContext),
    } as any;

    const mockPromptBuilder = {
      buildPrompt: jest.fn().mockReturnValue('Prompt'),
    } as any;

    const mockFs = buildMockFs();

    const orchestrator = new Orchestrator(
      mockLsp,
      mockLlm,
      mockDiscovery,
      mockPromptBuilder,
      passthroughMermaidPostProcessor(),
      mockFs as any,
      mockLoadLSPConfig as any,
    );

    await orchestrator.run({
      name: 'test-project',
      files: ['concurrent/Queue.java'],
      pwd,
    });

    expect(mockLlm.classifyDependencies).toHaveBeenCalledTimes(1);
    expect(mockPromptBuilder.buildPrompt).toHaveBeenCalledWith(classifiedContext);
    expect(mockLlm.reviewDesignDocument).toHaveBeenCalled();
  });
});
