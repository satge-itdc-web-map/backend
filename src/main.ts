import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.use(require('express').json({ limit: '10mb' }));
  app.use(require('express').urlencoded({ limit: '10mb', extended: true }));
  
  app.enableCors({
    origin: [
      'http://localhost:4000',
      'http://localhost:4001',
      'http://localhost:4002',
      // Ajoutez votre domaine/IP de production si le frontend y est hébergé
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();