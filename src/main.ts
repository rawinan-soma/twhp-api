import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import 'reflect-metadata';
import * as fs from 'fs';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(cookieParser());
  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix(String(config.get('ENDPOINT_PREFIX')));

  const documentConfig = new DocumentBuilder()
    .addCookieAuth('authentication')
    .setTitle('Total worker health API')
    .build();
  const documentFactory = SwaggerModule.createDocument(app, documentConfig, {
    deepScanRoutes: true,
  });
  SwaggerModule.setup('twhp/api/document', app, documentFactory);

  fs.writeFileSync(
    'openapi.json',
    JSON.stringify(documentFactory, null, 2),
    'utf8',
  );
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  await app.listen(String(config.get('SERVER_PORT')));
}
void bootstrap();
