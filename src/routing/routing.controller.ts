import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { RoutingService, RoutingProfile } from './routing.service';

@Controller('routing')
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  @Get('itinerary')
  getItinerary(
    @Query('fromLat') fromLat: string,
    @Query('fromLon') fromLon: string,
    @Query('toLat') toLat: string,
    @Query('toLon') toLon: string,
    @Query('profile') profile?: string,
  ) {
    const allowedProfiles: RoutingProfile[] = ['driving', 'walking'];
    const resolvedProfile: RoutingProfile = allowedProfiles.includes(profile as RoutingProfile)
      ? (profile as RoutingProfile)
      : 'driving';

    if (!fromLat || !fromLon || !toLat || !toLon) {
      throw new BadRequestException('fromLat, fromLon, toLat et toLon sont requis');
    }

    return this.routingService.getItinerary(
      parseFloat(fromLat),
      parseFloat(fromLon),
      parseFloat(toLat),
      parseFloat(toLon),
      resolvedProfile,
    );
  }
}
