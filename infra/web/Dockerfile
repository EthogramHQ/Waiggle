# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
# Image Docker « web » : la porte d'entrée du serveur. Elle contient Caddy (voir infra/Caddyfile)
# et l'appli web déjà construite, prête à être servie. À construire depuis la racine du dépôt :
#   docker build -f infra/web/Dockerfile --build-arg APP_DOMAIN=waiggle.com \
#     --build-arg API_DOMAIN=api.waiggle.com .
# Sans ces deux réglages, l'appli est construite pour localhost (essais sur son ordinateur).
# Deux étapes, comme pour l'API : une pour construire, une pour servir (le strict minimum).
# Les images de départ sont désignées par leur empreinte (@sha256:…), comme pour l'API (voir
# apps/api/Dockerfile) ; l'étiquette n'est là que pour le lecteur.

# --- Étape 1 : construction de l'appli web ---
FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS build
WORKDIR /repo
RUN corepack enable

# Les dépendances d'abord, d'après le fichier de verrouillage (mises en cache par Docker tant que
# ces fichiers ne changent pas). Voir apps/api/Dockerfile pour le détail, et pour patches/.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
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
FROM caddy:2.11.7-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f
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
