import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Facility } from './facility.entity';
import { FacilitiesController } from './facilities.controller';
import { FacilitiesService } from './facilities.service';

@Module({
  imports: [TypeOrmModule.forFeature([Facility])],
  controllers: [FacilitiesController],
  providers: [FacilitiesService],
})
export class FacilitiesModule {}