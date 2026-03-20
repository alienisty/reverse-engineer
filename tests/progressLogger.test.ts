import { describe, expect, it, jest } from '@jest/globals';
import {
  createConsoleProgressLogger,
  formatProgressMessage,
  PROGRESS_LOG_PREFIX,
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
