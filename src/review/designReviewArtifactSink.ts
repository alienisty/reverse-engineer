import {
  DESIGN_REVISION_SYSTEM_PROMPT,
  DESIGN_REVIEW_SYSTEM_PROMPT,
} from '../llm.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  qualifyArtifactFilename,
  qualifyRoundAttemptArtifactFilename,
  qualifyVersionedArtifactFilename,
} from '../utils/pathUtils.js';

export interface DesignReviewArtifactSink {
  writeReviewPrompt(round: number, prompt: string): void;
  writeReviewResponse(round: number, rawResponse: string): void;
  writeRevisionPrompt(round: number, prompt: string): void;
  writeRevisionDesign(round: number, designDocument: string): void;
  writeFinalDesign(designDocument: string): void;
}

export interface FileDesignReviewArtifactSinkOptions {
  outputDir: string;
  model: string;
  fs?: typeof fs;
  logInfo?: (message: string) => void;
}

export class FileDesignReviewArtifactSink implements DesignReviewArtifactSink {
  private readonly outputDir: string;
  private readonly model: string;
  private readonly fsImpl: typeof fs;
  private readonly logInfo: ((message: string) => void) | undefined;

  constructor(options: FileDesignReviewArtifactSinkOptions) {
    this.outputDir = options.outputDir;
    this.model = options.model;
    this.fsImpl = options.fs ?? fs;
    this.logInfo = options.logInfo;
  }

  writeReviewPrompt(round: number, prompt: string): void {
    const filename = qualifyRoundAttemptArtifactFilename(
      'review-prompt.md',
      round,
      this.model,
    );
    this.writeFile(filename, `${DESIGN_REVIEW_SYSTEM_PROMPT}\n${prompt}`);
  }

  writeReviewResponse(round: number, rawResponse: string): void {
    const filename = qualifyVersionedArtifactFilename('review.md', `${round}`, this.model);
    this.writeFile(filename, rawResponse);
  }

  writeRevisionPrompt(round: number, prompt: string): void {
    const filename = qualifyRoundAttemptArtifactFilename(
      'revision-prompt.md',
      round,
      this.model,
    );
    this.writeFile(filename, `${DESIGN_REVISION_SYSTEM_PROMPT}\n${prompt}`);
  }

  writeRevisionDesign(round: number, designDocument: string): void {
    const filename = qualifyVersionedArtifactFilename('design.md', `v${round}`, this.model);
    this.writeFile(filename, designDocument);
  }

  writeFinalDesign(designDocument: string): void {
    const filename = qualifyArtifactFilename('design.md', this.model);
    this.writeFile(filename, designDocument);
  }

  private writeFile(filename: string, contents: string): void {
    this.fsImpl.writeFileSync(path.join(this.outputDir, filename), contents);
    this.logInfo?.(`Wrote ${filename}`);
  }
}
