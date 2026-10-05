import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Facility } from './facility.entity';

@Injectable()
export class FacilitiesService {
  constructor(
    @InjectRepository(Facility)
    private facilitiesRepository: Repository<Facility>,
  ) {}

  async findAll(): Promise<Facility[]> {
    return this.facilitiesRepository.find();
  }

  async findAsGeoJson() {
    const facilities = await this.facilitiesRepository.query(`
      SELECT 
        id, name, amenity, healthcare, operator_type,
        adm1_name, adm2_name, adm3_name,
        opening_time, closing_time, opening_days,
        is_24h, phone, services, description, photo_url,
        ST_AsGeoJSON(geom)::json AS geometry
      FROM facilities
      WHERE geom IS NOT NULL
    `);

    return {
      type: 'FeatureCollection',
      features: facilities.map((f: any) => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          id: f.id,
          name: f.name,
          amenity: f.amenity,
          healthcare: f.healthcare,
          operatorType: f.operator_type,
          adm1Name: f.adm1_name,
          adm2Name: f.adm2_name,
          adm3Name: f.adm3_name,
          openingTime: f.opening_time,
          closingTime: f.closing_time,
          openingDays: f.opening_days,
          is24h: f.is_24h,
          phone: f.phone,
          services: f.services,
          description: f.description,
          photoUrl: f.photo_url,
        },
      })),
    };
  }

async importFromGeoJson(file: Express.Multer.File) {
  const content = file.buffer.toString('utf-8');
  const geojson = JSON.parse(content);

  if (!geojson.features || !Array.isArray(geojson.features)) {
    throw new Error('Format GeoJSON invalide');
  }

  let inserted = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const feature of geojson.features) {
    if (feature.geometry?.type !== 'Point' || !feature.geometry.coordinates) {
      skipped++;
      continue;
    }

    const [lon, lat] = feature.geometry.coordinates;
    const props = feature.properties || {};

    // Vérifier si la formation existe déjà (même nom + même position)
    const existing = await this.facilitiesRepository.query(
      `SELECT id FROM facilities 
       WHERE name = $1 
       AND ST_Distance(geom, ST_SetSRID(ST_MakePoint($2, $3), 4326)) < 0.0001`,
      [props.name || null, lon, lat]
    );

    if (existing.length > 0) {
      duplicates++;
      continue;
    }

    try {
      await this.facilitiesRepository.query(
        `INSERT INTO facilities 
          (name, amenity, healthcare, operator_type, adm1_name, adm2_name, adm3_name, geom)
         VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326))`,
        [
          props.name || null,
          props.amenity || null,
          props.healthcare || null,
          props.operator_t || null,
          props.adm1_name || null,
          props.adm2_name || null,
          props.adm3_name || null,
          lon,
          lat,
        ],
      );
      inserted++;
    } catch (err) {
      skipped++;
    }
  }

  return {
    message: 'Import terminé',
    inserted,
    duplicates,
    skipped,
    total: geojson.features.length,
  };
}

  async findOne(id: number): Promise<Facility | null> {
    return this.facilitiesRepository.findOne({ where: { id } as any });
  }

  async search(query: string): Promise<Facility[]> {
    return this.facilitiesRepository
      .createQueryBuilder('f')
      .where('f.name ILIKE :q', { q: `%${query ?? ''}%` })
      .limit(50)
      .getMany();
  }

  async nearby(lat: number, lon: number, radiusKm = 25, limit = 20) {
    return this.facilitiesRepository.query(
      `SELECT id, name, amenity, healthcare, operator_type,
              adm1_name, adm2_name, adm3_name, phone,
              ST_Distance(geom::geography, ST_MakePoint($2,$1)::geography) / 1000 AS distance_km,
              ST_AsGeoJSON(geom)::json AS geometry
       FROM facilities
       WHERE geom IS NOT NULL
         AND ST_DWithin(geom::geography, ST_MakePoint($2,$1)::geography, $3 * 1000)
       ORDER BY distance_km
       LIMIT $4`,
      [lat, lon, radiusKm, limit],
    );
  }

  async deleteFacility(id: number) {
    await this.facilitiesRepository.delete(id);
    return { message: `Établissement ${id} supprimé` };
  }

  async updateFacility(id: number, data: any) {
  await this.facilitiesRepository.update(id, {
    name: data.name,
    amenity: data.amenity,
    healthcare: data.healthcare,
    adm1Name: data.adm1Name,
    adm2Name: data.adm2Name,
    adm3Name: data.adm3Name,
    phone: data.phone,
    services: data.services,
    description: data.description,
    photoUrl: data.photoUrl,
    openingTime: data.openingTime,
    closingTime: data.closingTime,
    openingDays: data.openingDays,
    is24h: data.is24h,
  });
  return { message: `Établissement ${id} mis à jour` };
}
async getStatsByRegion() {
  const rows: any[] = await this.facilitiesRepository.query(`
    SELECT
      COALESCE(adm1_name, 'Inconnue') AS region,
      COUNT(*) AS count,
      COUNT(*) FILTER (WHERE amenity = 'hospital' OR healthcare = 'hospital') AS hospitals,
      COUNT(*) FILTER (WHERE amenity = 'pharmacy' OR healthcare = 'pharmacy') AS pharmacies,
      COUNT(*) FILTER (WHERE amenity = 'health_post' OR healthcare IN ('nurse','community_health_worker')) AS health_posts,
      COUNT(*) FILTER (WHERE is_24h) AS open_24h
    FROM facilities
    WHERE geom IS NOT NULL
    GROUP BY adm1_name
    ORDER BY count DESC
  `);
  return rows;
}
}