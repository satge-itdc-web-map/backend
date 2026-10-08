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
RUN npm ci --only=production

# Copie du code compilé (dist) et des sources/données
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/src/data ./dist/data

# Copie du script d'entrée
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["/bin/sh", "entrypoint.sh"]
CMD ["node", "dist/main.js"]