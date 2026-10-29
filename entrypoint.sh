#!/bin/sh
set -e


DB_HOST="${DB_HOST:-postgres_db}"
DB_PORT="${DB_PORT:-5432}"
export DB_HOST DB_PORT

echo "=== Attente de la base de données PostgreSQL ==="

until nc -z -v -w30 "$DB_HOST" "$DB_PORT"; do
  echo "En attente de la base de données sur $DB_HOST:$DB_PORT..."
  sleep 2
done

echo "Base de données accessible !"

echo "=== Initialisation automatique des références PostGIS ==="

if [ ! -f dist/initialiser-srid.js ]; then
  echo "ERREUR : dist/initialiser-srid.js est absent."
  echo "Ajouter src/initialiser-srid.ts avant la compilation."
  exit 1
fi

node dist/initialiser-srid.js

if [ ! -f dist/restaurer-geodata.js ]; then
  echo "ERREUR : dist/restaurer-geodata.js est absent."
  echo "Ajouter src/restaurer-geodata.ts avant la compilation."
  exit 1
fi

for fichier in \
  health_facilities.geojson \
  communes_population.geojson \
  zones_couverture_5km.geojson
do
  if [ ! -f "dist/data/$fichier" ]; then
    echo "ERREUR : fichier source absent : dist/data/$fichier"
    exit 1
  fi
done

echo "=== Vérification des tables géographiques ==="

ACTION="$(node <<'NODE'
require('dotenv').config({ quiet: true });

const { Client } = require('pg');

const client = new Client(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
      }
    : {
        host: process.env.DB_HOST || 'postgres_db',
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'webmap_db',
      }
);

(async () => {
  try {
    await client.connect();

    const identity = (
      await client.query(
        'SELECT current_database() AS base'
      )
    ).rows[0];

    console.error('Base contrôlée :', identity.base);

    const counts = [];

    for (const table of [
      'facilities',
      'communes_population',
      'zones_couverture_5km',
    ]) {
      const exists = (
        await client.query(
          'SELECT to_regclass($1) AS relation',
          [`public.${table}`]
        )
      ).rows[0].relation;

      if (!exists) {
        throw new Error(
          `Table public.${table} absente : ` +
          'initialiser le schéma avant cet import.'
        );
      }

      const result = await client.query(
        `SELECT COUNT(*) AS n FROM public.${table}`
      );

      const numberOfRows = Number(result.rows[0].n);

      console.error(
        `${table} : ${numberOfRows} lignes`
      );

      counts.push(numberOfRows);
    }

    let action;

    if (counts.every(n => n === 0)) {
      action = 'IMPORT';
    } else if (counts.every(n => n > 0)) {
      action = 'SKIP';
    } else {
      action = 'PARTIAL';
    }

    process.stdout.write(action);
  } finally {
    await client.end();
  }
})().catch(error => {
  console.error(
    'Échec de vérification :',
    error.message
  );
  process.exitCode = 1;
});
NODE
)"

case "$ACTION" in
  # IMPORT)
  #   echo "=== Tables géographiques vides : import contrôlé ==="
  #   node dist/restaurer-geodata.js --apply
  #   ;;
  IMPORT)
    echo "=== Tables géographiques vides : import automatique désactivé ==="
    echo "=== Aucun établissement, commune ou zone ne sera réimporté ==="
    ;;
    
  SKIP)
    echo "=== Données déjà présentes : aucun réimport ==="
    ;;

  PARTIAL)
    echo "ERREUR : tables géographiques partiellement remplies."
    echo "Arrêt de sécurité : contrôler les données."
    echo "Aucune suppression automatique n'est effectuée."
    exit 1
    ;;

  *)
    echo "ERREUR : résultat de vérification inattendu : $ACTION"
    exit 1
    ;;
esac
echo "=== Démarrage de l'application NestJS ==="
exec "$@"