# 0008 — Le temps réel : un flux SSE par appareil, des signaux sans contenu, un bus en mémoire

- Statut : accepté
- Date : 2026-11-27 (R21, « Le temps réel », `docs/scenarios/refonte.md`)
- Complète : 0001 (la pile), 0003 (un seul serveur de production)

## Contexte

Jusqu'à R20, le serveur ne pousse rien vers l'appli. Ce que font les autres membres (un commentaire,
une réaction, un suivi, un avis d'Activité) ne paraît qu'en rechargeant la page, ou à la relecture
de trois requêtes toutes les minutes (le compte de l'Activité, les nouveautés du Fil et des ruches).
On veut que tout arrive en moins de deux secondes, sur le web et dans les applis, sans rien changer
à qui voit quoi.

## Décision

1. **Un flux SSE par appareil** (`GET /v1/live`, `text/event-stream`). Le SSE (« Server-Sent
   Events ») est une réponse HTTP qui ne se termine pas : le serveur y écrit un message à chaque
   changement. Il passe par les mêmes cookies de session, les mêmes middlewares, le même CORS et le
   même Caddy que le reste de l'API, et il se lit par `fetch` en flux dans le navigateur comme dans
   les applis (`expo/fetch`). Pas de WebSocket : il faudrait un second chemin d'authentification et
   de limites, pour un besoin qui va du serveur vers l'appli seulement.
2. **Un signal ne porte aucun contenu** : `{ topic, kind }` (« les commentaires du projet X ont
   changé »). L'appli relit alors ses requêtes, avec ses propres droits. Aucun texte, nom ni nombre
   ne passe par le flux : la règle de lecture reste celle des routes existantes.
3. **Les destinataires sont filtrés à l'émission**, en plus de la vérification des sujets déclarés :
   pas de signal vers qui a bloqué l'auteur du geste ou en est bloqué, ni hors de l'audience de
   l'objet (ruche, projet privé). Un signal seul ne doit rien apprendre de ce qu'on ne pourrait pas
   lire. Les sujets sont revérifiés quand une visibilité change (projet privé ou retiré, blocage,
   départ d'une ruche, testeur retiré, administrateur révoqué), et la session de chaque flux est
   relue toutes les minutes.
4. **Le bus est en mémoire du processus de l'API** (`apps/api/src/live/hub.ts`). La production n'a
   qu'une instance de l'API (0003, `infra/docker-compose.yml`) : un événement émis par une route
   atteint tous les flux ouverts sans passer par la base. On émet **après** la fin de la transaction,
   jamais dedans, pour ne pas annoncer une écriture qui serait annulée.
5. **Le repli** : si le flux ne s'ouvre pas, l'appli relit comme avant, toutes les minutes.

## Conséquences

- **Une seconde instance de l'API casserait le temps réel** : un membre connecté à l'une ne
  recevrait pas ce qui s'écrit sur l'autre. Avant d'en ajouter une, le bus passe à `LISTEN/NOTIFY`
  de PostgreSQL (déjà là, sans service de plus), en gardant la même interface `hub.emit`.
- Un redéploiement coupe tous les flux : l'appli se reconnecte seule (1 s, puis jusqu'à 30 s, au
  hasard) et relit tout ce qu'elle écoute, une fois. Rien n'est perdu, rien n'est annoncé deux fois.
- Chaque flux ouvert tient une connexion HTTP, pas une connexion à la base : la base n'est lue qu'à
  l'ouverture, à la déclaration d'un sujet, à l'émission (trois requêtes au plus) et toutes les
  minutes pour les sessions.
- Caddy ne doit ni compresser ni tamponner `text/event-stream` (`infra/Caddyfile`).
- Ni présence, ni « en train d'écrire », ni « vu » : le flux ne garde aucune trace de qui regarde
  quoi au-delà de la connexion ouverte.
