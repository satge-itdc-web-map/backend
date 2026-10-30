import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FacilitiesModule } from './facilities/facilities.module';
import { AuthModule } from './auth/auth.module';
import { ZonesModule } from './zones/zones.module';
import { RecommandationModule } from './recommandation/recommandation.module';

@Module({
  imports: [
    // Aucun fichier .env : les variables viennent de Jenkins (credentials)
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbUrl = config.get<string>('DATABASE_URL');

        if (dbUrl) {
          return {
            type: 'postgres',
            url: dbUrl,
            autoLoadEntities: true,
            synchronize: true,
          };
        }

        // Aucune valeur par défaut : une variable absente arrête le démarrage
        return {
          type: 'postgres',
          host: config.getOrThrow<string>('DB_HOST'),
          port: Number(config.getOrThrow<string>('DB_PORT')),
          username: config.getOrThrow<string>('DB_USERNAME'),
          password: config.getOrThrow<string>('DB_PASSWORD'),
          database: config.getOrThrow<string>('DB_NAME'),
          autoLoadEntities: true,
          synchronize: true,
        };
      },
    }),
    FacilitiesModule,
    AuthModule,
    ZonesModule,
    RecommandationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}