import type { LLMService } from '../llm.js';
import type { MermaidPostProcessor } from '../mermaid/mermaidPostProcessor.js';
import type { ContextMap } from '../types/context.js';
import * as fs from 'node:fs';
import { buildDesignReviewPrompt } from './buildDesignReviewPrompt.js';
import { buildDesignRevisionPrompt } from './buildDesignRevisionPrompt.js';
import { buildReviewParseRetryPrompt } from './buildReviewParseRetryPrompt.js';
import { deriveReviewStatus } from './deriveReviewStatus.js';
import { parseDesignReviewResponse } from './parseDesignReviewResponse.js';
import {
  formatReviewSourceContext,
  loadSourceContext,
} from './reviewSourceContext.js';
import {
  deriveAllowedRevisionSections,
  lockRevisionToAllowedSections,
  validateRevisionPreservation,
} from './validateRevisionPreservation.js';
import { validateDesignStructure } from './validateDesignStructure.js';
import { validateFeedbackItems } from './validateFeedbackItems.js';
import { createConsoleProgressLogger } from '../progressLogger.js';
import type {
  CoverageChecklistItem,
  DesignReviewFeedbackItem,
  DesignReviewResult,
  ReviewStatus,
} from './types.js';
import type { DesignReviewArtifactSink } from './designReviewArtifactSink.js';
import { MAX_REVIEW_PARSE_ATTEMPTS, MAX_REVIEW_ROUNDS } from './types.js';

export class DesignReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesignReviewError';
  }
}

export interface DesignReviewProcessorDeps {
  llmService: Pick<LLMService, 'reviewDesignDocument' | 'reviseDesignDocument'>;
  mermaidPostProcessor: Pick<MermaidPostProcessor, 'postProcess'>;
  logInfo?: (message: string) => void;
  logWarn?: (message: string) => void;
}

export interface DesignReviewProcessorInput {
  designDocument: string;
  contextMap: ContextMap;
  pwd: string;
  generationPrompt: string;
  checklist: CoverageChecklistItem[];
  fs?: typeof fs;
  artifactSink?: DesignReviewArtifactSink;
}

export interface DesignReviewRoundRecord {
  round: number;
  result: DesignReviewResult;
}

export interface DesignReviewProcessorResult {
  finalDesign: string;
  finalStatus: ReviewStatus;
  reviewRounds: DesignReviewRoundRecord[];
  maxRoundsReachedWithGaps: boolean;
  unresolvedGaps: string[];
}

interface DerivedReviewOutcome {
  rawResponse: string;
  result: DesignReviewResult;
  statusOverridden: boolean;
  manualFeedbackCount: number;
  terminalFailureReason?: string;
}

interface RevisionRoundOutcome {
  designDocument: string;
  terminalFailureReason?: string;
}

export class DesignReviewProcessor {
  private readonly llmService: DesignReviewProcessorDeps['llmService'];
  private readonly mermaidPostProcessor: DesignReviewProcessorDeps['mermaidPostProcessor'];
  private readonly logInfo: (message: string) => void;
  private readonly logWarn: (message: string) => void;

  constructor(deps: DesignReviewProcessorDeps) {
    this.llmService = deps.llmService;
    this.mermaidPostProcessor = deps.mermaidPostProcessor;
    const defaultLogger = createConsoleProgressLogger();
    this.logInfo = deps.logInfo ?? defaultLogger.info;
    this.logWarn = deps.logWarn ?? defaultLogger.warn;
  }

