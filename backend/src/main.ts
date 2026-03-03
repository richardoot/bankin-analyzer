import { NestFactory } from '@nestjs/core'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

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
