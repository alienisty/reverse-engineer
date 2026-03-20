#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'node:path';
import { LSPManager } from './lspManager.js';
import { LLMService } from './llm.js';
import { DiscoveryService } from './discovery.js';
import { PromptBuilder } from './promptBuilder.js';
import { Orchestrator } from './orchestrator.js';
import { MermaidPostProcessor } from './mermaid/mermaidPostProcessor.js';
import { createConsoleProgressLogger } from './progressLogger.js';
import { resolveLSPConfig } from './utils/configLoader.js';

const program = new Command();

program
  .name('reverse-engineer')
  .version('1.0.0')
  .requiredOption('--name <name>', 'Name of the design')
  .option('--pwd <path>', 'Custom working directory', process.cwd())
  .option(
    '--config <path>',
    'Optional LSP config overlay (merged onto application base; relative paths resolve from cwd)'
  )
  .option(
    '--output <path>',
    'Directory for generated artifacts (relative paths resolve from cwd; defaults to --pwd)'
  )
  .argument('<files...>', 'Input file paths')
  .action(async (files, options) => {
    const pwd = path.resolve(options.pwd);
    const output = options.output ? path.resolve(options.output) : undefined;

    // Validate env
    if (!process.env.LLM_BASE_URL || !process.env.LLM_API_KEY || !process.env.LLM_MODEL) {
      console.error('Missing LLM environment variables');
      process.exit(1);
    }

    const lspConfig = resolveLSPConfig({
      pwd,
      configPath: options.config,
      cwd: process.cwd(),
    });
    const lspManager = new LSPManager(lspConfig);
    const llmService = new LLMService({
        baseUrl: process.env.LLM_BASE_URL,
        apiKey: process.env.LLM_API_KEY,
        model: process.env.LLM_MODEL
    });
    const discoveryService = new DiscoveryService(lspManager, lspConfig);
    const promptBuilder = new PromptBuilder();
    const progressLogger = createConsoleProgressLogger();
    const mermaidPostProcessor = new MermaidPostProcessor({
      llmService,
      logInfo: progressLogger.info,
      logWarning: progressLogger.warn,
    });
    const orchestrator = new Orchestrator(
      lspManager,
      llmService,
      discoveryService,
      promptBuilder,
      mermaidPostProcessor,
      undefined,
      () => lspConfig,
      progressLogger,
    );

    try {
        await orchestrator.run({
            name: options.name,
            files: files,
            pwd,
            ...(output !== undefined ? { output } : {}),
        });
        console.log('Design document generated!');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
  });

program.parse(process.argv);
