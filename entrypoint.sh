#!/bin/sh
set -e

echo "=== Attente de la base de données PostgreSQL ==="
until nc -z -v -w30 $DB_HOST $DB_PORT; do
  echo "En attente de la base de données sur $DB_HOST:$DB_PORT..."
  sleep 2
done
echo "Base de données accessible !"

echo "=== Import automatique désactivé pour éviter les réinsertions ==="
# Les imports seront exécutés manuellement après contrôle des données.

echo "=== Démarrage de l'application NestJS ==="
exec "$@"