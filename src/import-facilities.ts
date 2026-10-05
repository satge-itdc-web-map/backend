import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

interface GeoJsonFeature {
  type: string;
  properties: {
    name?: string;
    amenity?: string;
    healthcare?: string;
    operator_t?: string;
    adm1_name?: string;
    adm2_name?: string;
    adm3_name?: string;
  };
  geometry: {
    type: string;
    coordinates: [number, number];
  };
}

interface GeoJsonData {
  type: string;
  features: GeoJsonFeature[];
}

async function importFacilities() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  await dataSource.initialize();
  console.log('Connexion à PostgreSQL réussie');

  const filePath = path.join(__dirname, 'data', 'health_facilities.geojson');
  const rawData = fs.readFileSync(filePath, 'utf-8');
  const geojson: GeoJsonData = JSON.parse(rawData);

  console.log(`${geojson.features.length} formations sanitaires trouvées`);

  let inserted = 0;
  let skipped = 0;

  for (const feature of geojson.features) {
    if (feature.geometry?.type !== 'Point' || !feature.geometry.coordinates) {
      skipped++;
      continue;
    }

    const [lon, lat] = feature.geometry.coordinates;
    const props = feature.properties;

    try {
      await dataSource.query(
        `INSERT INTO facilities (name, amenity, healthcare, operator_type, adm1_name, adm2_name, adm3_name, geom)
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
      console.error('Erreur insertion:', (err as Error).message);
      skipped++;
    }
  }

  console.log(`Import terminé : ${inserted} insérés, ${skipped} ignorés`);
  await dataSource.destroy();
}

importFacilities().catch((err) => {
  console.error('Erreur insertion:', (err as Error).message);
  process.exit(1);
});