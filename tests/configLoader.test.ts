import {
  getApplicationConfigPath,
  loadLSPConfig,
  mergeLSPConfigs,
  resolveLSPConfig,
} from '../src/utils/configLoader.js';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

test('getApplicationConfigPath should point at the packaged base config', () => {
  expect(existsSync(getApplicationConfigPath())).toBe(true);
});

test('loadLSPConfig should load valid config', () => {
  const config = loadLSPConfig('config/lsp.config.json');
  expect(config).toHaveProperty('servers');
  expect(config.servers['typescript']).toBeDefined();
  expect(config.servers['typescript']?.command).toBe('typescript-language-server');
});

test('loadLSPConfig should load absolute config paths regardless of rootDir', () => {
  const config = loadLSPConfig(path.resolve('config/lsp.config.json'), '/nonexistent');
  expect(config.servers['typescript']?.command).toBe('typescript-language-server');
});

test('loadLSPConfig should resolve relative config paths from the target pwd', () => {
  const launcherCwd = process.cwd();
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-config-'));
  const launcherDir = path.join(tempRoot, 'launcher');
  const targetPwd = path.join(tempRoot, 'target-workspace');
  const configDir = path.join(targetPwd, 'config');

  mkdirSync(launcherDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    path.join(configDir, 'lsp.config.json'),
    JSON.stringify({
      servers: {
        typescript: { command: 'ts-server', args: ['--stdio'] }
      },
      extensions: {
        ts: 'typescript'
      }
    })
  );

  process.chdir(launcherDir);

  try {
    const config = loadLSPConfig('config/lsp.config.json', targetPwd);

    expect(config.servers['typescript']?.command).toBe('ts-server');
  } finally {
    process.chdir(launcherCwd);
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('mergeLSPConfigs should overlay servers and extensions', () => {
  const merged = mergeLSPConfigs(
    {
      servers: {
        typescript: { command: 'base-ts', args: [] },
        java: { command: 'base-java', args: [] },
      },
      extensions: { ts: 'typescript', java: 'java' },
    },
    {
      servers: {
        java: { command: 'overlay-java', args: ['--stdio'] },
        python: { command: 'overlay-py', args: [] },
      },
      extensions: { py: 'python' },
    }
  );

  expect(merged.servers['typescript']?.command).toBe('base-ts');
  expect(merged.servers['java']?.command).toBe('overlay-java');
  expect(merged.servers['python']?.command).toBe('overlay-py');
  expect(merged.extensions).toEqual({ ts: 'typescript', java: 'java', py: 'python' });
});

test('resolveLSPConfig should use application base when project config is missing', () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-resolve-'));
  const pwd = path.join(tempRoot, 'workspace');
  mkdirSync(pwd, { recursive: true });

  try {
    const config = resolveLSPConfig({ pwd });

    expect(config.servers['typescript']?.command).toBe('typescript-language-server');
    expect(config.servers['java']?.command).toBe('jdtls');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('resolveLSPConfig should merge project config from pwd', () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-resolve-'));
  const pwd = path.join(tempRoot, 'workspace');
  const configDir = path.join(pwd, 'config');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    path.join(configDir, 'lsp.config.json'),
    JSON.stringify({
      servers: {
        java: { command: 'custom-jdtls', args: ['--watch'] },
      },
      extensions: {
        java: 'java',
      },
    })
  );

  try {
    const config = resolveLSPConfig({ pwd });

    expect(config.servers['typescript']?.command).toBe('typescript-language-server');
    expect(config.servers['java']?.command).toBe('custom-jdtls');
    expect(config.servers['java']?.args).toEqual(['--watch']);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('resolveLSPConfig should merge explicit --config overlay onto base', () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-resolve-'));
  const overlayDir = path.join(tempRoot, 'overlay');
  mkdirSync(overlayDir, { recursive: true });
  const overlayPath = path.join(overlayDir, 'custom.json');
  writeFileSync(
    overlayPath,
    JSON.stringify({
      servers: {
        java: { command: 'explicit-jdtls', args: [] },
      },
      extensions: {
        java: 'java',
      },
    })
  );

  try {
    const config = resolveLSPConfig({
      pwd: path.join(tempRoot, 'missing-project-config'),
      configPath: overlayPath,
    });

    expect(config.servers['typescript']?.command).toBe('typescript-language-server');
    expect(config.servers['java']?.command).toBe('explicit-jdtls');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('resolveLSPConfig should throw when explicit config file is missing', () => {
  expect(() =>
    resolveLSPConfig({
      pwd: process.cwd(),
      configPath: path.join(os.tmpdir(), 'missing-lsp-config.json'),
    })
  ).toThrow(/Configuration file not found/);
});
