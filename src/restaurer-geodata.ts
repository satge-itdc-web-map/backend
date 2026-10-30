// Import automatique des données géographiques, SANS DOUBLON.
// - Chaque table (facilities, communes_population, zones_couverture_5km) est traitée séparément :
//   si elle contient déjà des lignes, elle n'est PAS touchée ; si elle est vide, elle est importée.
// - Aucune suppression, aucune écriture dans users.
// - Aucun .env, aucune valeur par défaut : connexion via les variables injectées par Jenkins.
// Sans --apply : diagnostic seulement. Avec --apply : import dans une transaction unique.
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import * as fs from 'fs';
import * as path from 'path';
import { optionsBase } from './db-config';
import { Facility } from './facilities/facility.entity';

type Feature = { properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } | null };
type Geodata = { features: Feature[]; crs?: { properties?: { name?: string } } };
type Table = 'facilities' | 'communes_population' | 'zones_couverture_5km';

const TABLES: Table[] = ['facilities', 'communes_population', 'zones_couverture_5km'];

export function sourceSrid(data: Geodata): number {
  const name = data.crs?.properties?.name;
  if (!name || /CRS84$/i.test(name)) return 4326;
  const match = name.match(/EPSG.*?(\d+)$/i);
  if (!match) throw new Error(`Système de coordonnées source non reconnu : ${name}`);
  const srid = Number(match[1]);
  if (!Number.isInteger(srid) || srid <= 0) throw new Error('SRID source invalide.');
  return srid;
}
const getText = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
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
  if (!fs.existsSync(filename)) throw new Error(`Fichier requis absent : data/${name}`);
  const json = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')) as Geodata;
  if (!Array.isArray(json.features) || !json.features.length) throw new Error(`Source vide ou invalide : ${name}`);
  return json;
}
const estPolygone = (f: Feature) => !!f.geometry && ['Polygon', 'MultiPolygon'].includes(f.geometry.type);

