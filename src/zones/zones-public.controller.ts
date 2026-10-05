import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ZonesService } from './zones.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('zones-publiques')
@UseGuards(JwtAuthGuard)
export class ZonesPublicController {
  constructor(private readonly zonesService: ZonesService) {}

  @Get('statut-position')
  getStatutPosition(@Query('lat') lat: string, @Query('lng') lng: string) {
    return this.zonesService.getStatutPosition(parseFloat(lat), parseFloat(lng));
  }
}