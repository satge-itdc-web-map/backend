// NOUVEAU : backend/src/initialiser-srid.ts
// Initialise uniquement les références 4326 et 32738 nécessaires au projet.
// Ne supprime rien et ne remplace aucune définition existante.
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { optionsBase } from './db-config';

const references = [
  {
    srid: 4326,
    srtext: 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]',
    proj4: '+proj=longlat +datum=WGS84 +no_defs',
  },
  {
    srid: 32738,
    srtext: 'PROJCS["WGS 84 / UTM zone 38S",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",45],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",10000000],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Easting",EAST],AXIS["Northing",NORTH],AUTHORITY["EPSG","32738"]]',
    proj4: '+proj=utm +zone=38 +south +datum=WGS84 +units=m +no_defs',
  },
];

async function main(): Promise<void> {
  const dataSource = new DataSource(optionsBase());

  await dataSource.initialize();

  try {
    await dataSource.transaction(async (manager) => {
      await manager.query('CREATE EXTENSION IF NOT EXISTS postgis');

      for (const reference of references) {
        await manager.query(
          `INSERT INTO spatial_ref_sys
             (srid, auth_name, auth_srid, srtext, proj4text)
           VALUES ($1, 'EPSG', $1, $2, $3)
           ON CONFLICT (srid) DO NOTHING`,
          [reference.srid, reference.srtext, reference.proj4],
        );
      }

      // Vérifier une conversion réelle, pas seulement la présence des lignes.
      const result = await manager.query(`
        SELECT ST_AsText(
          ST_Transform(
            ST_SetSRID(
              ST_MakePoint(547005.5139798704, 7179775.461738694),
              32738
            ),
            4326
          )
        ) AS position
      `);

      if (!result[0]?.position) {
        throw new Error('La conversion de coordonnées reste indisponible.');
      }
    });

    console.log('Références PostGIS 4326 et 32738 disponibles. Conversion vérifiée.');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Initialisation PostGIS interrompue :',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});