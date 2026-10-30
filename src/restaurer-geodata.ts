// NOUVEAU FICHIER : backend/src/restaurer-geodata.ts
// Import contrôlé sur les TROIS tables géographiques VIDES. Ne touche pas à users.
// Sans --apply : validation et diagnostic seulement. Avec --apply : transaction unique.
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();
type Feature = { properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } | null };
type Geodata = { features: Feature[]; crs?: { properties?: { name?: string } } };
export function sourceSrid(data: Geodata): number {
  const name = data.crs?.properties?.name;
  if (!name || /CRS84$/i.test(name)) return 4326;
  const match = name.match(/EPSG.*?(\d+)$/i);
  if (!match) throw new Error(`Système de coordonnées source non reconnu : ${name}`);
  const srid = Number(match[1]);
  if (!Number.isInteger(srid) || srid <= 0) throw new Error('SRID source invalide.');
  return srid;
}
const getText = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null;
export function normalizedProperties(feature: Feature): Record<string, unknown> {
  return Object.fromEntries(Object.entries(feature.properties || {}).map(([key, value]) => [key.toLowerCase(), value]));
}
export function communeValues(feature: Feature) {
  const p = normalizedProperties(feature);
  const raw = p.mdg_admpop_adm3_2018_t_tl ?? p.population;
  const population = raw === undefined || raw === null || raw === '' ? null : Number(raw);
  const region = getText(p.adm1_en ?? p.adm1_name);
  const district = getText(p.adm2_en ?? p.adm2_name);
  const commune = getText(p.adm3_en ?? p.adm3_name);
  if (!region || !district || !commune || population === null || !Number.isFinite(population) || population < 0) {
    throw new Error('Source communale invalide : région, district, commune ou population absente/incorrecte.');
  }
  return { region, district, commune, population };
}
function load(name: string): Geodata {
  const filename = path.join(__dirname, 'data', name);
  if (!fs.existsSync(filename)) throw new Error(`Fichier requis absent : ${filename}`);
  const json = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')) as Geodata;
  if (!Array.isArray(json.features) || !json.features.length) throw new Error(`Source vide ou invalide : ${name}`);
  return json;
}
export async function runRestoration() {
  const apply = process.argv.includes('--apply');
  const health = load('health_facilities.geojson');
  const communes = load('communes_population.geojson');
  const zones = load('zones_couverture_5km.geojson');
  const communeSrid = sourceSrid(communes);
  const zoneSrid = sourceSrid(zones);
  if (sourceSrid(health) !== 4326) throw new Error('La source des formations doit être en WGS84 pour cet import.');
  console.log('Projection source : communes EPSG:' + communeSrid + ', couverture EPSG:' + zoneSrid + ' ; destination EPSG:4326.');
  const facilities = health.features.filter(f => f.geometry?.type === 'Point');
  if (!facilities.length) throw new Error('Aucune formation ponctuelle dans la source.');
  const sourceKeys = new Set<string>();
  facilities.forEach(f => {
    const c = f.geometry!.coordinates as number[];
    if (!Array.isArray(c) || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) {
      throw new Error('Coordonnées de formation invalides.');
    }
    const p = normalizedProperties(f);
    const key = JSON.stringify([getText(p.name), c[0], c[1]]);
    if (sourceKeys.has(key)) throw new Error('La source contient une répétition exacte nom/position ; vérifier avant import.');
    sourceKeys.add(key);
  });
  const mappedCommunes = communes.features.map(f => {
    if (!f.geometry || !['Polygon', 'MultiPolygon'].includes(f.geometry.type)) throw new Error('Géométrie communale non polygonale.');
    return { ...communeValues(f), geometry: JSON.stringify(f.geometry) };
  });
  zones.features.forEach(f => {
    if (!f.geometry || !['Polygon', 'MultiPolygon'].includes(f.geometry.type)) throw new Error('Zone de couverture non polygonale.');
  });
  const expected = { facilities: facilities.length, communes_population: communes.features.length, zones_couverture_5km: zones.features.length };
  console.log('Mode :', apply ? 'IMPORT TRANSACTIONNEL' : 'DIAGNOSTIC SANS ÉCRITURE');
  console.log('Sources attendues :', expected);
  console.log('Somme des populations source :', mappedCommunes.reduce((s, c) => s + c.population, 0));
  const url = process.env.DATABASE_URL;
  const ds = new DataSource(url ? { type: 'postgres', url } : {
    type: 'postgres',
    host: process.env.DB_HOST || 'postgres_db',
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'webmap_db',
  });
  await ds.initialize();
  const q = ds.createQueryRunner();
  await q.connect();
  try {
    console.log('Connexion réelle :', (await q.query('SELECT current_database() AS base, current_user AS utilisateur'))[0]);
    for (const t of ['facilities', 'communes_population', 'zones_couverture_5km']) {
      const result = await q.query('SELECT to_regclass($1) AS table_name', [`public.${t}`]);
      if (!result[0]?.table_name) throw new Error(`Table public.${t} absente. Initialiser le schéma avant la restauration.`);
    }
    const counts = async () => {
      const result: Record<string, number> = {};
      for (const table of Object.keys(expected)) {
        result[table] = Number((await q.query(`SELECT COUNT(*) AS n FROM public.${table}`))[0].n);
      }
      return result;
    };
    console.log('Lignes actuellement présentes :', await counts());
    if (!apply) {
      console.log('Diagnostic terminé. Aucune donnée modifiée.');
      return;
    }
    await q.startTransaction();
    await q.query('SELECT pg_advisory_xact_lock(271026001)');
    await q.query('LOCK TABLE public.facilities, public.communes_population, public.zones_couverture_5km IN SHARE ROW EXCLUSIVE MODE');
    const existing = await counts();
    if (Object.values(existing).some(n => n !== 0)) {
      throw new Error('IMPORT REFUSÉ : au moins une table géographique contient déjà des lignes. Aucune suppression automatique. Ne pas relancer un import sur une base remplie.');
    }
    for (const feature of facilities) {
      const p = normalizedProperties(feature);
      const [lon, lat] = feature.geometry!.coordinates as number[];
      await q.query(`INSERT INTO public.facilities
        (name, amenity, healthcare, operator_type, adm1_name, adm2_name, adm3_name,
         geom, opening_time, closing_time, opening_days, is_24h, phone, services, description, photo_url)
        VALUES ($1,$2,$3,$4,$5,$6,$7,ST_SetSRID(ST_MakePoint($8,$9),4326),$10,$11,$12,$13,$14,$15,$16,$17)`, [
        getText(p.name), getText(p.amenity), getText(p.healthcare), getText(p.operator_t ?? p['operator:type']),
        getText(p.adm1_name), getText(p.adm2_name), getText(p.adm3_name), lon, lat,
        getText(p.opening_time), getText(p.closing_time), getText(p.opening_days),
        p.is_24h === true || p.is_24h === 'true', getText(p.phone ?? p['contact:phone']),
        getText(p.services), getText(p.description), getText(p.photo_url),
      ]);
    }
    console.log('Formations insérées :', facilities.length);
    for (const c of mappedCommunes) {
      await q.query(`INSERT INTO public.communes_population
        (adm1_en, adm2_en, adm3_en, mdg_admpop_adm3_2018_t_tl, geom)
        VALUES ($1,$2,$3,$4,ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($5),$6),4326)),3)))`,
      [c.region, c.district, c.commune, c.population, c.geometry, communeSrid]);
    }
    console.log('Communes insérées :', mappedCommunes.length);
    for (const z of zones.features) {
      await q.query(`INSERT INTO public.zones_couverture_5km (geom)
        VALUES (ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1),$2),4326)),3)))`,
      [JSON.stringify(z.geometry), zoneSrid]);
    }
    await q.query('CREATE INDEX IF NOT EXISTS idx_restauration_communes_geom ON public.communes_population USING GIST (geom)');
    await q.query('CREATE INDEX IF NOT EXISTS idx_restauration_zones_geom ON public.zones_couverture_5km USING GIST (geom)');
    await q.query('CREATE INDEX IF NOT EXISTS idx_restauration_facilities_geom ON public.facilities USING GIST (geom)');
    // Uniformiser les noms territoriaux avec la source communale, sans modifier le nom des formations.
    await q.query(`WITH rattachements AS (
      SELECT f.id, c.adm1_en, c.adm2_en, c.adm3_en
      FROM public.facilities f
      CROSS JOIN LATERAL (
        SELECT cp.adm1_en, cp.adm2_en, cp.adm3_en
        FROM public.communes_population cp
        WHERE cp.geom && f.geom AND ST_Covers(cp.geom, f.geom)
        ORDER BY ST_Area(cp.geom::geography), cp.adm3_en LIMIT 1
      ) c
    )
    UPDATE public.facilities f SET adm1_name=r.adm1_en, adm2_name=r.adm2_en, adm3_name=r.adm3_en
    FROM rattachements r WHERE f.id=r.id RETURNING f.id`);
    const result = await counts();
    for (const [table, n] of Object.entries(expected)) {
      if (result[table] !== n) throw new Error(`Effectif incohérent après import : ${table}.`);
    }
    const invalid = await q.query(`SELECT COUNT(*) AS n FROM public.communes_population
      WHERE adm1_en IS NULL OR adm2_en IS NULL OR adm3_en IS NULL
         OR mdg_admpop_adm3_2018_t_tl IS NULL OR geom IS NULL OR ST_IsEmpty(geom) OR NOT ST_IsValid(geom)`);
    if (Number(invalid[0].n) !== 0) throw new Error('Certaines communes restent inexploitables ; annulation.');
    const spatialCheck = await q.query(`SELECT EXISTS (
      SELECT 1 FROM public.zones_couverture_5km z
      JOIN public.communes_population cp ON z.geom && cp.geom AND ST_Intersects(z.geom, cp.geom)
    ) AS intersection_ok`);
    if (!spatialCheck[0]?.intersection_ok) throw new Error('Les zones ne rencontrent aucune commune ; vérifier les projections. Import annulé.');
    await q.query('ANALYZE public.facilities');
    await q.query('ANALYZE public.communes_population');
    await q.query('ANALYZE public.zones_couverture_5km');
    await q.commitTransaction();
    console.log('IMPORT VALIDÉ :', result);
    console.log('Rattachements territoriaux effectués sur les formations localisées dans une commune.');
    console.log('Aucune écriture dans users. Ne pas réexécuter un autre import après cette restauration.');
  } catch (error) {
    if (q.isTransactionActive) await q.rollbackTransaction();
    throw error;
  } finally {
    await q.release();
    await ds.destroy();
  }
}
if (require.main === module) {
  runRestoration().catch((error: unknown) => {
    console.error('Restauration interrompue :', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
