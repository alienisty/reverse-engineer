import { LSPManager } from './lspManager.js';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LSPConfigs } from './utils/configLoader.js';
import { uriToPath, isWithinPwd } from './utils/pathUtils.js';
import type { ContextMap } from './types/context.js';
import {
  ReferencesRequest,
  SemanticTokensRequest,
  ImplementationRequest,
  type Location,
  type LocationLink,
  type SemanticTokens
} from 'vscode-languageserver-protocol';
import { TypeDefinitionRequest } from 'vscode-languageserver';

type DiscoveryLocation = Location | LocationLink;
type MaybeMany<T> = T | T[] | null | undefined;

const DISCOVERABLE_TOKEN_TYPES = new Set([
  'type',
  'typeParameter',
  'class',
  'interface',
  'record',
  'annotation',
  'enum',
  'function',
  'method',
  'variable',
  'property',
]);

function normalizeMany<T>(value: MaybeMany<T>): T[] {
  if (value == null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function getLocationUri(location: DiscoveryLocation): string {
  return 'targetUri' in location ? location.targetUri : location.uri;
}

// Lexicographic sort for stable output: Set order follows LSP traversal, not relevance.
function sortedBucketPaths(bucket: Set<string>): string[] {
  return Array.from(bucket).sort();
}

function isGenericTypeParameterDeclaration(typeName: string, modifiers: Set<string>): boolean {
  return typeName === 'typeParameter' && modifiers.has('declaration');
}

function findMinStartLine(symbols: any[]): number {
  let minLine = Infinity;

  const traverse = (symbol: any) => {
    if (!symbol) return;

    if (symbol.range && symbol.range.start) {
      if (symbol.range.start.line < minLine) {
        minLine = symbol.range.start.line;
      }
    }
    if (symbol.location && symbol.location.range && symbol.location.range.start) {
      if (symbol.location.range.start.line < minLine) {
        minLine = symbol.location.range.start.line;
      }
    }

    if (Array.isArray(symbol.children)) {
      for (const child of symbol.children) {
        traverse(child);
      }
    }
  };

  for (const sym of symbols) {
    traverse(sym);
  }

  return minLine;
}

export class DiscoveryService {
  private lspManager: LSPManager;
  private config: LSPConfigs;

  constructor(lspManager: LSPManager, config: LSPConfigs) {
    this.lspManager = lspManager;
    this.config = config;
  }

  public async discoverTypeImplementations(files: string[], pwd: string): Promise<string[]> {
    const context = await this.discoverContext(files, pwd);
    return Array.from(new Set([...context.main, ...context.dependencies, ...context.uses]));
  }

  public async discoverContext(files: string[], pwd: string): Promise<ContextMap> {
    const context: { main: string[]; dependencies: Set<string>; uses: Set<string> } = {
      main: files.map(f => path.resolve(pwd, f)),
      dependencies: new Set<string>(),
      uses: new Set<string>(),
    };
    const extToLang = this.config.extensions;

    for (const file of files) {
      const absolutePath = path.resolve(pwd, file);

      const ext = path.extname(absolutePath).slice(1);
      const lang = extToLang[ext];

      if (!lang) continue;

      try {
        const uri = pathToFileURL(absolutePath).toString();
        const text = readFileSync(absolutePath, 'utf-8');

        await this.lspManager.openDocument(lang, uri, lang, 1, text);

        // Language-agnostic header import resolving
        let headerEndLine = Infinity;
        try {
          const symbols = await this.lspManager.sendRequest<any, any>(
            lang,
            'textDocument/documentSymbol',
            { textDocument: { uri } }
          );
          if (Array.isArray(symbols) && symbols.length > 0) {
            const minLine = findMinStartLine(symbols);
            if (minLine !== Infinity) {
              headerEndLine = minLine;
            }
          }
        } catch (err) {
          console.error(`Error fetching document symbols for ${file}:`, err);
        }

        const lines = text.split(/\r?\n/);
        const scanEndLine = Math.min(lines.length, headerEndLine, 100);

        const uniqueWords = new Map<string, { line: number; character: number }>();
        const wordRegex = /[a-zA-Z_][a-zA-Z0-9_]*/g;

        for (let lineIndex = 0; lineIndex < scanEndLine; lineIndex++) {
          const line = lines[lineIndex]!;
          let match;
          while ((match = wordRegex.exec(line)) !== null) {
            const word = match[0];
            if (word.length >= 2 && !uniqueWords.has(word)) {
              uniqueWords.set(word, { line: lineIndex, character: match.index });
            }
          }
        }

        for (const [word, pos] of uniqueWords.entries()) {
          try {
            // Query definition
            const definitions = normalizeMany(await this.lspManager.sendRequest(
              lang,
              'textDocument/definition',
              {
                textDocument: { uri },
                position: pos
              }
            ) as MaybeMany<DiscoveryLocation>);

            for (const location of definitions) {
              const locPath = uriToPath(getLocationUri(location));
              if (isWithinPwd(locPath, pwd) && !context.main.includes(locPath)) {
                context.dependencies.add(locPath);
              }
            }

            // Query typeDefinition
            const typeDefinitions = normalizeMany(await this.lspManager.sendRequest(
              lang,
              TypeDefinitionRequest.method,
              {
                textDocument: { uri },
                position: pos
              }
            ) as MaybeMany<DiscoveryLocation>);

            for (const location of typeDefinitions) {
              const locPath = uriToPath(getLocationUri(location));
              if (isWithinPwd(locPath, pwd) && !context.main.includes(locPath)) {
                context.dependencies.add(locPath);
              }
            }
          } catch (err) {
            console.error(`Error resolving definition for header word "${word}" in ${file} at ${pos.line}:${pos.character}:`, err);
          }
        }

        const tokens = await this.lspManager.sendRequest<{ textDocument: { uri: string } }, SemanticTokens | null>(lang, SemanticTokensRequest.method, {
          textDocument: { uri }
        });

        const legend = this.lspManager.getSemanticTokensLegend(lang);
        if (tokens && tokens.data && legend) {
          const data = tokens.data;
          let currentLine = 0;
          let currentStart = 0;
          let modifiers = new Set<string>();

          for (let i = 0; i < data.length; i += 5) {
            const deltaLine = data[i];
            const deltaStart = data[i + 1];
            const tokenType = data[i + 3];
            const tokentModifier = data[i + 4];

            if (
              deltaLine === undefined ||
              deltaStart === undefined ||
              tokenType === undefined ||
              tokentModifier === undefined
            ) {
              continue;
            }

            if (deltaLine > 0) {
              currentLine += deltaLine;
              currentStart = deltaStart;
              modifiers.clear();
            } else {
              currentStart += deltaStart;
            }

            const typeName = legend.tokenTypes[tokenType];
            if (!typeName) {
              continue;
            }
            if (tokentModifier > 0) {
              for (let m = 0; m < 32; m++) {
                if ((tokentModifier & (1 << m)) === (1 << m)) {
                  modifiers.add(legend.tokenModifiers[m]!);
                }
              }
            }

            if (DISCOVERABLE_TOKEN_TYPES.has(typeName)) {
              const position = { line: currentLine, character: currentStart };

              try {
                const typeDefinitions = normalizeMany(await this.lspManager.sendRequest(
                  lang,
                  TypeDefinitionRequest.method,
                  {
                  textDocument: { uri },
                  position
                  }
                ) as MaybeMany<DiscoveryLocation>);

                const promoteToMain = isGenericTypeParameterDeclaration(typeName, modifiers);

                for (const location of typeDefinitions) {
                  const locPath = uriToPath(getLocationUri(location));
                  if (!isWithinPwd(locPath, pwd) || context.main.includes(locPath)) {
                    continue;
                  }

                  if (promoteToMain) {
                    context.main.push(locPath);
                    context.dependencies.delete(locPath);
                  } else {
                    context.dependencies.add(locPath);
                  }
                }
                const definitions = normalizeMany(await this.lspManager.sendRequest(
                  lang,
                  'textDocument/definition',
                  {
                    textDocument: { uri },
                    position
                  }
                ) as MaybeMany<DiscoveryLocation>);

                for (const location of definitions) {
                  const locPath = uriToPath(getLocationUri(location));
                  if (isWithinPwd(locPath, pwd) && !context.main.includes(locPath)) {
                    context.dependencies.add(locPath);
                  }
                }
                if (typeDefinitions.some(def => getLocationUri(def) === uri)) {
                  const implementationLocations = modifiers.has('public') && modifiers.has('declaration') && (modifiers.has('abstract') || typeName === 'interface')
                    ? normalizeMany(await this.lspManager.sendRequest(
                        lang,
                        ImplementationRequest.method,
                        {
                          textDocument: { uri },
                          position
                        }
                      ) as MaybeMany<DiscoveryLocation>)
                    : [];

                  for (const location of implementationLocations) {
                    const locPath = uriToPath(getLocationUri(location));
                    if (isWithinPwd(locPath, pwd) && !context.main.includes(locPath)) {
                      context.dependencies.add(locPath);
                    }
                  }

                  const referenceLocations = modifiers.has('public') && modifiers.has('declaration') && (typeName === 'class' || typeName === 'interface')
                    ? normalizeMany(await this.lspManager.sendRequest(
                        lang,
                        ReferencesRequest.method,
                        {
                          textDocument: { uri },
                          position,
                          context: { includeDeclaration: false }
                        }
                      ) as MaybeMany<DiscoveryLocation>)
                    : [];

                  for (const location of referenceLocations) {
                    const locPath = uriToPath(getLocationUri(location));
                    if (isWithinPwd(locPath, pwd) && !context.main.includes(locPath)) {
                      context.uses.add(locPath);
                    }
                  }
                }
              } catch (err) {
                console.error(`Error discovering symbol context in ${file} at ${currentLine}:${currentStart}:`, err);
              } finally {
                modifiers.clear();
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error discovering context in ${file}:`, err);
      }
    }

    return {
      main: context.main,
      dependencies: sortedBucketPaths(context.dependencies),
      uses: sortedBucketPaths(context.uses),
    };
  }
}
