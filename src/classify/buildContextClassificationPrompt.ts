import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ContextMap } from '../types/context.js';

function toRelativePath(absolutePath: string, pwd: string): string {
  return path.relative(pwd, absolutePath).split(path.sep).join('/');
}

function buildFileEntry(absolutePath: string, pwd: string, fsImpl: typeof fs): string {
  const relativePath = toRelativePath(absolutePath, pwd);
  let entry = `- ${relativePath}`;

  if (fsImpl.existsSync(absolutePath)) {
    const source = fsImpl.readFileSync(absolutePath, 'utf8');
    const lang = path.extname(absolutePath).slice(1);
    entry += `\n\`\`\`${lang}\n${source}\n\`\`\``;
  }

  return entry;
}

export function buildContextClassificationPrompt(
  contextMap: ContextMap,
  pwd: string,
  fsImpl: typeof fs = fs,
): string {
  const lines = [
    'Classify which dependency candidate files are integral parts of the main component design.',
    '',
    '**Main** files are the core design subject (CLI inputs, implementations, and promoted types).',
    '**Dependency candidates** were discovered via type definitions that main code references.',
    '',
    'Promote a dependency to **main** only when it is co-designed with the main component (package-local collaborators, domain types owned by the same feature).',
    'Keep generic or cross-cutting utilities in dependencies (thread factories, broad helpers, unrelated shared types).',
    '',
    'Return only the relative paths to promote, one path per line. Use paths from **Dependency candidates** only.',
    'Return an empty response when nothing should be promoted. Do not include prose, bullets, or markdown headings.',
    '',
    '## Main',
  ];

  for (const absolutePath of contextMap.main) {
    lines.push(buildFileEntry(absolutePath, pwd, fsImpl));
  }

  lines.push('', '## Dependency candidates');

  for (const absolutePath of contextMap.dependencies) {
    lines.push(buildFileEntry(absolutePath, pwd, fsImpl));
  }

  return lines.join('\n');
}
