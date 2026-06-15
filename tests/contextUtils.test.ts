import { deduplicateContextMap } from '../src/utils/contextUtils.js';
import { describe, it, expect } from '@jest/globals';
import type { ContextMap } from '../src/types/context.js';

describe('deduplicateContextMap', () => {
  it('should remove duplicates within each bucket while preserving order', () => {
    const input: ContextMap = {
      main: ['/a/b.ts', '/a/c.ts', '/a/b.ts'],
      dependencies: ['/a/d.ts', '/a/e.ts', '/a/d.ts'],
      uses: ['/a/f.ts', '/a/g.ts', '/a/f.ts'],
    };

    const output = deduplicateContextMap(input);

    expect(output).toEqual({
      main: ['/a/b.ts', '/a/c.ts'],
      dependencies: ['/a/d.ts', '/a/e.ts'],
      uses: ['/a/f.ts', '/a/g.ts'],
    });
  });

  it('should enforce priority main > dependencies > uses when files overlap', () => {
    const input: ContextMap = {
      main: ['/a/b.ts', '/a/c.ts'],
      dependencies: ['/a/c.ts', '/a/d.ts', '/a/e.ts'],
      uses: ['/a/b.ts', '/a/e.ts', '/a/f.ts'],
    };

    const output = deduplicateContextMap(input);

    expect(output).toEqual({
      main: ['/a/b.ts', '/a/c.ts'],
      dependencies: ['/a/d.ts', '/a/e.ts'],
      uses: ['/a/f.ts'],
    });
  });

  it('should handle empty buckets gracefully', () => {
    const input: ContextMap = {
      main: [],
      dependencies: [],
      uses: [],
    };

    const output = deduplicateContextMap(input);

    expect(output).toEqual({
      main: [],
      dependencies: [],
      uses: [],
    });
  });
});
