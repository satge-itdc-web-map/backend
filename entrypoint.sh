#!/bin/sh
# ============================================================
# Démarrage du backend Web Map
# - Aucune valeur par défaut, aucun fichier .env : toutes les variables
#   (DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME) sont injectées
#   par Jenkins depuis ses credentials.
# - Aucune valeur sensible n'est affichée dans les logs.
# - Import des données géographiques uniquement si les tables sont vides
#   (jamais de doublon, jamais de suppression).
# ============================================================
set -e

echo "=== Vérification de la configuration ==="
for variable in DB_HOST DB_PORT DB_USERNAME DB_PASSWORD DB_NAME; do
  eval "valeur=\${$variable:-}"
  if [ -z "$valeur" ]; then
    echo "ERREUR : variable d'environnement obligatoire absente : $variable"
    exit 1
  fi
done

echo "=== Attente de la base de données ==="
tentatives=0
until nc -z -w3 "$DB_HOST" "$DB_PORT" >/dev/null 2>&1; do
  tentatives=$((tentatives + 1))
  if [ "$tentatives" -ge 60 ]; then
    echo "ERREUR : base de données injoignable après 60 tentatives."
    exit 1
  fi
  echo "En attente de la base de données... ($tentatives/60)"
  sleep 2
done
echo "Base de données accessible."

for fichier in dist/initialiser-srid.js dist/restaurer-geodata.js \
               dist/data/health_facilities.geojson \
               dist/data/communes_population.geojson \
               dist/data/zones_couverture_5km.geojson; do
  if [ ! -f "$fichier" ]; then
    echo "ERREUR : fichier requis absent : $fichier"
    exit 1
  fi
done

echo "=== Initialisation des références PostGIS ==="
node dist/initialiser-srid.js

echo "=== Import des données géographiques (seulement si tables vides) ==="
node --max-old-space-size=1536 dist/restaurer-geodata.js --apply

echo "=== Démarrage de l'application NestJS ==="
exec "$@"