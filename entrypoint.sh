#!/bin/sh
set -e

echo "=== Exécution du seed automatique (importation des données GeoJSON) ==="
# Exécution du fichier JavaScript compilé dans dist/
node dist/import-facilities.js || echo "Avertissement : Erreur lors de l'exécution du seed"

echo "=== Démarrage de l'application NestJS ==="
exec "$@"