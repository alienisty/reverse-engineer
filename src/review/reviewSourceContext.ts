import * as fs from 'node:fs';
import * as path from 'node:path';
import { REVIEW_SOURCE_ROLE_MODEL, USAGE_SECTION_RULES } from '../sourceRoleModel.js';
import type { ContextMap } from '../types/context.js';

export interface SourceFile {
  path: string;
  content: string;
}

export type SourceSection = 'main' | 'dependencies' | 'uses';

export interface LoadedSourceContext {
  main: SourceFile[];
  dependencies: SourceFile[];
  uses: SourceFile[];
}

const LAYERED_SECTIONS: { key: SourceSection; heading: string }[] = [
  { key: 'main', heading: 'Main' },
  { key: 'dependencies', heading: 'Dependencies' },
  { key: 'uses', heading: 'Uses' },
];

function toRelativePath(absolutePath: string, pwd: string): string {
  return path.relative(pwd, absolutePath).split(path.sep).join('/');
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').trim();
}

function basename(filePath: string): string {
  const normalized = normalizePath(filePath);
  const slash = normalized.lastIndexOf('/');
  return slash === -1 ? normalized : normalized.slice(slash + 1);
}

function refMatchesFile(ref: string, file: SourceFile): boolean {
  const normalizedRef = normalizePath(ref);
  return (
    normalizePath(file.path) === normalizedRef ||
    basename(file.path) === normalizedRef ||
    normalizePath(file.path).endsWith(`/${normalizedRef}`)
  );
}

function formatSourceFileBlock(sourceFile: SourceFile): string[] {
  const lang = path.extname(sourceFile.path).slice(1);
  return [sourceFile.path, `\`\`\`${lang}`, sourceFile.content, '```'];
}

export function loadSourceContext(
  contextMap: ContextMap,
  pwd: string,
  fsImpl: typeof fs = fs,
): LoadedSourceContext {
  const loadBucket = (paths: string[]): SourceFile[] => {
    const files: SourceFile[] = [];

    for (const absolutePath of paths) {
      if (!fsImpl.existsSync(absolutePath)) {
        continue;
      }

      files.push({
        path: toRelativePath(absolutePath, pwd),
        content: fsImpl.readFileSync(absolutePath, 'utf8'),
      });
    }

    return files;
  };

  return {
    main: loadBucket(contextMap.main),
    dependencies: loadBucket(contextMap.dependencies),
    uses: loadBucket(contextMap.uses),
  };
}

export function formatReviewSourceContext(loaded: LoadedSourceContext): string {
  const layeredSections = LAYERED_SECTIONS.flatMap(({ key, heading }) => {
    const files = loaded[key];
    if (files.length === 0) {
      return [];
    }

    return [`## ${heading}`, ...files.flatMap((file) => formatSourceFileBlock(file))];
  });

  if (layeredSections.length === 0) {
    return '';
  }

  return [
    REVIEW_SOURCE_ROLE_MODEL,
    '',
    '**Usage section expectations:**',
    ...USAGE_SECTION_RULES.split('\n').map((line) => `- ${line}`),
    '',
    ...layeredSections,
  ].join('\n');
}

export function buildReviewSourceContext(
  contextMap: ContextMap,
  pwd: string,
  fsImpl: typeof fs = fs,
): string {
  return formatReviewSourceContext(loadSourceContext(contextMap, pwd, fsImpl));
}

export function resolveSourceSection(
  ref: string,
  loaded: LoadedSourceContext,
): SourceSection | undefined {
  for (const { key } of LAYERED_SECTIONS) {
    if (loaded[key].some((file) => refMatchesFile(ref, file))) {
      return key;
    }
  }

  return undefined;
}

export function resolveSourceFile(
  ref: string,
  loaded: LoadedSourceContext,
): SourceFile | undefined {
  const normalizedRef = normalizePath(ref);

  for (const { key } of LAYERED_SECTIONS) {
    const bucket = loaded[key];
    const pathMatch = bucket.find(
      (file) =>
        normalizePath(file.path) === normalizedRef ||
        basename(file.path) === normalizedRef ||
        normalizePath(file.path).endsWith(`/${normalizedRef}`),
    );
    if (pathMatch) {
      return pathMatch;
    }
  }

  for (const { key } of LAYERED_SECTIONS) {
    const bucket = loaded[key];
    if (!bucket.some((file) => refMatchesFile(ref, file))) {
      continue;
    }

    if (bucket.length === 1) {
      return bucket[0];
    }
  }

  return undefined;
}

export function isSourceReference(ref: string, loaded: LoadedSourceContext): boolean {
  return resolveSourceFile(ref, loaded) !== undefined;
}

export function descriptionContainsSourceTerm(description: string, sourceContent: string): boolean {
  const normalizedSource = sourceContent.toLowerCase();
  const tokens = description.match(/\b[A-Za-z_][A-Za-z0-9_]{3,}\b/g) ?? [];

  return tokens.some((token) => normalizedSource.includes(token.toLowerCase()));
}
