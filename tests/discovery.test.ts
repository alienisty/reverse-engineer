import { DiscoveryService } from '../src/discovery.js';
import { describe, it, expect, jest } from '@jest/globals';
import { LSPManager } from '../src/lspManager.js';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import { pathToFileURL } from 'node:url';
import * as path from 'node:path';

describe('DiscoveryService', () => {
  it('should discover context', async () => {
    const pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-discovery-'));
    const srcDir = path.join(pwd, 'src');
    mkdirSync(srcDir, { recursive: true });
    const mainPath = path.join(srcDir, 'main.ts');
    const refPath = path.join(srcDir, 'ref.ts');
    writeFileSync(mainPath, 'class Main {}');
    writeFileSync(refPath, 'class Ref {}');

    const mockLsp = {
        openDocument: jest.fn().mockResolvedValue(undefined),
        sendRequest: jest.fn((lang: string, method: string, params: any) => {
            if (method === 'textDocument/semanticTokens/full') {
                return Promise.resolve({ data: [0, 5, 5, 0, 3] }); // Line 0, Start 5, Length 5, Type 0 ('class'), Modifiers 3 ('public', 'declaration')
            }
            if (method === 'textDocument/typeDefinition' || method === 'textDocument/implementation') {
                return Promise.resolve([{ uri: pathToFileURL(refPath).toString() }]);
            }
            return Promise.resolve([]);
        }),
        getSemanticTokensLegend: jest.fn((lang: string) => {
            return { tokenTypes: ['class', 'interface', 'variable'], tokenModifiers: ['public', 'declaration'] };
        })
    };
    const discoveryService = new DiscoveryService(mockLsp as unknown as LSPManager, {
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' },
    });
    const context = await discoveryService.discoverContext(['src/main.ts'], pwd);

    expect(context.main).toContain(mainPath);
    expect(context.dependencies).toContain(refPath);
    expect(context.uses).not.toContain(refPath);
    rmSync(pwd, { recursive: true, force: true });
  });

  it('should handle single-location, location-link, and null responses', async () => {
    const pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-discovery-'));
    const srcDir = path.join(pwd, 'src');
    mkdirSync(srcDir, { recursive: true });
    const mainPath = path.join(srcDir, 'main.ts');
    const implPath = path.join(srcDir, 'impl.ts');
    writeFileSync(mainPath, 'interface Main {}');
    writeFileSync(implPath, 'class Impl implements Main {}');
    const mainUri = pathToFileURL(mainPath).toString();
    const implUri = pathToFileURL(implPath).toString();

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const mockLsp = {
      openDocument: jest.fn().mockResolvedValue(undefined),
      sendRequest: jest.fn((lang: string, method: string) => {
        if (method === 'textDocument/semanticTokens/full') {
          return Promise.resolve({ data: [0, 0, 4, 0, 3] });
        }
        if (method === 'textDocument/typeDefinition') {
          return Promise.resolve({ uri: mainUri });
        }
        if (method === 'textDocument/implementation') {
          return Promise.resolve({ targetUri: implUri });
        }
        if (method === 'textDocument/references') {
          return Promise.resolve(null);
        }
        return Promise.resolve([]);
      }),
      getSemanticTokensLegend: jest.fn(() => ({
        tokenTypes: ['interface'],
        tokenModifiers: ['public', 'declaration']
      }))
    };
    const discoveryService = new DiscoveryService(mockLsp as unknown as LSPManager, {
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' },
    });
    const context = await discoveryService.discoverContext(['src/main.ts'], pwd);

    expect(context.main).toContain(mainPath);
    expect(context.dependencies).toContain(implPath);
    expect(context.uses).not.toContain(implPath);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
    rmSync(pwd, { recursive: true, force: true });
  });

  it('routes ReferencesRequest hits to uses, not dependencies', async () => {
    const pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-discovery-'));
    const srcDir = path.join(pwd, 'src');
    const nearbyDir = path.join(srcDir, 'near');
    const distantDir = path.join(pwd, ...Array(16).fill('deep'));
    mkdirSync(nearbyDir, { recursive: true });
    mkdirSync(distantDir, { recursive: true });

    const mainPath = path.join(srcDir, 'main.ts');
    const nearbyRefPath = path.join(nearbyDir, 'nearby.ts');
    const distantRefPath = path.join(distantDir, 'distant.ts');
    writeFileSync(mainPath, 'interface Main {}');
    writeFileSync(nearbyRefPath, 'class Nearby implements Main {}');
    writeFileSync(distantRefPath, 'class Distant {}');

    const mainUri = pathToFileURL(mainPath).toString();
    const nearbyUri = pathToFileURL(nearbyRefPath).toString();
    const distantUri = pathToFileURL(distantRefPath).toString();

    const mockLsp = {
      openDocument: jest.fn().mockResolvedValue(undefined),
      sendRequest: jest.fn((lang: string, method: string) => {
        if (method === 'textDocument/semanticTokens/full') {
          return Promise.resolve({ data: [0, 0, 4, 0, 3] });
        }
        if (method === 'textDocument/typeDefinition') {
          return Promise.resolve({ uri: mainUri });
        }
        if (method === 'textDocument/implementation') {
          return Promise.resolve(null);
        }
        if (method === 'textDocument/references') {
          return Promise.resolve([{ uri: nearbyUri }, { uri: nearbyUri }, { uri: distantUri }]);
        }
        return Promise.resolve([]);
      }),
      getSemanticTokensLegend: jest.fn(() => ({
        tokenTypes: ['interface'],
        tokenModifiers: ['public', 'declaration'],
      })),
    };

    const discoveryService = new DiscoveryService(mockLsp as unknown as LSPManager, {
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' },
    });
    const context = await discoveryService.discoverContext(['src/main.ts'], pwd);

    expect(context.uses).toContain(nearbyRefPath);
    expect(context.uses).toContain(distantRefPath);
    expect(context.dependencies).not.toContain(nearbyRefPath);
    expect(context.dependencies).not.toContain(distantRefPath);
    rmSync(pwd, { recursive: true, force: true });
  });

  it('includes all deduped dependencies paths without hit-based caps', async () => {
    const pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-discovery-'));
    const srcDir = path.join(pwd, 'src');
    mkdirSync(srcDir, { recursive: true });

    const mainPath = path.join(srcDir, 'main.ts');
    const depPaths = Array.from({ length: 4 }, (_, index) => {
      const depPath = path.join(srcDir, `dep${index}.ts`);
      writeFileSync(depPath, `type Dep${index} = string;`);
      return depPath;
    });
    writeFileSync(mainPath, 'interface Main {}');

    const mainUri = pathToFileURL(mainPath).toString();
    const depUris = depPaths.map((depPath) => pathToFileURL(depPath).toString());

    const mockLsp = {
      openDocument: jest.fn().mockResolvedValue(undefined),
      sendRequest: jest.fn((lang: string, method: string) => {
        if (method === 'textDocument/semanticTokens/full') {
          return Promise.resolve({ data: [0, 0, 4, 0, 3] });
        }
        if (method === 'textDocument/typeDefinition') {
          return Promise.resolve(depUris.map((uri) => ({ uri })));
        }
        if (method === 'textDocument/implementation') {
          return Promise.resolve(null);
        }
        return Promise.resolve([]);
      }),
      getSemanticTokensLegend: jest.fn(() => ({
        tokenTypes: ['interface'],
        tokenModifiers: ['public', 'declaration'],
      })),
    };

    const discoveryService = new DiscoveryService(mockLsp as unknown as LSPManager, {
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' },
    });
    const context = await discoveryService.discoverContext(['src/main.ts'], pwd);

    expect(context.dependencies).toHaveLength(4);
    expect(context.dependencies).toEqual(depPaths.slice().sort());
    rmSync(pwd, { recursive: true, force: true });
  });

  it('includes all deduped uses paths without hit-based caps', async () => {
    const pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-discovery-'));
    const srcDir = path.join(pwd, 'src');
    mkdirSync(srcDir, { recursive: true });

    const mainPath = path.join(srcDir, 'main.ts');
    const usePaths = Array.from({ length: 6 }, (_, index) => {
      const usePath = path.join(srcDir, `use${index}.ts`);
      writeFileSync(usePath, `class Use${index} {}`);
      return usePath;
    });
    writeFileSync(mainPath, 'interface Main {}');

    const mainUri = pathToFileURL(mainPath).toString();
    const useUris = usePaths.map((usePath) => pathToFileURL(usePath).toString());

    const mockLsp = {
      openDocument: jest.fn().mockResolvedValue(undefined),
      sendRequest: jest.fn((lang: string, method: string) => {
        if (method === 'textDocument/semanticTokens/full') {
          return Promise.resolve({ data: [0, 0, 4, 0, 3] });
        }
        if (method === 'textDocument/typeDefinition') {
          return Promise.resolve({ uri: mainUri });
        }
        if (method === 'textDocument/implementation') {
          return Promise.resolve(null);
        }
        if (method === 'textDocument/references') {
          return Promise.resolve([
            ...Array(5).fill({ uri: useUris[0] }),
            ...Array(3).fill({ uri: useUris[1] }),
            ...Array(2).fill({ uri: useUris[2] }),
            { uri: useUris[3] },
            { uri: useUris[4] },
            { uri: useUris[5] },
          ]);
        }
        return Promise.resolve([]);
      }),
      getSemanticTokensLegend: jest.fn(() => ({
        tokenTypes: ['interface'],
        tokenModifiers: ['public', 'declaration'],
      })),
    };

    const discoveryService = new DiscoveryService(mockLsp as unknown as LSPManager, {
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' },
    });
    const context = await discoveryService.discoverContext(['src/main.ts'], pwd);

    expect(context.uses).toHaveLength(6);
    expect(context.uses).toEqual(usePaths.slice().sort());
    rmSync(pwd, { recursive: true, force: true });
  });

  it('discoverTypeImplementations returns main, dependencies, and uses', async () => {
    const pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-discovery-'));
    const srcDir = path.join(pwd, 'src');
    mkdirSync(srcDir, { recursive: true });
    const mainPath = path.join(srcDir, 'main.ts');
    const depPath = path.join(srcDir, 'dep.ts');
    const usePath = path.join(srcDir, 'use.ts');
    writeFileSync(mainPath, 'interface Main {}');
    writeFileSync(depPath, 'type Dep = string;');
    writeFileSync(usePath, 'class Consumer implements Main {}');

    const mainUri = pathToFileURL(mainPath).toString();
    const depUri = pathToFileURL(depPath).toString();
    const useUri = pathToFileURL(usePath).toString();

    const mockLsp = {
      openDocument: jest.fn().mockResolvedValue(undefined),
      sendRequest: jest.fn((lang: string, method: string) => {
        if (method === 'textDocument/semanticTokens/full') {
          return Promise.resolve({ data: [0, 0, 4, 0, 3] });
        }
        if (method === 'textDocument/typeDefinition') {
          return Promise.resolve([{ uri: mainUri }, { uri: depUri }]);
        }
        if (method === 'textDocument/references') {
          return Promise.resolve([{ uri: useUri }]);
        }
        return Promise.resolve([]);
      }),
      getSemanticTokensLegend: jest.fn(() => ({
        tokenTypes: ['interface'],
        tokenModifiers: ['public', 'declaration'],
      })),
    };

    const discoveryService = new DiscoveryService(mockLsp as unknown as LSPManager, {
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' },
    });

    const discovered = await discoveryService.discoverTypeImplementations(['src/main.ts'], pwd);
    expect(discovered).toEqual(expect.arrayContaining([mainPath, depPath, usePath]));
    rmSync(pwd, { recursive: true, force: true });
  });

  it('promotes generic type parameter declaration typeDefinition hits to main', async () => {
    const pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-discovery-'));
    const srcDir = path.join(pwd, 'src');
    mkdirSync(srcDir, { recursive: true });
    const mainPath = path.join(srcDir, 'main.ts');
    const refPath = path.join(srcDir, 'ref.ts');
    writeFileSync(mainPath, 'class Main<T extends Ref> {}');
    writeFileSync(refPath, 'interface Ref {}');

    const refUri = pathToFileURL(refPath).toString();

    const mockLsp = {
      openDocument: jest.fn().mockResolvedValue(undefined),
      sendRequest: jest.fn((lang: string, method: string) => {
        if (method === 'textDocument/semanticTokens/full') {
          return Promise.resolve({ data: [0, 11, 1, 1, 2] });
        }
        if (method === 'textDocument/typeDefinition') {
          return Promise.resolve([{ uri: refUri }]);
        }
        return Promise.resolve([]);
      }),
      getSemanticTokensLegend: jest.fn(() => ({
        tokenTypes: ['class', 'typeParameter'],
        tokenModifiers: ['public', 'declaration'],
      })),
    };

    const discoveryService = new DiscoveryService(mockLsp as unknown as LSPManager, {
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' },
    });
    const context = await discoveryService.discoverContext(['src/main.ts'], pwd);

    expect(context.main).toContain(refPath);
    expect(context.dependencies).not.toContain(refPath);
    rmSync(pwd, { recursive: true, force: true });
  });

  it('keeps type parameter usage typeDefinition hits in dependencies', async () => {
    const pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-discovery-'));
    const srcDir = path.join(pwd, 'src');
    mkdirSync(srcDir, { recursive: true });
    const mainPath = path.join(srcDir, 'main.ts');
    const refPath = path.join(srcDir, 'ref.ts');
    writeFileSync(mainPath, 'class Main<T extends Ref> { field: T; }');
    writeFileSync(refPath, 'interface Ref {}');

    const refUri = pathToFileURL(refPath).toString();

    const mockLsp = {
      openDocument: jest.fn().mockResolvedValue(undefined),
      sendRequest: jest.fn((lang: string, method: string) => {
        if (method === 'textDocument/semanticTokens/full') {
          return Promise.resolve({ data: [0, 35, 1, 1, 0] });
        }
        if (method === 'textDocument/typeDefinition') {
          return Promise.resolve([{ uri: refUri }]);
        }
        return Promise.resolve([]);
      }),
      getSemanticTokensLegend: jest.fn(() => ({
        tokenTypes: ['class', 'typeParameter'],
        tokenModifiers: ['public', 'declaration'],
      })),
    };

    const discoveryService = new DiscoveryService(mockLsp as unknown as LSPManager, {
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' },
    });
    const context = await discoveryService.discoverContext(['src/main.ts'], pwd);

    expect(context.dependencies).toContain(refPath);
    expect(context.main).not.toContain(refPath);
    rmSync(pwd, { recursive: true, force: true });
  });

  it('keeps non-header typeDefinition hits in dependencies', async () => {
    const pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-discovery-'));
    const srcDir = path.join(pwd, 'src');
    mkdirSync(srcDir, { recursive: true });
    const mainPath = path.join(srcDir, 'main.ts');
    const refPath = path.join(srcDir, 'ref.ts');
    writeFileSync(mainPath, 'class Main { foo(x: Ref): void {} }');
    writeFileSync(refPath, 'interface Ref {}');

    const refUri = pathToFileURL(refPath).toString();

    const mockLsp = {
      openDocument: jest.fn().mockResolvedValue(undefined),
      sendRequest: jest.fn((lang: string, method: string) => {
        if (method === 'textDocument/semanticTokens/full') {
          return Promise.resolve({ data: [0, 20, 3, 1, 0] });
        }
        if (method === 'textDocument/typeDefinition') {
          return Promise.resolve([{ uri: refUri }]);
        }
        return Promise.resolve([]);
      }),
      getSemanticTokensLegend: jest.fn(() => ({
        tokenTypes: ['class', 'type'],
        tokenModifiers: [],
      })),
    };

    const discoveryService = new DiscoveryService(mockLsp as unknown as LSPManager, {
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' },
    });
    const context = await discoveryService.discoverContext(['src/main.ts'], pwd);

    expect(context.dependencies).toContain(refPath);
    expect(context.main).not.toContain(refPath);
    rmSync(pwd, { recursive: true, force: true });
  });

  it('should discover dependency via textDocument/definition', async () => {
    const pwd = mkdtempSync(path.join(os.tmpdir(), 'reverse-engineer-discovery-'));
    const srcDir = path.join(pwd, 'src');
    mkdirSync(srcDir, { recursive: true });
    const mainPath = path.join(srcDir, 'main.ts');
    const defPath = path.join(srcDir, 'def.ts');
    writeFileSync(mainPath, 'class Main { x: Def; }');
    writeFileSync(defPath, 'class Def {}');

    const mockLsp = {
      openDocument: jest.fn().mockResolvedValue(undefined),
      sendRequest: jest.fn((lang: string, method: string) => {
        if (method === 'textDocument/semanticTokens/full') {
          return Promise.resolve({ data: [0, 0, 4, 0, 3] });
        }
        if (method === 'textDocument/definition') {
          return Promise.resolve([{ uri: pathToFileURL(defPath).toString() }]);
        }
        return Promise.resolve([]);
      }),
      getSemanticTokensLegend: jest.fn(() => ({
        tokenTypes: ['class'],
        tokenModifiers: ['public', 'declaration'],
      })),
    };

    const discoveryService = new DiscoveryService(mockLsp as unknown as LSPManager, {
      servers: { typescript: { command: 'ts', args: [] } },
      extensions: { ts: 'typescript' },
    });
    const context = await discoveryService.discoverContext(['src/main.ts'], pwd);

    expect(context.main).toContain(mainPath);
    expect(context.dependencies).toContain(defPath);
    expect(context.uses).not.toContain(defPath);
    rmSync(pwd, { recursive: true, force: true });
  });
});
