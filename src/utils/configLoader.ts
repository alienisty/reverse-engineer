import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LSPConfig {
  command: string;
  args: string[];
}

export interface LSPConfigs {
  servers: { [language: string]: LSPConfig };
  extensions: { [ext: string]: string };
}

export interface ResolveLSPConfigOptions {
  pwd: string;
  configPath?: string;
  cwd?: string;
}

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_PROJECT_CONFIG = 'config/lsp.config.json';

export function getApplicationConfigPath(): string {
  return path.join(PACKAGE_ROOT, 'config', 'lsp.config.json');
}

function resolveConfigPath(configPath: string, rootDir: string): string {
  return path.isAbsolute(configPath)
    ? configPath
    : path.resolve(rootDir, configPath);
}

function validateLSPConfig(config: LSPConfigs): void {
  if (!config.servers || !config.extensions) {
    throw new Error('Invalid configuration format');
  }

  for (const lang in config.servers) {
    const server = config.servers[lang];
    if (!server || typeof server.command !== 'string' || !Array.isArray(server.args)) {
      throw new Error(`Invalid configuration for language: ${lang}`);
    }
  }
}

function readLSPConfigAt(resolvedConfigPath: string): LSPConfigs {
  if (!existsSync(resolvedConfigPath)) {
    throw new Error(`Configuration file not found: ${resolvedConfigPath}`);
  }

  const config = JSON.parse(readFileSync(resolvedConfigPath, 'utf-8')) as LSPConfigs;
  validateLSPConfig(config);
  return config;
}

export function mergeLSPConfigs(base: LSPConfigs, overlay: LSPConfigs): LSPConfigs {
  validateLSPConfig(overlay);
  return {
    servers: { ...base.servers, ...overlay.servers },
    extensions: { ...base.extensions, ...overlay.extensions },
  };
}

/** Load a single config file from disk. */
export function loadLSPConfig(
  configPath: string = DEFAULT_PROJECT_CONFIG,
  rootDir: string = process.cwd()
): LSPConfigs {
  return readLSPConfigAt(resolveConfigPath(configPath, rootDir));
}

/** Load application base config, optionally merged with project or --config overlay. */
export function resolveLSPConfig(options: ResolveLSPConfigOptions): LSPConfigs {
  const base = readLSPConfigAt(getApplicationConfigPath());

  if (options.configPath !== undefined) {
    const cwd = options.cwd ?? process.cwd();
    const overlay = readLSPConfigAt(resolveConfigPath(options.configPath, cwd));
    return mergeLSPConfigs(base, overlay);
  }

  const projectConfigPath = path.resolve(options.pwd, DEFAULT_PROJECT_CONFIG);
  if (existsSync(projectConfigPath)) {
    const overlay = readLSPConfigAt(projectConfigPath);
    return mergeLSPConfigs(base, overlay);
  }

  return base;
}
