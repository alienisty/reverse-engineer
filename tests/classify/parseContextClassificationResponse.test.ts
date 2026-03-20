import { describe, it, expect } from '@jest/globals';
import { parseContextClassificationResponse } from '../../src/classify/parseContextClassificationResponse.js';

const candidates = ['src/Request.java', 'util/Generic.java'];

describe('parseContextClassificationResponse', () => {
  it('parses newline-separated promote paths', () => {
    const response = 'src/Request.java\n';
    const parsed = parseContextClassificationResponse(response, candidates);

    expect(parsed.error).toBeUndefined();
    expect(parsed.promoteRelativePaths).toEqual(['src/Request.java']);
  });

  it('accepts an empty response', () => {
    const parsed = parseContextClassificationResponse('\n\n', candidates);

    expect(parsed.error).toBeUndefined();
    expect(parsed.promoteRelativePaths).toEqual([]);
  });

  it('strips optional bullet prefixes', () => {
    const response = '- src/Request.java';
    const parsed = parseContextClassificationResponse(response, candidates);

    expect(parsed.error).toBeUndefined();
    expect(parsed.promoteRelativePaths).toEqual(['src/Request.java']);
  });

  it('rejects unknown paths', () => {
    const parsed = parseContextClassificationResponse('other/Unknown.java', candidates);

    expect(parsed.error).toContain('not a dependency candidate');
  });

  it('rejects duplicate promote paths', () => {
    const response = 'src/Request.java\nsrc/Request.java';
    const parsed = parseContextClassificationResponse(response, candidates);

    expect(parsed.error).toContain('Duplicate promoted path');
  });
});
