import { Module } from '@nestjs/common';
import { ZonesController } from './zones.controller';
import { ZonesPublicController } from './zones-public.controller';
import { ZonesService } from './zones.service';

@Module({
  controllers: [ZonesController, ZonesPublicController],
  providers: [ZonesService],
})
export class ZonesModule {}