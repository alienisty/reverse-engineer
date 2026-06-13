import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Robustly converts a file URI to a system-standard file path.
 */
export function uriToPath(uri: string): string {
  return fileURLToPath(uri);
}

/**
 * Checks if the given path is within the working directory (pwd).
 */
export function isWithinPwd(absolutePath: string, pwd: string): boolean {
  const relative = path.relative(pwd, absolutePath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

/**
 * Converts an LLM model identifier into a safe filesystem segment.
 */
export function sanitizeModelForFilename(model: string): string {
  const slug = model
    .trim()
    .replace(INVALID_FILENAME_CHARS, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.length > 0 ? slug : 'model';
}

/**
 * Inserts the model name before the file extension (e.g. design.md → design.gpt-4.md).
 */
export function qualifyArtifactFilename(filename: string, model: string): string {
  const slug = sanitizeModelForFilename(model);
  const ext = path.extname(filename);
  const base = filename.slice(0, filename.length - ext.length);
  return `${base}.${slug}${ext}`;
}

/**
 * Inserts the version and model before the file extension
 * (e.g. design.md -> design.v0.gpt-4.md).
 */
export function qualifyVersionedArtifactFilename(
  filename: string,
  version: string,
  model: string
): string {
  const ext = path.extname(filename);
  const base = filename.slice(0, filename.length - ext.length);
  return qualifyArtifactFilename(`${base}.${version}${ext}`, model);
}

/**
 * Inserts round and model before the extension
 * (e.g. review-prompt.md -> review-prompt.1.gpt-4.md).
 */
export function qualifyRoundAttemptArtifactFilename(
  basename: string,
  round: number,
  model: string,
): string {
  const ext = path.extname(basename);
  const base = basename.slice(0, basename.length - ext.length);
  return qualifyArtifactFilename(`${base}.${round}${ext}`, model);
}

