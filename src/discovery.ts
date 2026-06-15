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
  DefinitionRequest,
  DocumentSymbolRequest,
  type Location,
  type LocationLink,
  type SemanticTokens
} from 'vscode-languageserver-protocol';
import { TypeDefinitionRequest } from 'vscode-languageserver';

type DiscoveryLocation = Location | LocationLink;
type MaybeMany<T> = T | T[] | null | undefined;

interface DiscoveryContextState {
  main: string[];
  dependencies: Set<string>;
  uses: Set<string>;
}

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


  /**
   * Discovers the workspace context for the given files.
   * Creates a context map consisting of main entrypoints, dependencies, and usages.
   * 
   * @param files Relative paths of the input files to analyze.
   * @param pwd The current working directory / workspace root.
   * @returns A promise resolving to the populated ContextMap.
   */
  public async discoverContext(files: string[], pwd: string): Promise<ContextMap> {
    const context: DiscoveryContextState = {
      main: files.map(f => path.resolve(pwd, f)),
      dependencies: new Set<string>(),
      uses: new Set<string>(),
    };
    const extToLang = this.config.extensions;
    const inputDirs = new Set(files.map(f => path.dirname(path.resolve(pwd, f))));
    const scannedFiles = new Set<string>();

    for (const file of files) {
      const absolutePath = path.resolve(pwd, file);
      const ext = path.extname(absolutePath).slice(1);
      const lang = extToLang[ext];

      if (!lang) continue;

      await this.discoverFileContext(file, pwd, lang, context);
      scannedFiles.add(absolutePath);
    }

    // Process additional discovered context files located in the same directories as the input files
    let progress = true;
    while (progress) {
      progress = false;
      const candidates = Array.from(new Set([...context.dependencies, ...context.uses]));
      for (const absolutePath of candidates) {
        if (scannedFiles.has(absolutePath)) {
          continue;
        }
        const dir = path.dirname(absolutePath);
        if (inputDirs.has(dir)) {
          const ext = path.extname(absolutePath).slice(1);
          const lang = extToLang[ext];
          if (lang) {
            const relativePath = path.relative(pwd, absolutePath);
            await this.discoverFileContext(relativePath, pwd, lang, context);
            scannedFiles.add(absolutePath);
            progress = true;
            break;
          }
        }
      }
    }

    return {
      main: context.main,
      dependencies: sortedBucketPaths(context.dependencies),
      uses: sortedBucketPaths(context.uses),
    };
  }

  /**
   * Orchestrates the discovery sequence for a single input file.
   * 
   * @param file The relative path of the file.
   * @param pwd The current working directory.
   * @param lang The language ID associated with the file.
   * @param context The shared discovery context state.
   */
  private async discoverFileContext(
    file: string,
    pwd: string,
    lang: string,
    context: DiscoveryContextState
  ): Promise<void> {
    try {
      const absolutePath = path.resolve(pwd, file);
      const uri = pathToFileURL(absolutePath).toString();
      const text = readFileSync(absolutePath, 'utf-8');

      await this.lspManager.openDocument(lang, uri, lang, 1, text);

      // Language-agnostic header import resolving
      const headerEndLine = await this.getHeaderEndLine(lang, uri, file);

      // Extract unique words from header
      const uniqueWords = this.extractHeaderWords(text, headerEndLine);

      // Resolve each header word's definitions and typeDefinitions
      await this.resolveHeaderWords(lang, uri, uniqueWords, pwd, context, file);

      // Process semantic tokens for symbols
      await this.discoverSemanticTokens(lang, uri, pwd, context, file);
    } catch (err) {
      console.error(`Error discovering context in ${file}:`, err);
    }
  }

  /**
   * Queries the language server for document symbols to determine where the import/header block ends.
   * 
   * @param lang The language ID.
   * @param uri The document URI.
   * @param file The file name for log context.
   * @returns The line number where the first symbol begins, or Infinity if not found.
   */
  private async getHeaderEndLine(lang: string, uri: string, file: string): Promise<number> {
    try {
      const symbols = await this.lspManager.sendRequest<any, any>(
        lang,
        DocumentSymbolRequest.method,
        { textDocument: { uri } }
      );
      if (Array.isArray(symbols) && symbols.length > 0) {
        const minLine = findMinStartLine(symbols);
        if (minLine !== Infinity) {
          return minLine;
        }
      }
    } catch (err) {
      console.error(`Error fetching document symbols for ${file}:`, err);
    }
    return Infinity;
  }

  /**
   * Extracts unique alphanumeric words from the file header block.
   * Capped to the first 100 lines.
   * 
   * @param text The full content of the file.
   * @param headerEndLine The line number marking the end of the header.
   * @returns A map of unique words and their first coordinates (line, character).
   */
  private extractHeaderWords(text: string, headerEndLine: number): Map<string, { line: number; character: number }> {
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
    return uniqueWords;
  }

  /**
   * Resolves definitions and type definitions for unique header words and updates the dependencies set.
   * 
   * @param lang The language ID.
   * @param uri The document URI.
   * @param uniqueWords The map of unique words and coordinates found in the header.
   * @param pwd The current working directory.
   * @param context The shared discovery context state.
   * @param file The file name for log context.
   */
  private async resolveHeaderWords(
    lang: string,
    uri: string,
    uniqueWords: Map<string, { line: number; character: number }>,
    pwd: string,
    context: DiscoveryContextState,
    file: string
  ): Promise<void> {
    for (const [word, pos] of uniqueWords.entries()) {
      try {
        // Query definition
        const definitions = normalizeMany(await this.lspManager.sendRequest(
          lang,
          DefinitionRequest.method,
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
  }

  /**
   * Requests semantic tokens from the LSP and walks them to analyze discoverable symbols.
   * 
   * @param lang The language ID.
   * @param uri The document URI.
   * @param pwd The current working directory.
   * @param context The shared discovery context state.
   * @param file The file name for log context.
   */
  private async discoverSemanticTokens(
    lang: string,
    uri: string,
    pwd: string,
    context: DiscoveryContextState,
    file: string
  ): Promise<void> {
    const tokens = await this.lspManager.sendRequest<{ textDocument: { uri: string } }, SemanticTokens | null>(
      lang,
      SemanticTokensRequest.method,
      { textDocument: { uri } }
    );

    const legend = this.lspManager.getSemanticTokensLegend(lang);
    if (!tokens || !tokens.data || !legend) {
      return;
    }

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
          await this.discoverSymbolAtPosition(lang, uri, typeName, modifiers, position, pwd, context, file);
        } finally {
          modifiers.clear();
        }
      }
    }
  }

  /**
   * Resolves context references for a specific discoverable symbol at a position.
   * Encompasses typeDefinition, definition, and conditional implementation and reference querying.
   * 
   * @param lang The language ID.
   * @param uri The document URI.
   * @param typeName The semantic token type name.
   * @param modifiers The set of active modifiers for this token.
   * @param position The position coordinates of the symbol.
   * @param pwd The current working directory.
   * @param context The shared discovery context state.
   * @param file The file name for log context.
   */
  private async discoverSymbolAtPosition(
    lang: string,
    uri: string,
    typeName: string,
    modifiers: Set<string>,
    position: { line: number; character: number },
    pwd: string,
    context: DiscoveryContextState,
    file: string
  ): Promise<void> {
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
        DefinitionRequest.method,
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
      console.error(`Error discovering symbol context in ${file} at ${position.line}:${position.character}:`, err);
    }
  }
}
