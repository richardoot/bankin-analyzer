/**
 * Boots the real application for e2e specs, on a database of its own.
 *
 * Two things are substituted, and only two:
 *  - PrismaService, pointed at a throwaway PostgreSQL provisioned from
 *    prisma/migrations (see e2e-database.ts);
 *  - SupabaseService, the one call that leaves the machine to validate a
 *    token.
 *
 * Everything else runs for real — SupabaseGuard (token extraction, user
 * auto-provisioning), the global ValidationPipe, the exception filter, the
 * services and the SQL. That is the point: these specs exist to cover the
 * layers a mocked-Prisma unit test cannot reach.
 */
import { Test } from '@nestjs/testing'
import type { TestingModule } from '@nestjs/testing'
import { UnauthorizedException, ValidationPipe } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import type { Server } from 'node:http'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'
import { SupabaseService } from '../src/auth/supabase.service'
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter'
import { createE2eDatabase } from './e2e-database'

/** A caller: a bearer token, and the Supabase identity it stands for. */
export interface E2eIdentity {
  token: string
  supabaseId: string
  email: string
}

/**
 * Build an identity. Each spec file gets an empty database, so labels only
 * have to be unique within a file.
 */
export function e2eIdentity(label: string): E2eIdentity {
  return {
    token: `e2e-token-${label}`,
    supabaseId: `e2e-supabase-${label}`,
    email: `${label}@e2e.invalid`,
  }
}

export interface E2eContext {
  app: INestApplication
  /** Typed once here, so no spec has to cast `getHttpServer()` itself. */
  server: Server
  prisma: PrismaService
  /** Authorization header for a known identity. */
  auth: (identity: E2eIdentity) => { Authorization: string }
  /**
   * Supabase ids the app asked to delete from Auth. Recorded rather than
   * ignored: deleting an account must remove the identity too, and that is
   * only observable here.
   */
  deletedFromAuth: string[]
  /** Closes the app and drops the database. */
  close: () => Promise<void>
}

export async function createE2eApp(
  identities: E2eIdentity[]
): Promise<E2eContext> {
  const byToken = new Map(
    identities.map(identity => [identity.token, identity])
  )
  const deletedFromAuth: string[] = []
  const database = await createE2eDatabase()

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(database.prisma)
    .overrideProvider(SupabaseService)
    .useValue({
      deleteUser: (supabaseId: string) => {
        deletedFromAuth.push(supabaseId)
        return Promise.resolve()
      },
      getUser: (token: string) => {
        const identity = byToken.get(token)
        if (!identity) {
          // Same failure the real service raises on a bad token, so the
          // unauthenticated cases exercise the true code path.
          throw new UnauthorizedException('Invalid or expired token')
        }
        return Promise.resolve({
          id: identity.supabaseId,
          email: identity.email,
          aud: 'authenticated',
          role: 'authenticated',
          created_at: new Date().toISOString(),
          app_metadata: {},
          user_metadata: {},
        })
      },
    })
    .compile()

  const app = moduleFixture.createNestApplication()

  // Mirrors main.ts: without these, DTO validation and error shapes differ
  // from production and the specs would assert on something that never runs.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  )
  app.useGlobalFilters(new AllExceptionsFilter())

  await app.init()

  return {
    app,
    server: app.getHttpServer() as Server,
    prisma: database.prisma as unknown as PrismaService,
    auth: identity => ({ Authorization: `Bearer ${identity.token}` }),
    deletedFromAuth,
    close: async () => {
      await app.close()
      await database.close()
    },
  }
}
