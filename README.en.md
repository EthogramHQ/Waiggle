# Waiggle

*[Version française](README.md)*

Waiggle is a social network where friends and family share their AI projects, follow and try each
other's work, and encourage one another to build more. Technical identifiers keep the code name
"Ruche" (French for *beehive*), as in the `@ruche/…` packages.

> Phase 1 in progress: a first small circle, invite only.

## Principles

- Helping others counts as much as publishing.
- Nothing executable is hosted: each project links to its own external demo.
- Open source, hosted in France, no ads and no trackers.
- French and English from day one.

## Getting started

Requirements: Node.js 24 (see `.nvmrc`), pnpm 10 (`corepack enable`), Docker.

```bash
pnpm install
pnpm check            # lint, types and tests
pnpm --filter @ruche/api dev    # API on http://localhost:3000
pnpm --filter @ruche/app web    # app in the browser
```

## Deployment

The app runs on a VPS behind Caddy, from Docker images built by the CI and published on ghcr.io.
Server setup, deployment and backups are described (in French) in
[docs/ops/serveur.md](docs/ops/serveur.md).

## Contributing

Work happens in vertical slices: scenario, failing tests, backend, then UI. Project rules live in
[CONTRIBUTING.md](CONTRIBUTING.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[AGPL-3.0](LICENSE): any modified version made available over a network must publish its source.
