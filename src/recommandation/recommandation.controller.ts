// recommandation.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { RecommandationService } from './recommandation.service';

@Controller('recommandations')
export class RecommandationController {
  constructor(private service: RecommandationService) {}

  @Get('implantation')
  async getImplantation(@Query('region') region: string, @Query('k') k: string) {
    return this.service.getRecommandations(region, parseInt(k, 10) || 3);
  }
}