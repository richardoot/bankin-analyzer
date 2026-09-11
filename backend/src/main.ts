import { readFileSync } from 'fs'
import { join } from 'path'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { apiDocsEnabled, helmetOptions } from './common/http-hardening'

/**
 * TLS for local development, opt-in through `BACKEND_HTTPS=1`.
 *
 * The bank sync forces it: Enable Banking only redirects to an `https://` URL,
 * and a page served over https may not call an API served over http — the
 * browser blocks it as mixed content. So a frontend able to authorise a bank
 * needs a backend that speaks TLS too.
 *
 * Opt-in rather than default because `http://localhost:3000` is what the
 * Supabase OAuth redirect and the CORS allowlist are registered against, and
 * turning TLS on for every session would trade a working login for a screen
 * used a handful of times.
 *
 * Returns undefined when the option is off, which is what tells Nest to serve
 * plain HTTP.
 */
function httpsOptions(): { key: Buffer; cert: Buffer } | undefined {
  if (process.env.BACKEND_HTTPS !== '1') return undefined

  const dir = process.env.LOCAL_TLS_DIR ?? join(process.cwd(), '..', 'certs')
  try {
    return {
      key: readFileSync(join(dir, 'localhost-key.pem')),
      cert: readFileSync(join(dir, 'localhost.pem')),
    }
  } catch {
    // Said rather than crashed on a stack trace: the certificate is one
    // command away and nothing else explains what is missing.
    throw new Error(
      `BACKEND_HTTPS=1 but no certificate in ${dir}.\n` +
        'Run scripts/make-local-cert.sh first.'
    )
  }
}

async function bootstrap(): Promise<void> {
  const tls = httpsOptions()
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...(tls ? { httpsOptions: tls } : {}),
  })

  // Trust the reverse proxy (Vercel, Railway, etc.) so that `req.protocol`
  // reflects the client-facing scheme from `X-Forwarded-Proto` and the MCP
  // discovery endpoints advertise https:// URLs instead of http://.
  app.set('trust proxy', 1)

  // Security headers. Strict when the docs are off (production), relaxed
  // while they are on — Swagger UI is the one page that cannot live under a
  // deny-all CSP. Both decisions come from common/http-hardening.ts.
  const docsEnabled = apiDocsEnabled(process.env)
  app.use(helmet(helmetOptions(docsEnabled)))

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  )

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter())

  // Enable CORS for frontend and MCP clients
  const allowedOrigins = (
    process.env.FRONTEND_URL ?? 'http://localhost:5173'
  ).split(',')

  // Under TLS the frontend moves too — a separate port, so the plain stack
  // keeps 5173 — and an origin the allowlist has never heard of is refused by
  // the browser before the request is made, with no clue in any log here.
  if (tls) allowedOrigins.push('https://localhost:5174')
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  })

  // Swagger — development only. `/api/docs` hands the complete route and DTO
  // map to anyone unauthenticated, which is a feature at a desk and a
  // reconnaissance report on the open internet. `API_DOCS=1` re-enables it
  // deliberately if a production instance ever needs to show its contract.
  if (docsEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Finance Analyzer API')
      .setDescription('API pour la gestion des finances personnelles')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('users', 'Gestion des utilisateurs')
      .build()

    const documentFactory = (): ReturnType<
      typeof SwaggerModule.createDocument
    > => SwaggerModule.createDocument(app, config)

    SwaggerModule.setup('api/docs', app, documentFactory)
  }

  // A different port under TLS, so the plain-HTTP stack — the podman
  // containers among them — keeps 3000 and the two can run side by side.
  const port = Number(process.env.PORT ?? (tls ? 3443 : 3000))
  await app.listen(port)
  console.log(`Listening on ${tls ? 'https' : 'http'}://localhost:${port}`)
}
void bootstrap()
