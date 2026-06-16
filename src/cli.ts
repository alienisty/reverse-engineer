#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { LSPManager } from './lspManager.js';
import { LLMService } from './llm.js';
import { DiscoveryService } from './discovery.js';
import { PromptBuilder } from './promptBuilder.js';
import { Orchestrator } from './orchestrator.js';
import { MermaidPostProcessor } from './mermaid/mermaidPostProcessor.js';
import { createConsoleProgressLogger, TUIProgressLogger } from './progressLogger.js';
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
  .option('--no-tui', 'Disable TUI progress display')
  .argument('<files...>', 'Input file paths')
  .action(async (files, options) => {
    const pwd = path.resolve(options.pwd);
    const output = options.output ? path.resolve(options.output) : undefined;

    // Validate pwd exists and is a directory
    if (!fs.existsSync(pwd)) {
      console.error(`Error: Working directory (pwd) does not exist: ${pwd}`);
      process.exit(1);
    }
    try {
      const stat = fs.statSync(pwd);
      if (!stat.isDirectory()) {
        console.error(`Error: Working directory (pwd) is not a directory: ${pwd}`);
        process.exit(1);
      }
    } catch (err: any) {
      console.error(`Error reading working directory (pwd) stats: ${err.message}`);
      process.exit(1);
    }

    // Validate input files exist and are files
    for (const file of files) {
      const filePath = path.resolve(pwd, file);
      if (!fs.existsSync(filePath)) {
        console.error(`Error: Input file does not exist: ${filePath}`);
        process.exit(1);
      }
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
          console.error(`Error: Input path is not a file: ${filePath}`);
          process.exit(1);
        }
      } catch (err: any) {
        console.error(`Error reading input file stats: ${err.message}`);
        process.exit(1);
      }
    }

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
    const useTui = options.tui && process.stdout.isTTY;
    const progressLogger = useTui ? new TUIProgressLogger() : createConsoleProgressLogger();
    
    const mermaidPostProcessor = new MermaidPostProcessor({
      llmService,
      logInfo: progressLogger.info.bind(progressLogger),
      logWarning: progressLogger.warn.bind(progressLogger),
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
        if (progressLogger.stop) {
            progressLogger.stop(true);
        }
        console.log('Design document generated!');
        process.exit(0);
    } catch (e) {
        if (progressLogger.stop) {
            progressLogger.stop(false);
        }
        console.error(e);
        process.exit(1);
    }
  });

program.parse(process.argv);
