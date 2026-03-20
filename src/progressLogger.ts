export const PROGRESS_LOG_PREFIX = '[reverse-engineer]';

export interface ProgressLogger {
  info(message: string): void;
  warn(message: string): void;
}

export type ConsoleLike = Pick<Console, 'log' | 'warn'>;

export function formatProgressMessage(message: string): string {
  return `${PROGRESS_LOG_PREFIX} ${message}`;
}

export function createConsoleProgressLogger(consoleLike: ConsoleLike = console): ProgressLogger {
  return {
    info(message: string) {
      consoleLike.log(formatProgressMessage(message));
    },
    warn(message: string) {
      consoleLike.warn(formatProgressMessage(message));
    },
  };
}
