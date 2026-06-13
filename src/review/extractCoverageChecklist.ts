import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ContextMap } from '../types/context.js';
import { isTestSourceFile } from '../utils/pathUtils.js';
import type { ChecklistCategory, CoverageChecklistItem } from './types.js';

type SymbolKind = 'class' | 'interface' | 'enum' | 'function' | 'method';

interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
}

const SYMBOL_KIND_PRIORITY: Record<SymbolKind, number> = {
  class: 0,
  interface: 1,
  enum: 2,
  function: 3,
  method: 4,
};

function toRelativePath(absolutePath: string, pwd: string): string {
  return path.relative(pwd, absolutePath).split(path.sep).join('/');
}

function basename(relativePath: string): string {
  return path.posix.basename(relativePath.replace(/\\/g, '/'));
}

function fileSearchTerms(relativePath: string): string[] {
  const base = basename(relativePath);
  const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
  const terms = new Set<string>([base]);

  if (stem.length > 0 && stem !== base) {
    terms.add(stem);
  }

  return [...terms];
}

function symbolLabel(kind: SymbolKind, name: string, fileName: string): string {
  return `${kind} ${name} in ${fileName}`;
}

function symbolSearchTerms(name: string): string[] {
  return [name];
}

export function extractSymbolsFromSource(source: string): ExtractedSymbol[] {
  const byName = new Map<string, ExtractedSymbol>();

  const add = (name: string, kind: SymbolKind): void => {
    const existing = byName.get(name);
    if (!existing) {
      byName.set(name, { name, kind });
      return;
    }

    if (SYMBOL_KIND_PRIORITY[kind] < SYMBOL_KIND_PRIORITY[existing.kind]) {
      byName.set(name, { name, kind });
    }
  };

  for (const match of source.matchAll(/\bexport\s+class\s+(\w+)/g)) {
    add(match[1]!, 'class');
  }
  for (const match of source.matchAll(/\bclass\s+(\w+)/g)) {
    add(match[1]!, 'class');
  }
  for (const match of source.matchAll(/\bexport\s+interface\s+(\w+)/g)) {
    add(match[1]!, 'interface');
  }
  for (const match of source.matchAll(/\binterface\s+(\w+)/g)) {
    add(match[1]!, 'interface');
  }
  for (const match of source.matchAll(/\bexport\s+enum\s+(\w+)/g)) {
    add(match[1]!, 'enum');
  }
  for (const match of source.matchAll(/\benum\s+(\w+)/g)) {
    add(match[1]!, 'enum');
  }
  for (const match of source.matchAll(/\bexport\s+function\s+(\w+)/g)) {
    add(match[1]!, 'function');
  }
  for (const match of source.matchAll(/\bfunction\s+(\w+)/g)) {
    add(match[1]!, 'function');
  }
  for (const match of source.matchAll(/(?:public|private|protected)\s+(\w+)\s*\(/g)) {
    add(match[1]!, 'method');
  }

  return [...byName.values()].sort((left, right) => {
    const kindOrder = SYMBOL_KIND_PRIORITY[left.kind] - SYMBOL_KIND_PRIORITY[right.kind];
    if (kindOrder !== 0) {
      return kindOrder;
    }

    return left.name.localeCompare(right.name);
  });
}

function buildFileItem(
  prefix: 'main' | 'dep' | 'use' | 'test',
  category: ChecklistCategory,
  relativePath: string,
  symbols: string[] = [],
): CoverageChecklistItem {
  const fileName = basename(relativePath);

  return {
    id: `${prefix}:${relativePath}`,
    label: fileName,
    sourceFile: relativePath,
    searchTerms: [...fileSearchTerms(relativePath), ...symbols],
    category,
  };
}

function buildSymbolItems(relativePath: string, source: string): CoverageChecklistItem[] {
  const fileName = basename(relativePath);

  return extractSymbolsFromSource(source).map((symbol) => ({
    id: `symbol:${relativePath}:${symbol.name}`,
    label: symbolLabel(symbol.kind, symbol.name, fileName),
    sourceFile: relativePath,
    searchTerms: symbolSearchTerms(symbol.name),
    category: 'main' as const,
  }));
}

export function extractCoverageChecklist(
  context: ContextMap,
  pwd: string,
  fsImpl: typeof fs = fs,
): CoverageChecklistItem[] {
  const items: CoverageChecklistItem[] = [];

  for (const absolutePath of context.main) {
    const relativePath = toRelativePath(absolutePath, pwd);
    let symbols: string[] = [];
    let fileSymbols: CoverageChecklistItem[] = [];

    if (fsImpl.existsSync(absolutePath)) {
      const source = fsImpl.readFileSync(absolutePath, 'utf8');
      fileSymbols = buildSymbolItems(relativePath, source);
      symbols = fileSymbols.map((item) => item.searchTerms[0]!).filter(Boolean);
    }

    items.push(buildFileItem('main', 'main', relativePath, symbols));
    items.push(...fileSymbols);
  }

  for (const absolutePath of context.dependencies) {
    const relativePath = toRelativePath(absolutePath, pwd);
    items.push(buildFileItem('dep', 'dependency', relativePath));
  }

  for (const absolutePath of context.uses) {
    const relativePath = toRelativePath(absolutePath, pwd);
    if (isTestSourceFile(relativePath)) {
      items.push(buildFileItem('test', 'test', relativePath));
    } else {
      items.push(buildFileItem('use', 'use', relativePath));
    }
  }

  return items;
}
