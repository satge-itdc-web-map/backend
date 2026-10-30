import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { optionsBase } from './db-config';

async function runImport() {
  const dataSource = new DataSource(optionsBase());

  await dataSource.initialize();
  console.log('Connexion à PostgreSQL réussie');

  // 1. Activer PostGIS et créer la table communes_population si elle n'existe pas
  await dataSource.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
  
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS communes_population (
      id SERIAL PRIMARY KEY,
      adm1_en VARCHAR,
      adm2_en VARCHAR,
      adm3_en VARCHAR,
      mdg_admpop_adm3_2018_t_tl NUMERIC,
      geom GEOMETRY
    );
  `);

  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS zones_couverture_5km (
      id SERIAL PRIMARY KEY,
      geom GEOMETRY
    );
  `);

  const dataDir = path.join(__dirname, 'data');

  // ----------------------------------------------------
  // 2. Importation de health_facilities.geojson
  // ----------------------------------------------------
  const facilitiesPath = path.join(dataDir, 'health_facilities.geojson');
  if (fs.existsSync(facilitiesPath)) {
    console.log('Importation de health_facilities.geojson...');
    const geojson = JSON.parse(fs.readFileSync(facilitiesPath, 'utf-8'));
    let inserted = 0;

    for (const feature of geojson.features) {
      if (feature.geometry?.type === 'Point' && feature.geometry.coordinates) {
        const [lon, lat] = feature.geometry.coordinates;
        const props = feature.properties || {};
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
        } catch (e) {}
      }
    }
    console.log(`-> ${inserted} formations sanitaires insérées.`);
  }

  // ----------------------------------------------------
  // 3. Importation de communes_population.geojson
  // ----------------------------------------------------
  const communesPath = path.join(dataDir, 'communes_population.geojson');
  if (fs.existsSync(communesPath)) {
    console.log('Importation de communes_population.geojson...');
    const geojson = JSON.parse(fs.readFileSync(communesPath, 'utf-8'));
    let inserted = 0;

    for (const feature of geojson.features) {
      if (feature.geometry && feature.properties) {
        const props = feature.properties;
        const geomJson = JSON.stringify(feature.geometry);
        const pop =
  props.mdg_admpop_adm3_2018_T_TL ??
  props.mdg_admpop_adm3_2018_t_tl ??
  props.population ??
  0;

        try {
          await dataSource.query(
            `INSERT INTO communes_population (adm1_en, adm2_en, adm3_en, mdg_admpop_adm3_2018_t_tl, geom)
             VALUES ($1, $2, $3, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))`,
            [
              props.ADM1_EN ?? props.adm1_en ?? props.adm1_name ?? null,
props.ADM2_EN ?? props.adm2_en ?? props.adm2_name ?? null,
props.ADM3_EN ?? props.adm3_en ?? props.adm3_name ?? null,
              pop,
              geomJson,
            ],
          );
          inserted++;
        } catch (e) {}
      }
    }
    console.log(`-> ${inserted} communes insérées.`);
  }

  // ----------------------------------------------------
  // 4. Importation de zones_couverture_5km.geojson
  // ----------------------------------------------------
  const zonesPath = path.join(dataDir, 'zones_couverture_5km.geojson');
  if (fs.existsSync(zonesPath)) {
    console.log('Importation de zones_couverture_5km.geojson...');
    const geojson = JSON.parse(fs.readFileSync(zonesPath, 'utf-8'));
    let inserted = 0;

    for (const feature of geojson.features) {
      if (feature.geometry) {
        const geomJson = JSON.stringify(feature.geometry);
        try {
          await dataSource.query(
            `INSERT INTO zones_couverture_5km (geom)
             VALUES (ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))`,
            [geomJson],
          );
          inserted++;
        } catch (e) {}
      }
    }
    console.log(`-> ${inserted} zones de couverture insérées.`);
  }

  console.log('Importation globale terminée avec succès !');
  await dataSource.destroy();
}

runImport().catch((err) => {
  console.error('Erreur lors de l’importation :', err.message);
  process.exit(1);
});