  async process(input: DesignReviewProcessorInput): Promise<DesignReviewProcessorResult> {
    const fsImpl = input.fs ?? fs;
    const artifactSink = input.artifactSink;
    let currentDesign = input.designDocument;
    const reviewRounds: DesignReviewRoundRecord[] = [];
    let finalStatus: ReviewStatus = 'NEEDS_REVISION';

    const finish = (
      outcome: Omit<DesignReviewProcessorResult, 'finalDesign' | 'finalStatus'> & {
        finalStatus?: ReviewStatus;
      },
    ): DesignReviewProcessorResult => {
      const result: DesignReviewProcessorResult = {
        finalDesign: currentDesign,
        finalStatus: outcome.finalStatus ?? finalStatus,
        reviewRounds: outcome.reviewRounds,
        maxRoundsReachedWithGaps: outcome.maxRoundsReachedWithGaps,
        unresolvedGaps: outcome.unresolvedGaps,
      };
      artifactSink?.writeFinalDesign(result.finalDesign);
      return result;
    };

    this.logInfo(
      `Design review: up to ${MAX_REVIEW_ROUNDS} rounds, ${input.checklist.length} checklist item${input.checklist.length === 1 ? '' : 's'}`,
    );

    for (let round = 1; round <= MAX_REVIEW_ROUNDS; round += 1) {
      this.logInfo(`Review round ${round}/${MAX_REVIEW_ROUNDS}: loading source context and calling reviewer`);
      const reviewOutcome = await this.runReviewRound({
        round,
        designDocument: currentDesign,
        contextMap: input.contextMap,
        pwd: input.pwd,
        fsImpl,
        checklist: input.checklist,
        artifactSink,
      });

      artifactSink?.writeReviewResponse(round, reviewOutcome.rawResponse);
      reviewRounds.push({
        round,
        result: reviewOutcome.result,
      });
      finalStatus = reviewOutcome.result.status;

      if (reviewOutcome.terminalFailureReason) {
        const unresolvedGaps = collectUnresolvedGaps(reviewOutcome.result);
        this.logWarn(
          `Review round ${round} ended early: ${reviewOutcome.terminalFailureReason}. Returning best-effort result with ${unresolvedGaps.length} unresolved gap${unresolvedGaps.length === 1 ? '' : 's'}`,
        );

        return finish({
          reviewRounds,
          maxRoundsReachedWithGaps: true,
          unresolvedGaps,
        });
      }

      if (reviewOutcome.result.status === 'COMPLETE') {
        this.logInfo('Review complete — all checklist items covered');
        return finish({
          reviewRounds,
          maxRoundsReachedWithGaps: false,
          unresolvedGaps: [],
        });
      }

      if (round === MAX_REVIEW_ROUNDS) {
        break;
      }

      const uncoveredCount = reviewOutcome.result.checklist.filter((entry) => !entry.covered).length;
      const feedbackCount = reviewOutcome.result.feedbackItems.length;
      this.logInfo(
        `Review round ${round}/${MAX_REVIEW_ROUNDS}: revising design (${feedbackCount} feedback item${feedbackCount === 1 ? '' : 's'}, ${uncoveredCount} uncovered checklist item${uncoveredCount === 1 ? '' : 's'})`,
      );
      const revisionOutcome = await this.runRevisionRound({
        round,
        designDocument: currentDesign,
        generationPrompt: input.generationPrompt,
        feedbackItems: reviewOutcome.result.feedbackItems,
        uncoveredChecklist: reviewOutcome.result.checklist.filter((entry) => !entry.covered),
        artifactSink,
      });
      currentDesign = revisionOutcome.designDocument;
      artifactSink?.writeRevisionDesign(round, currentDesign);

      if (revisionOutcome.terminalFailureReason) {
        const unresolvedGaps = collectUnresolvedGaps(reviewOutcome.result);
        if (round < MAX_REVIEW_ROUNDS) {
          this.logWarn(
            `Review round ${round}: revision validation failed (${revisionOutcome.terminalFailureReason}). Continuing to review round ${round + 1} with best-effort revision (${unresolvedGaps.length} unresolved gap${unresolvedGaps.length === 1 ? '' : 's'}).`,
          );
          continue;
        }

        this.logWarn(
          `Review round ${round}: revision validation failed (${revisionOutcome.terminalFailureReason}). Returning best-effort result with ${unresolvedGaps.length} unresolved gap${unresolvedGaps.length === 1 ? '' : 's'}.`,
        );
      }
    }

    const lastReview = reviewRounds[reviewRounds.length - 1]!;
    const unresolvedGaps = collectUnresolvedGaps(lastReview.result);
    this.logWarn(
      `Review round ${MAX_REVIEW_ROUNDS} complete — max rounds reached with ${unresolvedGaps.length} unresolved gap${unresolvedGaps.length === 1 ? '' : 's'}`,
    );

    return finish({
      reviewRounds,
      maxRoundsReachedWithGaps: true,
      unresolvedGaps,
    });
  }

