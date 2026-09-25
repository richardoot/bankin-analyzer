/**
 * Sentry, started before anything else.
 *
 * Imported first by main.ts on purpose: the SDK patches `http`, `pg` and
 * the Prisma client at load time, so anything required before it runs
 * uninstrumented. Silently inert without SENTRY_DSN, which is the case at
 * a desk and in the test suites.
 */
import * as Sentry from '@sentry/nestjs'
import { sentryOptions } from './common/sentry'

const options = sentryOptions(process.env)
if (options) {
  Sentry.init({
    ...options,
    integrations: [Sentry.prismaIntegration()],
  })
}
