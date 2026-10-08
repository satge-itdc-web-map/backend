#!/bin/sh
set -e

echo "=== Exécution du seed automatique (importation des données GeoJSON) ==="
npx ts-node src/import-facilities.ts || echo "Avertissement : Erreur lors de l'exécution du seed"

echo "=== Démarrage de l'application NestJS ==="
exec "$@"