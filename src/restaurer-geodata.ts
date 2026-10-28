import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

type Feature = {
  properties?: Record<string, unknown>;
  geometry?: {
    type: string;
    coordinates: unknown;
  } | null;
};

type Geodata = {
  features: Feature[];
  crs?: {
    properties?: {
      name?: string;
    };
  };
};

// Identifier le système de coordonnées déclaré dans le GeoJSON.
export function sourceSrid(data: Geodata): number {
  const name = data.crs?.properties?.name;

  if (!name || /CRS84$/i.test(name)) {
    return 4326;
  }

  const match = name.match(/EPSG.*?(\d+)$/i);

  if (!match) {
    throw new Error(
      `Système de coordonnées source non reconnu : ${name}`,
    );
  }

  const srid = Number(match[1]);

  if (!Number.isInteger(srid) || srid <= 0) {
    throw new Error('SRID source invalide.');
  }

  return srid;
}

const getText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim()
    ? value.trim()
    : null;

// Normaliser les noms des propriétés pour accepter les majuscules.
export function normalizedProperties(
  feature: Feature,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(feature.properties || {}).map(
      ([key, value]) => [key.toLowerCase(), value],
    ),
  );
}

export function communeValues(feature: Feature) {
  const properties = normalizedProperties(feature);

  const rawPopulation =
    properties.mdg_admpop_adm3_2018_t_tl ??
    properties.population;

  const population =
    rawPopulation === undefined ||
    rawPopulation === null ||
    rawPopulation === ''
      ? null
      : Number(rawPopulation);

  const region = getText(
    properties.adm1_en ?? properties.adm1_name,
  );

  const district = getText(
    properties.adm2_en ?? properties.adm2_name,
  );

  const commune = getText(
    properties.adm3_en ?? properties.adm3_name,
  );

  if (
    !region ||
    !district ||
    !commune ||
    population === null ||
    !Number.isFinite(population) ||
    population < 0
  ) {
    throw new Error(
      'Source communale invalide : région, district, commune ' +
        'ou population absente/incorrecte.',
    );
  }

  return {
    region,
    district,
    commune,
    population,
  };
}

// En production, les fichiers doivent se trouver dans dist/data/.
function load(name: string): Geodata {
  const filename = path.join(__dirname, 'data', name);

  if (!fs.existsSync(filename)) {
    throw new Error(`Fichier requis absent : ${filename}`);
  }

  const content = fs
    .readFileSync(filename, 'utf8')
    .replace(/^\uFEFF/, '');

  const json = JSON.parse(content) as Geodata;

  if (
    !Array.isArray(json.features) ||
    json.features.length === 0
  ) {
    throw new Error(`Source vide ou invalide : ${name}`);
  }

  return json;
}

