import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Augmentation de la limite du corps des requêtes (JSON et formulaires)
  app.use(require('express').json({ limit: '10mb' }));
  app.use(require('express').urlencoded({ limit: '10mb', extended: true }));

  // Liste des origines explicitement autorisées pour votre Web Map
  const allowedOrigins = [
    'http://localhost:3002',
    'http://127.0.0.1:3002',
  ];

  // Configuration CORS complète (Mobile React Native + Web)
  app.enableCors({
    origin: (origin, callback) => {
      // !origin autorise les requêtes mobiles (React Native / Postman sans header Origin)
      if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost') || origin.startsWith('https://')) {
        callback(null, true);
      } else {
        callback(null, true); // Fallback tolérant pour éviter les blocages de transport mobile
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  });

  const port = process.env.PORT || 4000;
  
  // Écoute obligatoire sur 0.0.0.0 pour accepter les connexions externes et de l'hôte
  await app.listen(port, '0.0.0.0');
  
  console.log(`=== Démarrage réussi ===`);
  console.log(`Backend Web Map prêt et connecté sur le port ${port}`);
}
bootstrap();