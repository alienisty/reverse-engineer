import { LSPManager } from './lspManager.js';
import { LLMService, SYSTEM_PROMPT } from './llm.js';
import { DiscoveryService } from './discovery.js';
import { PromptBuilder } from './promptBuilder.js';
import type { MermaidPostProcessor } from './mermaid/mermaidPostProcessor.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadLSPConfig } from './utils/configLoader.js';
import { qualifyArtifactFilename, qualifyVersionedArtifactFilename } from './utils/pathUtils.js';
import { FileDesignReviewArtifactSink } from './review/designReviewArtifactSink.js';
import { extractCoverageChecklist } from './review/extractCoverageChecklist.js';
import { DesignReviewProcessor } from './review/designReviewProcessor.js';
import { classifyContextDependencies } from './classify/classifyContextDependencies.js';
import { createConsoleProgressLogger, type ProgressLogger } from './progressLogger.js';

export interface OrchestratorConfig {
  name: string;
  files: string[];
  pwd: string;
  /** Root directory for artifacts; defaults to pwd when omitted. */
  output?: string;
}

export class Orchestrator {
  private lspManager: LSPManager;
  private llmService: LLMService;
  private discoveryService: DiscoveryService;
  private promptBuilder: PromptBuilder;
  private mermaidPostProcessor: Pick<MermaidPostProcessor, 'postProcess'>;
  private fs: typeof fs;
  private loadLSPConfig: typeof import('./utils/configLoader.js').loadLSPConfig;
  private progressLogger: ProgressLogger;

  constructor(
    lspManager: LSPManager, 
    llmService: LLMService, 
    discoveryService: DiscoveryService, 
    promptBuilder: PromptBuilder,
    mermaidPostProcessor: Pick<MermaidPostProcessor, 'postProcess'>,
    fsImpl: typeof fs = fs,
    configLoaderFn: typeof import('./utils/configLoader.js').loadLSPConfig = loadLSPConfig,
    progressLogger: ProgressLogger = createConsoleProgressLogger()
  ) {
    this.lspManager = lspManager;
    this.llmService = llmService;
    this.discoveryService = discoveryService;
    this.promptBuilder = promptBuilder;
    this.mermaidPostProcessor = mermaidPostProcessor;
    this.fs = fsImpl;
    this.loadLSPConfig = configLoaderFn;
    this.progressLogger = progressLogger;
  }

  public async run(config: OrchestratorConfig): Promise<void> {
    const { info: log, warn: logWarn } = this.progressLogger;

    try {
      log(`Starting design generation for project "${config.name}"`);

      log(`Detecting languages from ${config.files.length} input file(s)`);
      const extToLang = this.loadLSPConfig(undefined, config.pwd).extensions;
      const languages = new Set(
        config.files
          .map(f => path.extname(f).slice(1))
          .map(ext => extToLang[ext])
          .filter((lang): lang is string => !!lang)
      );

      const languageList = [...languages];
      if (languageList.length === 0) {
        logWarn('No supported languages detected from input file extensions');
      } else {
        log(`Detected language(s): ${languageList.join(', ')}`);
      }

      for (const lang of languageList) {
        log(`Starting LSP server: ${lang}`);
        await this.lspManager.startServer(lang, config.pwd);
      }

      log('Discovering workspace context');
      let context = await this.discoveryService.discoverContext(config.files, config.pwd);
      log(
        `Discovery complete: ${context.main.length} main, ${context.dependencies.length} dependencies, ${context.uses.length} uses`,
      );

      if (context.dependencies.length > 0) {
        log('Classifying dependencies for promotion to main');
        context = await classifyContextDependencies({
          contextMap: context,
          pwd: config.pwd,
          llmService: this.llmService,
          fsImpl: this.fs,
          logInfo: log,
          logWarn: logWarn,
        });
        log(
          `Context map after classification: ${context.main.length} main, ${context.dependencies.length} dependencies, ${context.uses.length} uses`,
        );
      }

      log('Building generation prompt');
      const prompt = this.promptBuilder.buildPrompt(context);

      log('Generating design document (LLM)');
      const designDoc = await this.llmService.generateDesignDocument(prompt);

      log('Post-processing Mermaid diagrams');
      const repairedDesign = await this.mermaidPostProcessor.postProcess(designDoc, prompt);

      const outputRoot = path.resolve(config.output ?? config.pwd);
      const outputDir = path.join(outputRoot, config.name);
      log(`Writing artifacts to ${outputDir}`);
      this.fs.mkdirSync(outputDir, { recursive: true });
      const promptFile = qualifyArtifactFilename('prompt.md', this.llmService.model);
      const initialDesignFile = qualifyVersionedArtifactFilename('design.md', 'v0', this.llmService.model);
      this.fs.writeFileSync(path.join(outputDir, promptFile), `${SYSTEM_PROMPT}\n${prompt}`);
      this.fs.writeFileSync(path.join(outputDir, initialDesignFile), repairedDesign);
      log(`Wrote ${promptFile} and ${initialDesignFile}`);

      const checklist = extractCoverageChecklist(context, config.pwd);
      log(
        `Extracted ${checklist.length} coverage checklist items from ${context.main.length} main file${context.main.length === 1 ? '' : 's'}`,
      );

      log('Starting design review');
      const reviewProcessor = new DesignReviewProcessor({
        llmService: this.llmService,
        mermaidPostProcessor: this.mermaidPostProcessor,
        logInfo: log,
        logWarn: logWarn,
      });
      const artifactSink = new FileDesignReviewArtifactSink({
        outputDir,
        model: this.llmService.model,
        fs: this.fs,
        logInfo: log,
      });
      await reviewProcessor.process({
        designDocument: repairedDesign,
        contextMap: context,
        pwd: config.pwd,
        generationPrompt: prompt,
        checklist,
        fs: this.fs,
        artifactSink,
      });

      log(`Design generation finished for project "${config.name}"`);
    } finally {
      log('Shutting down language servers');
      this.lspManager.shutdown();
    }
  }
}
