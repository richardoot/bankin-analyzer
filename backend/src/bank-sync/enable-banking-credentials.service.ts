/**
 * Which Enable Banking application a bank sync signs with, for a given user.
 *
 * Every user brings their own Enable Banking application — its id and the
 * private key downloaded once from the Control Panel — stored encrypted
 * (`credential-encryption.ts`) against their account. No server-wide
 * fallback: a user with nothing configured of their own cannot sync, full
 * stop — `ENABLE_BANKING_APP_ID` / `ENABLE_BANKING_PRIVATE_KEY_PATH` are read
 * only by the standalone operator scripts (`probe-enable-banking.ts`,
 * `spike-enable-banking-fetch.ts`), never by this service.
 */
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { buildJwt } from './enable-banking.jwt'
import { encryptSecret, decryptSecret } from './credential-encryption'
import {
  EnableBankingClient,
  EnableBankingError,
} from './enable-banking.client'
import type {
  EnableBankingApplication,
  EnableBankingCredentials,
} from './enable-banking.client'

export class InvalidEnableBankingCredentialsError extends Error {}

@Injectable()
export class EnableBankingCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: EnableBankingClient
  ) {}

  /** The credentials to sign with for this user, or null if none are set up. */
  async resolve(userId: string): Promise<EnableBankingCredentials | null> {
    const stored = await this.prisma.enableBankingCredential.findUnique({
      where: { userId },
    })
    if (!stored) return null
    return {
      applicationId: stored.applicationId,
      privateKey: decryptSecret(stored.encryptedPrivateKey),
    }
  }

  async isConfigured(userId: string): Promise<boolean> {
    // Existence only, never `resolve()`: decrypting a private key just to
    // answer a boolean is needless secret handling, and it would turn a
    // missing CREDENTIALS_ENCRYPTION_KEY into a 500 on every settings page
    // load instead of a failure at the one call that actually signs.
    return (await this.hasOwnCredentials(userId)) !== null
  }

  /** This user's own application, if they have set one up. */
  async hasOwnCredentials(
    userId: string
  ): Promise<{ applicationId: string } | null> {
    const stored = await this.prisma.enableBankingCredential.findUnique({
      where: { userId },
      select: { applicationId: true },
    })
    return stored
  }

  /**
   * Store this user's Enable Banking application.
   *
   * The key is downloaded once from the Control Panel and is never shown
   * again afterwards, so a typo caught only at the next sync is a typo the
   * user cannot fix by re-reading it — it is validated by actually signing
   * with it before anything is persisted.
   *
   * Returns the application's own state as Enable Banking reports it: an
   * application saved while still inactive is a valid save, but the caller
   * should say so — every bank-facing call will be refused until it is
   * activated from the Control Panel.
   */
  async save(
    userId: string,
    applicationId: string,
    privateKeyPem: string
  ): Promise<{ active: boolean; environment: 'SANDBOX' | 'PRODUCTION' }> {
    try {
      buildJwt(applicationId, privateKeyPem)
    } catch {
      throw new InvalidEnableBankingCredentialsError(
        'This private key cannot be used to sign a request — check the .pem file.'
      )
    }

    // The key signs — but only Enable Banking knows whether it signs for
    // this application id. A mismatched pair stored today is a silent 401
    // at the first sync; asked about now, it is a form error the user can
    // fix while the Control Panel is still open.
    let application: EnableBankingApplication
    try {
      application = await this.client.getApplication({
        applicationId,
        privateKey: privateKeyPem,
      })
    } catch (error) {
      if (
        error instanceof EnableBankingError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        throw new InvalidEnableBankingCredentialsError(
          `Enable Banking refused these credentials (${error.status}) — ` +
            'check that the App ID is the one shown next to this key in the ' +
            'Control Panel.'
        )
      }
      // Enable Banking unreachable or failing: nothing is stored, and the
      // error keeps its upstream identity rather than blaming the user.
      throw error
    }

    const encryptedPrivateKey = encryptSecret(privateKeyPem)
    await this.prisma.enableBankingCredential.upsert({
      where: { userId },
      create: { userId, applicationId, encryptedPrivateKey },
      update: { applicationId, encryptedPrivateKey },
    })
    return {
      active: application.active,
      environment: application.environment,
    }
  }

  async remove(userId: string): Promise<void> {
    await this.prisma.enableBankingCredential.deleteMany({ where: { userId } })
  }
}
