import { PromptBuilder } from '../src/promptBuilder.js';
import { describe, it, expect, jest } from '@jest/globals';
import type { ContextMap } from '../src/types/context.js';

describe('PromptBuilder', () => {
  it('should build prompt with three ContextMap buckets and role framing', () => {
    const mockFs = {
      existsSync: jest.fn().mockReturnValue(true),
      readFileSync: jest.fn((file: string) => `content:${file}`),
    };

    const builder = new PromptBuilder(mockFs as any);
    const contextMap: ContextMap = {
      main: ['src/main.ts'],
      dependencies: ['src/dep.ts'],
      uses: ['src/consumer.ts'],
    };
    const prompt = builder.buildPrompt(contextMap);

    expect(prompt).toContain('## Main');
    expect(prompt).toContain('## Dependencies');
    expect(prompt).toContain('## Uses');
    expect(prompt).not.toContain('## References');
    expect(prompt).toContain('content:src/main.ts');
    expect(prompt).toContain('content:src/dep.ts');
    expect(prompt).toContain('content:src/consumer.ts');
    expect(prompt).toContain('Core design subject');
    expect(prompt).toContain('Implementation context');
    expect(prompt).toContain('Read-only evidence');
    expect(prompt).toContain('Formal behavioral specification');
    expect(prompt).toContain('No consumer-driven architecture');
    expect(prompt).toContain('stable illustrative snippets');
    expect(prompt).toContain('fictional names');
    expect(prompt).toContain('Evidence-Based (Usage)');
  });

  it('should split uses into Uses and Tests sections', () => {
    const mockFs = {
      existsSync: jest.fn().mockReturnValue(true),
      readFileSync: jest.fn((file: string) => `content:${file}`),
    };

    const builder = new PromptBuilder(mockFs as any);
    const prompt = builder.buildPrompt({
      main: ['src/main.ts'],
      dependencies: [],
      uses: ['src/app/Consumer.ts', 'core/src/test/java/FooTest.java'],
    });

    expect(prompt).toContain('## Uses');
    expect(prompt).toContain('## Tests');
    expect(prompt).toContain('content:src/app/Consumer.ts');
    expect(prompt).toContain('content:core/src/test/java/FooTest.java');

    const usesSection = prompt.match(/## Uses\n([\s\S]*?)\n## Tests/)?.[1] ?? '';
    expect(usesSection).toContain('Consumer');
    expect(usesSection).not.toContain('FooTest');
  });

  it('should allow empty uses section', () => {
    const mockFs = {
      existsSync: jest.fn().mockReturnValue(true),
      readFileSync: jest.fn().mockReturnValue('file content'),
    };

    const builder = new PromptBuilder(mockFs as any);
    const prompt = builder.buildPrompt({
      main: ['src/main.ts'],
      dependencies: ['src/dep.ts'],
      uses: [],
    });

    expect(prompt).toContain('## Uses');
    expect(prompt).toContain('Empty uses is acceptable');
    expect(prompt).toContain('file content');
  });
});