  private async runReviewRound(params: {
    round: number;
    designDocument: string;
    contextMap: ContextMap;
    pwd: string;
    fsImpl: typeof fs;
    checklist: CoverageChecklistItem[];
    artifactSink: DesignReviewArtifactSink | undefined;
  }): Promise<DerivedReviewOutcome> {
    const loadedSource = loadSourceContext(params.contextMap, params.pwd, params.fsImpl);
    const reviewSourceContext = formatReviewSourceContext(loadedSource);
    let reviewPrompt = buildDesignReviewPrompt({
      designDocument: params.designDocument,
      sourceContext: reviewSourceContext,
      checklist: params.checklist,
    });
    let lastResponse = '';

    for (let attempt = 1; attempt <= MAX_REVIEW_PARSE_ATTEMPTS; attempt += 1) {
      if (attempt > 1) {
        this.logInfo(
          `Review round ${params.round}: retrying reviewer (attempt ${attempt}/${MAX_REVIEW_PARSE_ATTEMPTS})`,
        );
      }

      params.artifactSink?.writeReviewPrompt(params.round, reviewPrompt);
      lastResponse = await this.llmService.reviewDesignDocument(reviewPrompt);
      const parsed = parseDesignReviewResponse(lastResponse, params.checklist);

      if (parsed.error) {
        if (attempt === MAX_REVIEW_PARSE_ATTEMPTS) {
          return buildTerminalReviewFailureOutcome({
            checklist: params.checklist,
            rawResponse: lastResponse,
            reason: `Review parse failed after ${MAX_REVIEW_PARSE_ATTEMPTS} attempts: ${parsed.error}`,
          });
        }

        this.logInfo(
          `Review round ${params.round}: parse failed (attempt ${attempt}/${MAX_REVIEW_PARSE_ATTEMPTS}): ${parsed.error}`,
        );
        reviewPrompt = buildReviewParseRetryPrompt({
          reviewPrompt,
          failedResponse: lastResponse,
          parseError: parsed.error,
        });
        continue;
      }

      const manualFeedbackCount = parsed.result!.feedbackItems.length;
      const feedbackValidation = validateFeedbackItems({
        feedbackItems: parsed.result!.feedbackItems,
        loadedSource,
      });

      if (feedbackValidation.error) {
        if (attempt === MAX_REVIEW_PARSE_ATTEMPTS) {
          return buildTerminalReviewFailureOutcome({
            checklist: params.checklist,
            rawResponse: lastResponse,
            reason: `Review validation failed after ${MAX_REVIEW_PARSE_ATTEMPTS} attempts: ${feedbackValidation.error}`,
          });
        }

        this.logInfo(
          `Review round ${params.round}: feedback validation failed (attempt ${attempt}/${MAX_REVIEW_PARSE_ATTEMPTS}): ${feedbackValidation.error}`,
        );
        reviewPrompt = buildReviewParseRetryPrompt({
          reviewPrompt,
          failedResponse: lastResponse,
          parseError: feedbackValidation.error,
        });
        continue;
      }

      const derived = deriveReviewStatus({
        parsed: parsed.result!,
        expectedChecklist: params.checklist,
        designDocument: params.designDocument,
      });

      const uncoveredCount = derived.result.checklist.filter((entry) => !entry.covered).length;
      if (uncoveredCount > 0 || manualFeedbackCount > 0) {
        const parts: string[] = [];
        if (uncoveredCount > 0) {
          parts.push(`${uncoveredCount} uncovered checklist item${uncoveredCount === 1 ? '' : 's'}`);
        }
        if (manualFeedbackCount > 0) {
          parts.push(`${manualFeedbackCount} manual feedback item${manualFeedbackCount === 1 ? '' : 's'}`);
        }
        this.logInfo(`Review round ${params.round}: ${parts.join(', ')}`);
      }

      if (derived.statusOverridden) {
        this.logInfo(`Review round ${params.round}: STATUS overridden by coverage check`);
      }

      return {
        rawResponse: lastResponse,
        result: derived.result,
        statusOverridden: derived.statusOverridden,
        manualFeedbackCount,
      };
    }

    return buildTerminalReviewFailureOutcome({
      checklist: params.checklist,
      rawResponse: lastResponse,
      reason: `Review parse/validation failed after ${MAX_REVIEW_PARSE_ATTEMPTS} attempts`,
    });
  }

