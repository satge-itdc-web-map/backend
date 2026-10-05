// recommandation.module.ts
import { Module } from '@nestjs/common';
import { RecommandationController } from './recommandation.controller';
import { RecommandationService } from './recommandation.service';

@Module({
  controllers: [RecommandationController],
  providers: [RecommandationService],
})
export class RecommandationModule {}