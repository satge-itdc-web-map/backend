import { Injectable, BadRequestException, NotFoundException, HttpException } from '@nestjs/common';

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1';

export type RoutingProfile = 'driving' | 'walking';

@Injectable()
export class RoutingService {
  async getItinerary(
    fromLat: number,
    fromLon: number,
    toLat: number,
    toLon: number,
    profile: RoutingProfile = 'driving',
  ) {
    if ([fromLat, fromLon, toLat, toLon].some((v) => Number.isNaN(v))) {
      throw new BadRequestException('Coordonnées fromLat/fromLon/toLat/toLon invalides ou manquantes');
    }

    const url = `${OSRM_BASE_URL}/${profile}/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      throw new HttpException('Impossible de contacter le service de routage (OSRM)', 502);
    }

    if (!response.ok) {
      throw new HttpException('Le service de routage (OSRM) a renvoyé une erreur', 502);
    }

    const data: any = await response.json();
    const route = data?.routes?.[0];
    if (!route) {
      throw new NotFoundException("Aucun itinéraire trouvé entre ces deux points");
    }

    return {
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      geometry: {
        type: 'LineString',
        coordinates: route.geometry.coordinates,
      },
    };
  }
}
