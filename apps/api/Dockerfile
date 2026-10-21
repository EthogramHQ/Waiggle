# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
# Image Docker de l'API. À construire depuis la racine du dépôt :
#   docker build -f apps/api/Dockerfile .
# Deux étapes : une pour construire (avec tous les outils), une pour exécuter (le strict minimum).
#
# Chaque image de départ est désignée par son empreinte (@sha256:…), l'étiquette (24-alpine) n'est
# là que pour le lecteur : une étiquette peut être déplacée vers une autre image, une empreinte
# non. La construction est ainsi la même d'un jour à l'autre, et une image remplacée en douce sur
# le registre serait refusée. Revers : les correctifs de Node et d'Alpine n'arrivent qu'en
# changeant l'empreinte (Renovate le propose, voir docs/ops/serveur.md, « Mises à jour »).

# --- Étape 1 : construction ---
FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS build
WORKDIR /repo
RUN corepack enable

# On télécharge d'abord les dépendances, d'après le fichier de verrouillage.
# Docker garde cette étape en cache tant que ces fichiers ne changent pas : constructions plus rapides.
# package.json est indispensable ici : son champ "packageManager" fixe la version exacte de pnpm.
# Sans lui, corepack télécharge la toute dernière version, qui peut se comporter autrement.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .
# Installe uniquement l'API et ses dépendances internes (le « ... » après le nom).
RUN pnpm install --offline --frozen-lockfile --filter @ruche/api...
# Assemble tout le serveur en un seul fichier dist/index.js (voir le script "build").
RUN pnpm --filter @ruche/api build

# Exception : sharp (traitement des images) contient du code compilé pour chaque système, qu'on ne
# peut pas glisser dans dist/index.js. Le petit paquet apps/api/runtime ne contient que lui :
# « pnpm deploy » l'installe dans /runtime d'après pnpm-lock.yaml (versions exactes, vérifiées par
# leur empreinte), avec le binaire précompilé pour ce système (Alpine), sans script d'installation.
# inject-workspace-packages : réglage exigé par pnpm 10 pour déployer à partir du fichier de
# verrouillage commun. Sans effet ici : ce paquet ne dépend d'aucun autre paquet du dépôt.
RUN pnpm --filter @ruche/api-runtime deploy --prod --offline \
  --config.inject-workspace-packages=true /runtime

# --- Étape 2 : exécution ---
# On repart d'une image vide : ni code source, ni outils de build, ni dépendances de dev.
FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
WORKDIR /app
ENV NODE_ENV=production
# Les migrations SQL (création et évolution des tables) sont appliquées au démarrage.
ENV MIGRATIONS_DIR=/app/migrations
# Le code appartient à root : le serveur (qui tourne avec l'utilisateur « node ») peut le lire,
# mais pas le modifier. Même en cas de faille, il ne pourrait pas réécrire son propre code.
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/packages/db/migrations ./migrations
# package.json dit aussi à Node que dist/index.js utilise la syntaxe moderne des modules (ESM).
COPY --from=build /runtime/package.json ./package.json
COPY --from=build /runtime/node_modules ./node_modules
# Seul dossier où le serveur peut écrire : les fichiers envoyés par les membres (avatars).
# Un volume Docker y est monté (voir infra/docker-compose.yml) pour qu'ils survivent aux mises à jour.
ENV MEDIA_DIR=/app/media
RUN mkdir -p /app/media && chown node:node /app/media
# Le serveur tourne avec un utilisateur sans privilèges, jamais en root.
USER node
EXPOSE 3000
# Docker interroge /health toutes les 30 s pour savoir si le conteneur va bien.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/index.js"]
