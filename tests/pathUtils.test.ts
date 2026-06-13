import {
  uriToPath,
  isWithinPwd,
  sanitizeModelForFilename,
  qualifyArtifactFilename,
  qualifyRoundAttemptArtifactFilename,
  qualifyVersionedArtifactFilename,
} from '../src/utils/pathUtils.js';
import * as path from 'node:path';

describe('pathUtils', () => {
  describe('uriToPath', () => {
    it('should convert file URI to path', () => {
      const abs = path.resolve('/app/src/index.ts');
      const uri = new URL(`file://${abs}`).toString();
      expect(uriToPath(uri)).toBe(abs);
    });
  });

  describe('isWithinPwd', () => {
    it('should return true if inside pwd', () => {
        const pwd = path.resolve('/app');
        const abs = path.resolve('/app/src/index.ts');
        expect(isWithinPwd(abs, pwd)).toBe(true);
    });

    it('should return false if outside pwd', () => {
        const pwd = path.resolve('/app');
        const abs = path.resolve('/etc/passwd');
        expect(isWithinPwd(abs, pwd)).toBe(false);
    });
  });

  describe('sanitizeModelForFilename', () => {
    it('should keep simple model names', () => {
      expect(sanitizeModelForFilename('gpt-4')).toBe('gpt-4');
    });

    it('should replace path separators and invalid characters', () => {
      expect(sanitizeModelForFilename('google/gemma-4-26b-a4b')).toBe('google-gemma-4-26b-a4b');
    });

    it('should fall back when the model name is empty after sanitization', () => {
      expect(sanitizeModelForFilename('///')).toBe('model');
    });
  });

  describe('qualifyArtifactFilename', () => {
    it('should insert the model slug before the extension', () => {
      expect(qualifyArtifactFilename('design.md', 'gpt-4')).toBe('design.gpt-4.md');
    });
  });

  describe('qualifyVersionedArtifactFilename', () => {
    it('should insert the version and model slug before extension', () => {
      expect(qualifyVersionedArtifactFilename('design.md', 'v0', 'gpt-4')).toBe(
        'design.v0.gpt-4.md'
      );
    });
  });

  describe('qualifyRoundAttemptArtifactFilename', () => {
    it('should insert round, attempt, and model slug before extension', () => {
      expect(qualifyRoundAttemptArtifactFilename('review-prompt.md', 2, 'gpt-4')).toBe(
        'review-prompt.2.gpt-4.md',
      );
    });
  });

});
