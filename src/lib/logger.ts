/** Minimal structured logger. Keeps secrets out of logs by only logging known fields. */

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: Level =
  (process.env.STUDIO_LOG_LEVEL as Level | undefined) ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

function emit(level: Level, scope: string, message: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < ORDER[MIN_LEVEL]) return;
  const line = { level, scope, message, ...fields };
  const text = JSON.stringify(line, replacer);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

function replacer(_key: string, value: unknown) {
  if (typeof value === 'string' && value.length > 600) return `${value.slice(0, 600)}…`;
  if (value instanceof Error) return { name: value.name, message: value.message };
  return value;
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, fields?: Record<string, unknown>) =>
      emit('debug', scope, message, fields),
    info: (message: string, fields?: Record<string, unknown>) =>
      emit('info', scope, message, fields),
    warn: (message: string, fields?: Record<string, unknown>) =>
      emit('warn', scope, message, fields),
    error: (message: string, fields?: Record<string, unknown>) =>
      emit('error', scope, message, fields),
  };
}

export type Logger = ReturnType<typeof createLogger>;
