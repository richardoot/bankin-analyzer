/**
 * Whether this instance can serve a request right now.
 *
 * One check, the one that matters: can the database be reached. A backend
 * that boots but cannot query Supabase answers every real request with a
 * 500, and the only way an external monitor tells the two apart is a probe
 * that runs a query. Bounded by a short timeout, because a hung connection
 * to the pooler is exactly the failure a monitor exists to catch, and a
 * probe that waits along with it never reports anything.
 */
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export const DATABASE_TIMEOUT_MS = 3000

export interface HealthReport {
  status: 'ok' | 'error'
  checks: {
    database: { status: 'ok' | 'error'; latencyMs: number }
  }
  /** This instance's pg pool — see PrismaService.poolStats. */
  pool: { total: number; idle: number; waiting: number }
  /** The deployed commit, so a monitor's screenshot says which build failed. */
  version: string | null
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthReport> {
    const database = await this.checkDatabase()
    return {
      status: database.status,
      checks: { database },
      pool: this.prisma.poolStats(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    }
  }

  private async checkDatabase(): Promise<HealthReport['checks']['database']> {
    const startedAt = Date.now()
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(`database did not answer within ${DATABASE_TIMEOUT_MS}ms`)
          ),
        DATABASE_TIMEOUT_MS
      )
    })
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout])
      return { status: 'ok', latencyMs: Date.now() - startedAt }
    } catch {
      return { status: 'error', latencyMs: Date.now() - startedAt }
    } finally {
      clearTimeout(timer)
    }
  }
}