export async function runRestoration() {
  const apply = process.argv.includes('--apply');

  const ds = new DataSource({ ...(optionsBase() as PostgresConnectionOptions), entities: [Facility] });
  await ds.initialize();
  const q = ds.createQueryRunner();
  await q.connect();

  try {
    // --- Schéma : la table facilities est normalement créée par TypeORM au démarrage de l'API.
    // Au tout premier démarrage (base neuve) elle n'existe pas encore : on la crée de la même façon.
    const existeFacilities = (await q.query(`SELECT to_regclass('public.facilities') AS t`))[0].t;
    if (!existeFacilities) {
      console.log('Table facilities absente : création du schéma.');
      await ds.synchronize();
    }
    await q.query(`CREATE TABLE IF NOT EXISTS public.communes_population (
      id SERIAL PRIMARY KEY, adm1_en VARCHAR, adm2_en VARCHAR, adm3_en VARCHAR,
      mdg_admpop_adm3_2018_t_tl NUMERIC, geom GEOMETRY)`);
    await q.query(`CREATE TABLE IF NOT EXISTS public.zones_couverture_5km (
      id SERIAL PRIMARY KEY, geom GEOMETRY)`);

    const compter = async (): Promise<Record<Table, number>> => {
      const r = {} as Record<Table, number>;
      for (const t of TABLES) r[t] = Number((await q.query(`SELECT COUNT(*) AS n FROM public.${t}`))[0].n);
      return r;
    };

    const avant = await compter();
    console.log('Lignes présentes :', avant);
    const vides = TABLES.filter((t) => avant[t] === 0);
    if (!vides.length) {
      console.log('Données déjà présentes dans les trois tables : aucun import.');
      return;
    }
    console.log('Tables vides à importer :', vides.join(', '));
    console.log('Tables déjà remplies (non modifiées) :', TABLES.filter((t) => !vides.includes(t)).join(', ') || 'aucune');
    if (!apply) {
      console.log('Diagnostic terminé. Aucune donnée modifiée.');
      return;
    }

    // --- Chargement et validation des seules sources nécessaires (communes = fichier volumineux)
    let facilities: Feature[] = [];
    if (vides.includes('facilities')) {
      const health = load('health_facilities.geojson');
      if (sourceSrid(health) !== 4326) throw new Error('La source des formations doit être en WGS84 pour cet import.');
      facilities = health.features.filter((f) => f.geometry?.type === 'Point');
      if (!facilities.length) throw new Error('Aucune formation ponctuelle dans la source.');
      const cles = new Set<string>();
      facilities.forEach((f) => {
        const c = f.geometry!.coordinates as number[];
        if (!Array.isArray(c) || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) {
          throw new Error('Coordonnées de formation invalides.');
        }
        const cle = JSON.stringify([getText(normalizedProperties(f).name), c[0], c[1]]);
        if (cles.has(cle)) throw new Error('La source contient une répétition exacte nom/position ; vérifier avant import.');
        cles.add(cle);
      });
    }

    let communes: Array<ReturnType<typeof communeValues> & { geometry: string }> = [];
    let communeSrid = 4326;
    if (vides.includes('communes_population')) {
      const data = load('communes_population.geojson');
      communeSrid = sourceSrid(data);
      communes = data.features.map((f) => {
        if (!estPolygone(f)) throw new Error('Géométrie communale non polygonale.');
        return { ...communeValues(f), geometry: JSON.stringify(f.geometry) };
      });
    }

    let zones: Feature[] = [];
    let zoneSrid = 4326;
    if (vides.includes('zones_couverture_5km')) {
      const data = load('zones_couverture_5km.geojson');
      zoneSrid = sourceSrid(data);
      zones = data.features;
      zones.forEach((f) => {
        if (!estPolygone(f)) throw new Error('Zone de couverture non polygonale.');
      });
    }

    // --- Import transactionnel
    await q.startTransaction();
    await q.query('SELECT pg_advisory_xact_lock(271026001)');
    await q.query(`LOCK TABLE ${vides.map((t) => 'public.' + t).join(', ')} IN SHARE ROW EXCLUSIVE MODE`);

    // Revérification sous verrou : si un autre démarrage a déjà importé une table, on ne la réimporte pas.
    const sousVerrou = await compter();
    const aImporter = vides.filter((t) => sousVerrou[t] === 0);
    if (!aImporter.length) {
      await q.rollbackTransaction();
      console.log('Import déjà effectué par un autre démarrage : rien à faire.');
      return;
    }

    if (aImporter.includes('facilities')) {
      for (const feature of facilities) {
        const p = normalizedProperties(feature);
        const [lon, lat] = feature.geometry!.coordinates as number[];
        await q.query(
          `INSERT INTO public.facilities
          (name, amenity, healthcare, operator_type, adm1_name, adm2_name, adm3_name,
           geom, opening_time, closing_time, opening_days, is_24h, phone, services, description, photo_url)
          VALUES ($1,$2,$3,$4,$5,$6,$7,ST_SetSRID(ST_MakePoint($8,$9),4326),$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            getText(p.name), getText(p.amenity), getText(p.healthcare), getText(p.operator_t ?? p['operator:type']),
            getText(p.adm1_name), getText(p.adm2_name), getText(p.adm3_name), lon, lat,
            getText(p.opening_time), getText(p.closing_time), getText(p.opening_days),
            p.is_24h === true || p.is_24h === 'true', getText(p.phone ?? p['contact:phone']),
            getText(p.services), getText(p.description), getText(p.photo_url),
          ],
        );
      }
      console.log('Formations insérées :', facilities.length);
    }

    if (aImporter.includes('communes_population')) {
      for (const c of communes) {
        await q.query(
          `INSERT INTO public.communes_population
          (adm1_en, adm2_en, adm3_en, mdg_admpop_adm3_2018_t_tl, geom)
          VALUES ($1,$2,$3,$4,ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($5),$6),4326)),3)))`,
          [c.region, c.district, c.commune, c.population, c.geometry, communeSrid],
        );
      }
      console.log('Communes insérées :', communes.length);
    }

    if (aImporter.includes('zones_couverture_5km')) {
      for (const z of zones) {
        await q.query(
          `INSERT INTO public.zones_couverture_5km (geom)
          VALUES (ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1),$2),4326)),3)))`,
          [JSON.stringify(z.geometry), zoneSrid],
        );
      }
      console.log('Zones de couverture insérées :', zones.length);
    }

    // Index spatiaux (idempotent)
    await q.query('CREATE INDEX IF NOT EXISTS idx_restauration_communes_geom ON public.communes_population USING GIST (geom)');
    await q.query('CREATE INDEX IF NOT EXISTS idx_restauration_zones_geom ON public.zones_couverture_5km USING GIST (geom)');
    await q.query('CREATE INDEX IF NOT EXISTS idx_restauration_facilities_geom ON public.facilities USING GIST (geom)');

    // Rattachement territorial : uniquement quand les formations viennent d'être importées
    if (aImporter.includes('facilities')) {
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
    }

    // --- Contrôles avant validation
    const attendu: Partial<Record<Table, number>> = {};
    if (aImporter.includes('facilities')) attendu.facilities = facilities.length;
    if (aImporter.includes('communes_population')) attendu.communes_population = communes.length;
    if (aImporter.includes('zones_couverture_5km')) attendu.zones_couverture_5km = zones.length;
    const apres = await compter();
    for (const [table, n] of Object.entries(attendu)) {
      if (apres[table as Table] !== n) throw new Error(`Effectif incohérent après import : ${table}.`);
    }
    if (aImporter.includes('communes_population')) {
      const invalid = await q.query(`SELECT COUNT(*) AS n FROM public.communes_population
        WHERE adm1_en IS NULL OR adm2_en IS NULL OR adm3_en IS NULL
           OR mdg_admpop_adm3_2018_t_tl IS NULL OR geom IS NULL OR ST_IsEmpty(geom) OR NOT ST_IsValid(geom)`);
      if (Number(invalid[0].n) !== 0) throw new Error('Certaines communes restent inexploitables ; annulation.');
    }
    if (aImporter.includes('zones_couverture_5km') && apres.communes_population > 0) {
      const spatial = await q.query(`SELECT EXISTS (
        SELECT 1 FROM public.zones_couverture_5km z
        JOIN public.communes_population cp ON z.geom && cp.geom AND ST_Intersects(z.geom, cp.geom)
      ) AS ok`);
      if (!spatial[0]?.ok) throw new Error('Les zones ne rencontrent aucune commune ; vérifier les projections. Import annulé.');
    }
    for (const t of aImporter) await q.query(`ANALYZE public.${t}`);

    await q.commitTransaction();
    console.log('IMPORT VALIDÉ. Tables importées :', aImporter.join(', '));
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