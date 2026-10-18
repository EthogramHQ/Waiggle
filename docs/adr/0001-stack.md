# 0001 — TypeScript pour le cœur, Rust pour les modules spécialisés

- Statut : accepté
- Date : 2026-10-12

## Contexte

Une suggestion était d'écrire tout le projet en Rust. L'équipe est composée d'un développeur au
bagage JavaScript / frontend et de l'assistant, qui écrit l'essentiel du code. Le produit vise un usage
entre proches : la performance n'est pas un enjeu, la fiabilité, la sécurité et la vitesse de
développement le sont.

## Décision

- **TypeScript** pour l'API (Hono), l'appli (Expo) et les paquets partagés.
- **Rust** réservé aux modules où il apporte un vrai plus : peer-to-peer (iroh), passerelle vers les
  modèles locaux, éventuelle appli de bureau (Tauri), et briques utilisées sans être écrites
  (Garage, Meilisearch).

## Raisons

1. Le développeur humain doit pouvoir relire et comprendre le code produit.
2. L'authentification et le fournisseur OAuth pour MCP existent clés en main en TypeScript
   (Better Auth). En Rust, il faudrait en assembler une part importante soi-même.
3. Le frontend en Rust reste un petit écosystème, surtout pour une appli mobile.
4. Compilation plus rapide, donc des allers-retours plus courts pour l'agent.
5. Plus de contributeurs potentiels pour un projet open source.

## Conséquences

Un service pourra être réécrit en Rust plus tard s'il devient un goulot d'étranglement : le contrat
d'API (`packages/contracts`, OpenAPI) permet de le remplacer sans toucher au reste.
