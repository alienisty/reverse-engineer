export interface PromptSourceFile {
  path: string;
  content: string;
}

export type PromptSourceSection = 'main' | 'dependencies' | 'uses';

const PROMPT_SOURCE_SECTIONS: { key: PromptSourceSection; heading: string }[] = [
  { key: 'main', heading: 'Main' },
  { key: 'dependencies', heading: 'Dependencies' },
  { key: 'uses', heading: 'Uses' },
];

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').trim();
}

function basename(filePath: string): string {
  const normalized = normalizePath(filePath);
  const slash = normalized.lastIndexOf('/');
  return slash === -1 ? normalized : normalized.slice(slash + 1);
}

export function extractSectionBody(generationPrompt: string, sectionName: string): string {
  const heading = `## ${sectionName}`;
  const lines = generationPrompt.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) {
    return '';
  }

  const bodyLines: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/^##\s+/.test(line)) {
      break;
    }
    bodyLines.push(line);
  }

  return bodyLines.join('\n').trim();
}

export function parseSourceFilesFromSection(sectionBody: string): PromptSourceFile[] {
  if (!sectionBody) {
    return [];
  }

  const files: PromptSourceFile[] = [];
  const lines = sectionBody.split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!.trim();

    if (line.startsWith('```')) {
      const contentLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index]!.trim().startsWith('```')) {
        contentLines.push(lines[index]!);
        index += 1;
      }

      files.push({
        path: `__block_${files.length}`,
        content: contentLines.join('\n'),
      });
      index += 1;
      continue;
    }

    if (/\.[\w-]+$/.test(line)) {
      let lookahead = index + 1;
      while (lookahead < lines.length && lines[lookahead]!.trim() === '') {
        lookahead += 1;
      }

      if (lookahead < lines.length && lines[lookahead]!.trim().startsWith('```')) {
        const filePath = normalizePath(line);
        index = lookahead + 1;
        const contentLines: string[] = [];

        while (index < lines.length && !lines[index]!.trim().startsWith('```')) {
          contentLines.push(lines[index]!);
          index += 1;
        }

        files.push({
          path: filePath,
          content: contentLines.join('\n'),
        });
        index += 1;
        continue;
      }
    }

    index += 1;
  }

  return files;
}

function refMatchesFile(ref: string, file: PromptSourceFile): boolean {
  const normalizedRef = normalizePath(ref);
  return (
    normalizePath(file.path) === normalizedRef ||
    basename(file.path) === normalizedRef ||
    normalizePath(file.path).endsWith(`/${normalizedRef}`)
  );
}

function sectionContainsRef(sectionBody: string, ref: string): boolean {
  const normalizedRef = normalizePath(ref);
  if (!sectionBody) {
    return false;
  }

  if (sectionBody.includes(normalizedRef)) {
    return true;
  }

  return parseSourceFilesFromSection(sectionBody).some((file) => refMatchesFile(ref, file));
}

export function extractPromptSourceFiles(generationPrompt: string): PromptSourceFile[] {
  return PROMPT_SOURCE_SECTIONS.flatMap(({ heading }) =>
    parseSourceFilesFromSection(extractSectionBody(generationPrompt, heading)),
  );
}

export function resolvePromptSourceSection(
  ref: string,
  generationPrompt: string,
): PromptSourceSection | undefined {
  for (const { key, heading } of PROMPT_SOURCE_SECTIONS) {
    const sectionBody = extractSectionBody(generationPrompt, heading);
    if (sectionContainsRef(sectionBody, ref)) {
      return key;
    }
  }

  return undefined;
}

export function resolvePromptSourceFile(
  ref: string,
  generationPrompt: string,
  files: PromptSourceFile[] = extractPromptSourceFiles(generationPrompt),
): PromptSourceFile | undefined {
  const normalizedRef = normalizePath(ref);

  const pathMatch = files.find(
    (file) =>
      normalizePath(file.path) === normalizedRef ||
      basename(file.path) === normalizedRef ||
      normalizePath(file.path).endsWith(`/${normalizedRef}`),
  );
  if (pathMatch) {
    return pathMatch;
  }

  for (const { heading } of PROMPT_SOURCE_SECTIONS) {
    const sectionBody = extractSectionBody(generationPrompt, heading);
    if (!sectionContainsRef(sectionBody, ref)) {
      continue;
    }

    const sectionFiles = parseSourceFilesFromSection(sectionBody);
    const sectionPathMatch = sectionFiles.find(
      (file) =>
        normalizePath(file.path) === normalizedRef ||
        basename(file.path) === normalizedRef,
    );
    if (sectionPathMatch) {
      return sectionPathMatch;
    }

    if (sectionFiles.length === 1) {
      return sectionFiles[0];
    }
  }

  return undefined;
}

export function isPromptSourceReference(ref: string, generationPrompt: string): boolean {
  return resolvePromptSourceFile(ref, generationPrompt) !== undefined;
}

export function descriptionContainsSourceTerm(description: string, sourceContent: string): boolean {
  const normalizedSource = sourceContent.toLowerCase();
  const tokens = description.match(/\b[A-Za-z_][A-Za-z0-9_]{3,}\b/g) ?? [];

  return tokens.some((token) => normalizedSource.includes(token.toLowerCase()));
}
