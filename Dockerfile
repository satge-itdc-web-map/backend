# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner

WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY package*.json ./
# Installation des dépendances de prod + ts-node & typescript pour exécuter le seed .ts
RUN npm ci --only=production && npm install ts-node typescript

# Copie du code compilé et des fichiers GeoJSON
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/src ./src

# Copie et attribution des droits au script d'entrée
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["/bin/sh", "entrypoint.sh"]
CMD ["node", "dist/main.js"]