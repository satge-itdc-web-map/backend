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
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbUrl = config.get<string>('DATABASE_URL');

        // Si DATABASE_URL est fourni par le .env
        if (dbUrl) {
          return {
            type: 'postgres',
            url: dbUrl,
            autoLoadEntities: true,
            synchronize: true,
          };
        }

        // Sinon, utilise les variables individuelles avec fallback Docker
        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST', 'postgres_db'),
          port: config.get<number>('DB_PORT', 5432),
          username: config.get<string>('DB_USERNAME', 'postgres'),
          password: config.get<string>('DB_PASSWORD', 'postgres'),
          database: config.get<string>('DB_NAME', 'webmap_db'),
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