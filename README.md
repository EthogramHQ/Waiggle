# Waiggle

*[English version](README.en.md)*

Waiggle est un réseau social pour publier ses projets IA, suivre ceux de ses proches, les tester et
s'encourager mutuellement à en créer de nouveaux. Les identifiants techniques gardent le nom de
code « Ruche » (les paquets `@ruche/…`).

> Phase 1 en cours : un premier cercle restreint, sur invitation.

## Principes

- L'entraide vaut autant que la publication.
- On n'héberge rien d'exécutable : chaque projet pointe vers sa démo externe.
- Open source, hébergé en France, ni publicité ni traqueurs.
- Bilingue français / anglais dès le départ.

## Organisation du dépôt

```text
apps/
  api/          API Hono (REST, puis serveur MCP et tâches de fond)
  app/          Appli Expo : iOS, Android et web
packages/
  brand/        Nom affiché et jetons de design (couleurs, lettres, formes, mouvement)
  contracts/    Schémas Zod partagés et contrat d'API
  db/           Tables de la base de données et migrations
  i18n/         Traductions fr/en et choix de la langue
infra/          Docker Compose, Caddy et scripts du serveur
docs/           Scénarios, design, décisions et exploitation du serveur
```

## Démarrer

Prérequis : Node.js 24 (voir `.nvmrc`), pnpm 10 (`corepack enable`), Docker.

```bash
pnpm install
pnpm check            # lint, types et tests
pnpm --filter @ruche/api dev    # API sur http://localhost:3000
pnpm --filter @ruche/app web    # appli dans le navigateur, sur http://localhost:8081
```

En développement, l'API n'a besoin de rien d'autre : sans `DATABASE_URL`, elle utilise une base
PGlite enregistrée dans `apps/api/.data/`, et les e-mails (avec leur lien de vérification)
s'affichent dans le terminal.

Base de données, API et proxy HTTPS en conteneurs :

```bash
cp infra/.env.example infra/.env     # puis renseigner POSTGRES_PASSWORD, BETTER_AUTH_SECRET
                                     # et SIGNUP_INVITE_CODE (voir les commentaires du fichier)
docker compose -f infra/docker-compose.yml up --build
curl -k https://api.localhost/health # l'API ; l'appli web est sur https://localhost
```

## Mise en ligne

L'appli tourne sur un VPS, derrière Caddy. Les images Docker sont construites par la CI et
publiées sur ghcr.io. La mise en route du serveur, le déploiement et les sauvegardes sont décrits
dans [docs/ops/serveur.md](docs/ops/serveur.md).

## Contribuer

Le développement suit des tranches verticales : scénario, tests qui échouent, backend, puis
interface. Les règles du projet sont dans [CONTRIBUTING.md](CONTRIBUTING.md).

Pour signaler une faille de sécurité, voir [SECURITY.md](SECURITY.md).

## Licence

[AGPL-3.0](LICENSE) : toute version modifiée mise à disposition sur un réseau doit publier son
code source.
