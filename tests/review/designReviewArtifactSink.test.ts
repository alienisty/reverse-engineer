import { describe, expect, it, jest } from '@jest/globals';
import * as path from 'node:path';
import { FileDesignReviewArtifactSink } from '../../src/review/designReviewArtifactSink.js';
import { DESIGN_REVISION_SYSTEM_PROMPT, DESIGN_REVIEW_SYSTEM_PROMPT } from '../../src/llm.js';

describe('FileDesignReviewArtifactSink', () => {
  it('writes review and revision artifacts immediately', () => {
    const writeFileSync = jest.fn();
    const sink = new FileDesignReviewArtifactSink({
      outputDir: '/out/my-project',
      model: 'test-model',
      fs: { writeFileSync } as any,
    });

    sink.writeReviewPrompt(1, 'review user prompt');
    sink.writeReviewResponse(1, 'review raw response');
    sink.writeRevisionPrompt(1, 'revision user prompt');
    sink.writeRevisionDesign(1, 'revised design');
    sink.writeFinalDesign('final design');

    expect(writeFileSync).toHaveBeenCalledWith(
      path.join('/out/my-project', 'review-prompt.1.test-model.md'),
      `${DESIGN_REVIEW_SYSTEM_PROMPT}\nreview user prompt`,
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      path.join('/out/my-project', 'review.1.test-model.md'),
      'review raw response',
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      path.join('/out/my-project', 'revision-prompt.1.test-model.md'),
      `${DESIGN_REVISION_SYSTEM_PROMPT}\nrevision user prompt`,
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      path.join('/out/my-project', 'design.v1.test-model.md'),
      'revised design',
    );
    expect(writeFileSync).toHaveBeenCalledWith(
      path.join('/out/my-project', 'design.test-model.md'),
      'final design',
    );
  });
});
