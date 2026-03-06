import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Відлік API')
    .setDescription('Corporate Reporting & Task Management System API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Аутентифікація')
    .addTag('users', 'Користувачі')
    .addTag('departments', 'Підрозділи')
    .addTag('reports', 'Звіти')
    .addTag('tasks', 'Задачі')
    .addTag('notifications', 'Сповіщення')
    .addTag('analytics', 'Аналітика')
    .addTag('ai', 'AI сервіси')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log(`🚀 Відлік API запущено на порту ${port}`);
  console.log(`📚 Swagger документація: http://localhost:${port}/api/docs`);
}

bootstrap();
