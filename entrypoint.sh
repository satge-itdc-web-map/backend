#!/bin/sh
set -e

echo "=== Attente de la base de données PostgreSQL ==="
until nc -z -v -w30 $DB_HOST $DB_PORT; do
  echo "En attente de la base de données sur $DB_HOST:$DB_PORT..."
  sleep 2
done
echo "Base de données accessible !"

echo "=== Exécution du seed automatique (importation des données GeoJSON) ==="
node dist/import-facilities.js || echo "Avertissement : Erreur lors de l'exécution du seed"

echo "=== Démarrage de l'application NestJS ==="
exec "$@"