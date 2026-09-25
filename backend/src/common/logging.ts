/**
 * How the backend writes its log lines, decided in one place.
 *
 * Two audiences read them and want opposite things. At a desk, a coloured
 * line with a relative timestamp is what a person scans. On Vercel or in a
 * container, every line is parsed by a machine: Vercel indexes a JSON line
 * into filterable fields, while a coloured line is just text to search.
 * So the format follows NODE_ENV, and LOG_FORMAT overrides it for the
 * times the two disagree (a JSON line reproduced locally, a container
 * tailed by a person).
 *
 * The level follows the same split: everything at a desk, `log` and above
 * once the lines cost money to store — `LOG_LEVEL` lowers or raises it.
 *
 * Pure functions over `process.env`-shaped input, so the policy is
 * assertable in a spec without booting Nest.
 */
import { ConsoleLogger } from '@nestjs/common'
import type { LogLevel, LoggerService } from '@nestjs/common'

export interface LoggingEnv {
  NODE_ENV?: string | undefined
  LOG_FORMAT?: string | undefined
  LOG_LEVEL?: string | undefined
}

export type LogFormat = 'json' | 'pretty'

/** Nest's own order, least to most severe. */
const LEVELS: readonly LogLevel[] = [
  'verbose',
  'debug',
  'log',
  'warn',
  'error',
  'fatal',
]

export function logFormat(env: LoggingEnv): LogFormat {
  if (env.LOG_FORMAT === 'json' || env.LOG_FORMAT === 'pretty') {
    return env.LOG_FORMAT
  }
  return env.NODE_ENV === 'production' ? 'json' : 'pretty'
}

/**
 * The levels Nest will print: the configured minimum and everything above.
 * An unknown LOG_LEVEL falls back to the default rather than silencing the
 * process — a typo in an environment variable must not turn the logs off.
 */
export function logLevels(env: LoggingEnv): LogLevel[] {
  const fallback: LogLevel = logFormat(env) === 'json' ? 'log' : 'debug'
  const wanted = LEVELS.includes(env.LOG_LEVEL as LogLevel)
    ? (env.LOG_LEVEL as LogLevel)
    : fallback
  return LEVELS.slice(LEVELS.indexOf(wanted))
}

/** The logger handed to `NestFactory.create`, built from that policy. */
export function createLogger(env: LoggingEnv): LoggerService {
  return new ConsoleLogger({
    json: logFormat(env) === 'json',
    logLevels: logLevels(env),
  })
}
