# syntax=docker/dockerfile:1
# Image Docker « web » : la porte d'entrée du serveur. Elle contient Caddy (voir infra/Caddyfile)
# et l'appli web déjà construite, prête à être servie. À construire depuis la racine du dépôt :
#   docker build -f infra/web/Dockerfile --build-arg APP_DOMAIN=waiggle.io \
#     --build-arg API_DOMAIN=api.waiggle.io .
# Sans ces deux réglages, l'appli est construite pour localhost (essais sur son ordinateur).
# Deux étapes, comme pour l'API : une pour construire, une pour servir (le strict minimum).

# --- Étape 1 : construction de l'appli web ---
FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable

# Les dépendances d'abord, d'après le fichier de verrouillage (mises en cache par Docker tant que
# ces fichiers ne changent pas). Voir apps/api/Dockerfile pour le détail.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .
# Uniquement l'appli et les paquets dont elle dépend.
RUN pnpm install --offline --frozen-lockfile --filter @ruche/app...

# Les adresses publiques de l'appli et de l'API. Expo les écrit dans le code de l'appli au moment
# de la construction (voir apps/app/src/config.ts) : une image ne sert donc qu'un seul domaine.
# ARG : un réglage passé à « docker build » ; ENV : une variable visible par les commandes.
ARG APP_DOMAIN=localhost
ARG API_DOMAIN=api.localhost
ENV EXPO_PUBLIC_APP_URL=https://${APP_DOMAIN} \
    EXPO_PUBLIC_API_URL=https://${API_DOMAIN} \
    EXPO_NO_TELEMETRY=1 \
    CI=1
RUN pnpm --filter @ruche/app build
# Le Caddyfile convient-il à cette appli ? (scripts autorisés, pages à paramètre)
RUN node infra/web/check-web.mjs apps/app/dist infra/Caddyfile

# --- Étape 2 : Caddy et les fichiers de l'appli, rien d'autre ---
FROM caddy:2.11.7-alpine
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/app/dist /srv/app
# Caddy tourne avec son propre utilisateur, jamais en root. Il ne peut écrire que dans /data et
# /config (les certificats) ; les fichiers de l'appli et le Caddyfile appartiennent à root : même
# en cas de faille, il ne pourrait pas les modifier. -S : utilisateur « système », sans mot de
# passe ni shell de connexion.
# Un numéro d'utilisateur fixe (10001) : les volumes des certificats lui appartiennent, il ne doit
# pas changer d'une image de base à l'autre, sinon Caddy ne pourrait plus y écrire.
RUN addgroup -S -g 10001 caddy && adduser -S -D -H -u 10001 -G caddy caddy \
  && chown -R caddy:caddy /data /config
# Le programme caddy de l'image officielle porte un « pouvoir de fichier » (ouvrir les ports 80
# et 443). Avec no-new-privileges, Linux refuse de lancer un tel programme pour un utilisateur
# ordinaire : on le lui retire. Les ports sont ouverts autrement (docker-compose.yml, sysctls).
RUN apk add --no-cache libcap && setcap -r /usr/bin/caddy && apk del libcap
USER caddy
# Refuse de construire une image dont le Caddyfile contient une erreur.
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
