/**
 * Simple logger utility with tag-based filtering.
 * In production builds, only warnings and errors are logged.
 */

const IS_DEV = __DEV__;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel = IS_DEV ? 'debug' : 'warn';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function format(level: LogLevel, tag: string, message: string): string {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const icon = {debug: '🔍', info: '📋', warn: '⚠️', error: '❌'}[level];
  return `${icon} [${ts}] [${tag}] ${message}`;
}

export const logger = {
  debug(tag: string, message: string, data?: unknown): void {
    if (!shouldLog('debug')) return;
    console.log(format('debug', tag, message), data ?? '');
  },
  info(tag: string, message: string, data?: unknown): void {
    if (!shouldLog('info')) return;
    console.info(format('info', tag, message), data ?? '');
  },
  warn(tag: string, message: string, data?: unknown): void {
    if (!shouldLog('warn')) return;
    console.warn(format('warn', tag, message), data ?? '');
  },
  error(tag: string, message: string, err?: unknown): void {
    if (!shouldLog('error')) return;
    console.error(format('error', tag, message), err ?? '');
  },
};
