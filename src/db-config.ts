// Configuration de connexion PostgreSQL pour les scripts de démarrage.
// Aucune valeur par défaut, aucun fichier .env : tout vient des variables
// d'environnement injectées par Jenkins (credentials). Les valeurs ne sont
// jamais affichées dans les logs, seuls les NOMS de variables manquantes le sont.
import { DataSourceOptions } from 'typeorm';

function requis(nom: string): string {
  const valeur = process.env[nom];
  if (!valeur || !valeur.trim()) {
    throw new Error(`Variable d'environnement obligatoire absente : ${nom}`);
  }
  return valeur;
}

export function optionsBase(): DataSourceOptions {
  const url = process.env.DATABASE_URL;
  if (url && url.trim()) {
    return { type: 'postgres', url };
  }

  const port = Number(requis('DB_PORT'));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('Variable DB_PORT invalide.');
  }

  return {
    type: 'postgres',
    host: requis('DB_HOST'),
    port,
    username: requis('DB_USERNAME'),
    password: requis('DB_PASSWORD'),
    database: requis('DB_NAME'),
  };
}