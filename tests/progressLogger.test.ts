import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import {
  createConsoleProgressLogger,
  formatProgressMessage,
  PROGRESS_LOG_PREFIX,
  TUIProgressLogger,
} from '../src/progressLogger.js';

describe('progressLogger', () => {
  it('formats progress messages with a stable prefix', () => {
    expect(formatProgressMessage('Review started')).toBe(`${PROGRESS_LOG_PREFIX} Review started`);
  });

  it('logs info messages to console.log with prefix', () => {
    const log = jest.fn();
    const warn = jest.fn();
    const logger = createConsoleProgressLogger({ log, warn });

    logger.info('Extracted 12 coverage checklist items from 2 main files');

    expect(log).toHaveBeenCalledWith(
      '[reverse-engineer] Extracted 12 coverage checklist items from 2 main files',
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs warning messages to console.warn with prefix', () => {
    const log = jest.fn();
    const warn = jest.fn();
    const logger = createConsoleProgressLogger({ log, warn });

    logger.warn('Review round 3 complete — max rounds reached with 2 unresolved gaps');

    expect(warn).toHaveBeenCalledWith(
      '[reverse-engineer] Review round 3 complete — max rounds reached with 2 unresolved gaps',
    );
    expect(log).not.toHaveBeenCalled();
  });
});

describe('TUIProgressLogger', () => {
  let stdoutWriteSpy: any;

  beforeEach(() => {
    jest.useFakeTimers();
    stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    process.env.LLM_MODEL = 'test-model';
  });

  afterEach(() => {
    jest.useRealTimers();
    stdoutWriteSpy.mockRestore();
  });

  it('initializes with pending stages and start timer', () => {
    const logger = new TUIProgressLogger();
    
    // Initial draw happens on instantiation
    expect(stdoutWriteSpy).toHaveBeenCalled();
    
    logger.stop();
  });

  it('transitions stages and updates details based on parsed messages', () => {
    const logger = new TUIProgressLogger();

    logger.info('Starting design generation for project "test-proj"');
    const stages = (logger as any).stages;
    expect(stages[0].status).toBe('running');
    expect(stages[0].detail).toBe('Detecting languages...');

    logger.info('Detecting languages from 3 input file(s)');
    expect(stages[0].detail).toBe('Detecting languages from 3 input files...');

    logger.info('Detected language(s): typescript');
    expect(stages[0].detail).toBe('Languages: typescript');

    logger.info('Discovering workspace context');
    expect(stages[0].status).toBe('done');
    expect(stages[1].status).toBe('running');

    logger.info('Discovery complete: 5 main, 2 dependencies, 10 uses');
    expect(stages[1].status).toBe('done');
    expect(stages[1].detail).toBe('Discovered 5 main, 2 dependencies, 10 uses');

    logger.info('Building generation prompt');
    expect(stages[2].status).toBe('done');
    expect(stages[2].detail).toBe('Skipped (no dependencies)');
    expect(stages[3].status).toBe('running');

    logger.info('Generating design document (LLM)');
    expect(stages[3].detail).toBe('Generating design document via LLM...');

    logger.info('Post-processing Mermaid diagrams');
    expect(stages[3].detail).toBe('Post-processing Mermaid...');

    logger.info('Wrote prompt.md and design.v0.test-model.md');
    expect(stages[3].status).toBe('done');

    logger.info('Extracted 8 coverage checklist items');
    expect(stages[4].status).toBe('running');
    expect(stages[4].detail).toBe('Extracted 8 checklist items');

    logger.info('Design review: up to 3 rounds, 8 checklist items');
    expect(stages[4].detail).toBe('Round 0/3 (8 checklist items)');

    logger.info('Review round 1/3: loading source context and calling reviewer');
    expect(stages[4].detail).toBe('Round 1/3: Calling reviewer...');

    logger.info('Review round 1/3: revising design (2 feedback item(s), 4 uncovered checklist item(s))');
    expect(stages[4].detail).toBe('Round 1/3: Revising (2 feedback, 4 uncovered)');

    logger.info('Review complete — all checklist items covered');
    expect(stages[4].status).toBe('done');

    logger.stop();
  });

  it('handles warning messages in TUI logger', () => {
    const logger = new TUIProgressLogger();

    logger.warn('Review round 3 complete — max rounds reached with 2 unresolved gaps');
    const stages = (logger as any).stages;
    expect(stages[4].status).toBe('warning');
    expect(stages[4].detail).toBe('Finished with 2 unresolved gaps');

    logger.stop();
  });
});