export async function runRestoration() {
  const apply = process.argv.includes('--apply');

  const health = load('health_facilities.geojson');
  const communes = load('communes_population.geojson');
  const zones = load('zones_couverture_5km.geojson');

  const communeSrid = sourceSrid(communes);
  const zoneSrid = sourceSrid(zones);

  if (sourceSrid(health) !== 4326) {
    throw new Error(
      'La source des formations doit être en WGS84 pour cet import.',
    );
  }

  console.log(
    `Projection source : communes EPSG:${communeSrid}, ` +
      `couverture EPSG:${zoneSrid} ; destination EPSG:4326.`,
  );

  const facilities = health.features.filter(
    (feature) => feature.geometry?.type === 'Point',
  );

  if (facilities.length === 0) {
    throw new Error(
      'Aucune formation ponctuelle dans la source.',
    );
  }

  // Contrôler les coordonnées et les répétitions dans la source.
  const sourceKeys = new Set<string>();

  facilities.forEach((feature) => {
    const coordinates =
      feature.geometry!.coordinates as number[];

    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !Number.isFinite(coordinates[0]) ||
      !Number.isFinite(coordinates[1]) ||
      Math.abs(coordinates[0]) > 180 ||
      Math.abs(coordinates[1]) > 90
    ) {
      throw new Error(
        'Coordonnées de formation invalides.',
      );
    }

    const properties = normalizedProperties(feature);

    const key = JSON.stringify([
      getText(properties.name),
      coordinates[0],
      coordinates[1],
    ]);

    if (sourceKeys.has(key)) {
      throw new Error(
        'La source contient une répétition exacte nom/position. ' +
          'Vérifier avant import.',
      );
    }

    sourceKeys.add(key);
  });

  const mappedCommunes = communes.features.map((feature) => {
    if (
      !feature.geometry ||
      !['Polygon', 'MultiPolygon'].includes(
        feature.geometry.type,
      )
    ) {
      throw new Error(
        'Géométrie communale non polygonale.',
      );
    }

    return {
      ...communeValues(feature),
      geometry: JSON.stringify(feature.geometry),
    };
  });

  zones.features.forEach((feature) => {
    if (
      !feature.geometry ||
      !['Polygon', 'MultiPolygon'].includes(
        feature.geometry.type,
      )
    ) {
      throw new Error(
        'Zone de couverture non polygonale.',
      );
    }
  });

  const expected = {
    facilities: facilities.length,
    communes_population: communes.features.length,
    zones_couverture_5km: zones.features.length,
  };

  console.log(
    'Mode :',
    apply
      ? 'IMPORT TRANSACTIONNEL'
      : 'DIAGNOSTIC SANS ÉCRITURE',
  );

  console.log('Sources attendues :', expected);

  console.log(
    'Somme des populations source :',
    mappedCommunes.reduce(
      (sum, commune) => sum + commune.population,
      0,
    ),
  );

  // Même priorité de connexion que le backend.
  const url = process.env.DATABASE_URL;

  const dataSource = new DataSource(
    url
      ? {
          type: 'postgres',
          url,
        }
      : {
          type: 'postgres',
          host: process.env.DB_HOST || 'postgres_db',
          port: Number(process.env.DB_PORT || 5432),
          username:
            process.env.DB_USERNAME || 'postgres',
          password: process.env.DB_PASSWORD,
          database:
            process.env.DB_NAME || 'webmap_db',
        },
  );

  await dataSource.initialize();

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    const identity = await queryRunner.query(`
      SELECT
        current_database() AS base,
        current_user AS utilisateur
    `);

    console.log('Connexion réelle :', identity[0]);

    // Le schéma doit déjà exister.
    for (const table of [
      'facilities',
      'communes_population',
      'zones_couverture_5km',
    ]) {
      const result = await queryRunner.query(
        'SELECT to_regclass($1) AS table_name',
        [`public.${table}`],
      );

      if (!result[0]?.table_name) {
        throw new Error(
          `Table public.${table} absente. ` +
            'Initialiser le schéma avant la restauration.',
        );
      }
    }

    const counts = async () => {
      const result: Record<string, number> = {};

      for (const table of Object.keys(expected)) {
        const rows = await queryRunner.query(
          `SELECT COUNT(*) AS n FROM public.${table}`,
        );

        result[table] = Number(rows[0].n);
      }

      return result;
    };

    console.log(
      'Lignes actuellement présentes :',
      await counts(),
    );

    // Sans --apply, aucune insertion ni modification.
    if (!apply) {
      console.log(
        'Diagnostic terminé. Aucune donnée modifiée.',
      );
      return;
    }

    await queryRunner.startTransaction();

    // Empêcher deux restaurations simultanées.
    await queryRunner.query(
      'SELECT pg_advisory_xact_lock(271026001)',
    );

    await queryRunner.query(`
      LOCK TABLE
        public.facilities,
        public.communes_population,
        public.zones_couverture_5km
      IN SHARE ROW EXCLUSIVE MODE
    `);

    const existing = await counts();

    if (
      Object.values(existing).some(
        (numberOfRows) => numberOfRows !== 0,
      )
    ) {
      throw new Error(
        'IMPORT REFUSÉ : au moins une table géographique ' +
          'contient déjà des lignes. Aucune suppression automatique.',
      );
    }

    // 1. Importer les formations sanitaires.
    for (const feature of facilities) {
      const properties =
        normalizedProperties(feature);

      const [longitude, latitude] =
        feature.geometry!.coordinates as number[];

      await queryRunner.query(
        `
        INSERT INTO public.facilities (
          name,
          amenity,
          healthcare,
          operator_type,
          adm1_name,
          adm2_name,
          adm3_name,
          geom,
          opening_time,
          closing_time,
          opening_days,
          is_24h,
          phone,
          services,
          description,
          photo_url
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          ST_SetSRID(ST_MakePoint($8, $9), 4326),
          $10, $11, $12, $13, $14, $15, $16, $17
        )
        `,
        [
          getText(properties.name),
          getText(properties.amenity),
          getText(properties.healthcare),
          getText(
            properties.operator_t ??
              properties['operator:type'],
          ),
          getText(properties.adm1_name),
          getText(properties.adm2_name),
          getText(properties.adm3_name),
          longitude,
          latitude,
          getText(properties.opening_time),
          getText(properties.closing_time),
          getText(properties.opening_days),
          properties.is_24h === true ||
            properties.is_24h === 'true',
          getText(
            properties.phone ??
              properties['contact:phone'],
          ),
          getText(properties.services),
          getText(properties.description),
          getText(properties.photo_url),
        ],
      );
    }

    console.log(
      'Formations insérées :',
      facilities.length,
    );

    // 2. Importer les communes et leur population.
    for (const commune of mappedCommunes) {
      await queryRunner.query(
        `
        INSERT INTO public.communes_population (
          adm1_en,
          adm2_en,
          adm3_en,
          mdg_admpop_adm3_2018_t_tl,
          geom
        )
        VALUES (
          $1, $2, $3, $4,
          ST_Multi(
            ST_CollectionExtract(
              ST_MakeValid(
                ST_Transform(
                  ST_SetSRID(
                    ST_GeomFromGeoJSON($5),
                    $6
                  ),
                  4326
                )
              ),
              3
            )
          )
        )
        `,
        [
          commune.region,
          commune.district,
          commune.commune,
          commune.population,
          commune.geometry,
          communeSrid,
        ],
      );
    }

    console.log(
      'Communes insérées :',
      mappedCommunes.length,
    );

    // 3. Importer les zones en convertissant leur projection.
    for (const zone of zones.features) {
      await queryRunner.query(
        `
        INSERT INTO public.zones_couverture_5km (geom)
        VALUES (
          ST_Multi(
            ST_CollectionExtract(
              ST_MakeValid(
                ST_Transform(
                  ST_SetSRID(
                    ST_GeomFromGeoJSON($1),
                    $2
                  ),
                  4326
                )
              ),
              3
            )
          )
        )
        `,
        [
          JSON.stringify(zone.geometry),
          zoneSrid,
        ],
      );
    }

    // 4. Créer les index spatiaux nécessaires.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
        idx_restauration_communes_geom
      ON public.communes_population
      USING GIST (geom)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
        idx_restauration_zones_geom
      ON public.zones_couverture_5km
      USING GIST (geom)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS
        idx_restauration_facilities_geom
      ON public.facilities
      USING GIST (geom)
    `);

    // 5. Uniformiser les rattachements territoriaux.
    // Les noms des formations ne sont pas modifiés.
    await queryRunner.query(`
      WITH rattachements AS (
        SELECT
          f.id,
          c.adm1_en,
          c.adm2_en,
          c.adm3_en
        FROM public.facilities f
        CROSS JOIN LATERAL (
          SELECT
            cp.adm1_en,
            cp.adm2_en,
            cp.adm3_en
          FROM public.communes_population cp
          WHERE
            cp.geom && f.geom
            AND ST_Covers(cp.geom, f.geom)
          ORDER BY
            ST_Area(cp.geom::geography),
            cp.adm3_en
          LIMIT 1
        ) c
      )
      UPDATE public.facilities f
      SET
        adm1_name = r.adm1_en,
        adm2_name = r.adm2_en,
        adm3_name = r.adm3_en
      FROM rattachements r
      WHERE f.id = r.id
      RETURNING f.id
    `);

    // 6. Vérifier les effectifs.
    const result = await counts();

    for (const [table, expectedCount] of Object.entries(
      expected,
    )) {
      if (result[table] !== expectedCount) {
        throw new Error(
          `Effectif incohérent après import : ${table}.`,
        );
      }
    }

    // Vérifier les données communales.
    const invalidCommunes = await queryRunner.query(`
      SELECT COUNT(*) AS n
      FROM public.communes_population
      WHERE
        adm1_en IS NULL
        OR adm2_en IS NULL
        OR adm3_en IS NULL
        OR mdg_admpop_adm3_2018_t_tl IS NULL
        OR geom IS NULL
        OR ST_IsEmpty(geom)
        OR NOT ST_IsValid(geom)
    `);

    if (Number(invalidCommunes[0].n) !== 0) {
      throw new Error(
        'Certaines communes restent inexploitables ; annulation.',
      );
    }

    // Vérifier que les zones rencontrent bien les communes.
    const spatialCheck = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1
        FROM public.zones_couverture_5km z
        JOIN public.communes_population cp
          ON z.geom && cp.geom
          AND ST_Intersects(z.geom, cp.geom)
      ) AS intersection_ok
    `);

    if (!spatialCheck[0]?.intersection_ok) {
      throw new Error(
        'Les zones ne rencontrent aucune commune. ' +
          'Vérifier les projections. Import annulé.',
      );
    }

    await queryRunner.query(
      'ANALYZE public.facilities',
    );

    await queryRunner.query(
      'ANALYZE public.communes_population',
    );

    await queryRunner.query(
      'ANALYZE public.zones_couverture_5km',
    );

    // Valider uniquement si tous les contrôles réussissent.
    await queryRunner.commitTransaction();

    console.log('IMPORT VALIDÉ :', result);

    console.log(
      'Rattachements territoriaux effectués sur les formations ' +
        'localisées dans une commune.',
    );

    console.log(
      'Aucune écriture dans users. ' +
        'Ne pas exécuter un autre import après cette restauration.',
    );
  } catch (error) {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }

    throw error;
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

if (require.main === module) {
  runRestoration().catch((error: unknown) => {
    console.error(
      'Restauration interrompue :',
      error instanceof Error
        ? error.message
        : String(error),
    );

    process.exitCode = 1;
  });
}