  private async runRevisionRound(params: {
    round: number;
    designDocument: string;
    generationPrompt: string;
    feedbackItems: DesignReviewFeedbackItem[];
    uncoveredChecklist: DesignReviewResult['checklist'];
    artifactSink: DesignReviewArtifactSink | undefined;
  }): Promise<RevisionRoundOutcome> {
    const allowedSections = deriveAllowedRevisionSections(
      params.feedbackItems,
      params.uncoveredChecklist,
    );
    const prompt = buildDesignRevisionPrompt({
      designDocument: params.designDocument,
      generationPrompt: params.generationPrompt,
      feedbackItems: params.feedbackItems,
      allowedSections,
    });

    params.artifactSink?.writeRevisionPrompt(params.round, prompt);
    const lastResponse = await this.llmService.reviseDesignDocument(prompt);
    const lockedRevision = lockRevisionToAllowedSections(
      params.designDocument,
      lastResponse,
      allowedSections,
    );
    const postProcessedRevision = await this.mermaidPostProcessor.postProcess(
      lockedRevision,
      params.generationPrompt,
    );
    const structure = validateDesignStructure({
      original: params.designDocument,
      revised: postProcessedRevision,
    });
    const preservation = validateRevisionPreservation({
      original: params.designDocument,
      revised: postProcessedRevision,
      feedbackItems: params.feedbackItems,
      uncoveredChecklist: params.uncoveredChecklist,
    });
    const errors = [...structure.errors, ...preservation.errors];

    if (errors.length === 0) {
      this.logInfo(`Review round ${params.round}: revision accepted`);
      return { designDocument: postProcessedRevision };
    }

    for (const error of errors) {
      this.logInfo(`Review round ${params.round}: revision validation failed: ${error}`);
    }

    return {
      designDocument: postProcessedRevision,
      terminalFailureReason: `Revision validation failed: ${errors.join('; ')}`,
    };
  }
}

function buildTerminalReviewFailureOutcome(input: {
  checklist: CoverageChecklistItem[];
  rawResponse: string;
  reason: string;
}): DerivedReviewOutcome {
  return {
    rawResponse: input.rawResponse,
    result: {
      status: 'NEEDS_REVISION',
      checklist: input.checklist.map((item) => ({
        id: item.id,
        label: item.label,
        sourceFile: item.sourceFile,
        covered: false,
        category: item.category,
      })),
      feedbackItems: [{ section: 'Review Result', description: input.reason }],
      rawResponse: input.rawResponse,
    },
    statusOverridden: false,
    manualFeedbackCount: 1,
    terminalFailureReason: input.reason,
  };
}

function collectUnresolvedGaps(result: DesignReviewResult): string[] {
  const gaps: string[] = [];

  for (const entry of result.checklist) {
    if (!entry.covered) {
      gaps.push(entry.id);
    }
  }

  for (const item of result.feedbackItems) {
    gaps.push(item.description);
  }

  return gaps;
}
