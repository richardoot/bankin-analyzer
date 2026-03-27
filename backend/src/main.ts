import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

  // Security headers (configured to allow Swagger UI and OAuth popups)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  )

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

  // Enable CORS for frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  })

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Finance Analyzer API')
    .setDescription('API pour la gestion des finances personnelles')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('users', 'Gestion des utilisateurs')
    .build()

  const documentFactory = (): ReturnType<typeof SwaggerModule.createDocument> =>
    SwaggerModule.createDocument(app, config)

  SwaggerModule.setup('api/docs', app, documentFactory)

  await app.listen(3000)
}
void bootstrap()
