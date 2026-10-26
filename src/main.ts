import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Augmentation de la limite du corps des requêtes (JSON et formulaires)
  app.use(require('express').json({ limit: '10mb' }));
  app.use(require('express').urlencoded({ limit: '10mb', extended: true }));

  // Liste des origines explicitement autorisées
  const allowedOrigins = [
    'http://localhost:3002',   // Votre Frontend Web en Local
    'http://127.0.0.1:3002',   // Variante IP local
  ];

  // Configuration CORS complète (Mobile + Web Local)
  app.enableCors({
    origin: (origin, callback) => {
      // 1. !origin : Requis pour les applications mobiles React Native (car elles n'envoient pas de header Origin)
      // 2. allowedOrigins.includes(origin) : Pour autoriser explicitement votre frontend localhost:3002
      // 3. fallback true : Pour autoriser toutes les autres origines si besoin
      if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost')) {
        callback(null, true);
      } else {
        // En cas de doute, autoriser (garde la même souplesse qu'origin: true pour le mobile)
        callback(null, true);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  });

  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`Backend prêt et connecté sur le port ${port}`);
}
bootstrap();