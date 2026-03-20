import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LLMService } from '../llm.js';
import type { ContextMap } from '../types/context.js';
import { applyDependencyPromotion } from './applyDependencyPromotion.js';
import { buildClassificationParseRetryPrompt } from './buildClassificationParseRetryPrompt.js';
import { buildContextClassificationPrompt } from './buildContextClassificationPrompt.js';
import {
  parseContextClassificationResponse,
  promoteRelativePathsToAbsolute,
} from './parseContextClassificationResponse.js';

export const MAX_CLASSIFICATION_PARSE_ATTEMPTS = 3;

export class ContextClassificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContextClassificationError';
  }
}

export interface ClassifyContextDependenciesInput {
  contextMap: ContextMap;
  pwd: string;
  llmService: Pick<LLMService, 'classifyDependencies'>;
  fsImpl?: typeof fs;
  logInfo?: (message: string) => void;
  logWarn?: (message: string) => void;
}

function toRelativePath(absolutePath: string, pwd: string): string {
  return path.relative(pwd, absolutePath).split(path.sep).join('/');
}

function dependencyCandidateRelativePaths(contextMap: ContextMap, pwd: string): string[] {
  return contextMap.dependencies.map((absolutePath) => toRelativePath(absolutePath, pwd));
}

export async function classifyContextDependencies(
  input: ClassifyContextDependenciesInput,
): Promise<ContextMap> {
  const fsImpl = input.fsImpl ?? fs;
  const logInfo = input.logInfo ?? (() => {});
  const logWarn = input.logWarn ?? (() => {});

  if (input.contextMap.dependencies.length === 0) {
    return input.contextMap;
  }

  const candidateRelativePaths = dependencyCandidateRelativePaths(input.contextMap, input.pwd);
  const classificationPrompt = buildContextClassificationPrompt(
    input.contextMap,
    input.pwd,
    fsImpl,
  );

  let prompt = classificationPrompt;
  let lastResponse = '';

  for (let attempt = 1; attempt <= MAX_CLASSIFICATION_PARSE_ATTEMPTS; attempt += 1) {
    logInfo(
      `Context classification: calling LLM (attempt ${attempt}/${MAX_CLASSIFICATION_PARSE_ATTEMPTS})`,
    );
    lastResponse = await input.llmService.classifyDependencies(prompt);
    const parsed = parseContextClassificationResponse(lastResponse, candidateRelativePaths);

    if (!parsed.error) {
      const promotePaths = promoteRelativePathsToAbsolute(
        parsed.promoteRelativePaths,
        input.pwd,
      );
      const promotedCount = promotePaths.length;
      const totalCandidates = input.contextMap.dependencies.length;

      logInfo(
        `Context classification: promoted ${promotedCount} of ${totalCandidates} dependencies to main`,
      );

      return applyDependencyPromotion(input.contextMap, promotePaths);
    }

    if (attempt === MAX_CLASSIFICATION_PARSE_ATTEMPTS) {
      throw new ContextClassificationError(
        `Context classification parse failed after ${MAX_CLASSIFICATION_PARSE_ATTEMPTS} attempts: ${parsed.error}`,
      );
    }

    logWarn(
      `Context classification: parse failed (attempt ${attempt}/${MAX_CLASSIFICATION_PARSE_ATTEMPTS}): ${parsed.error}`,
    );
    prompt = buildClassificationParseRetryPrompt({
      parseError: parsed.error,
      classificationPrompt,
      failedResponse: lastResponse,
    });
  }

  return input.contextMap;
}
