# Les dépendances entre les parties du projet

Fichier fabriqué par `pnpm arch` (`scripts/architecture.mjs`) : ne pas le modifier à la main.
Chaque flèche dit « importe » (tests exclus). Le schéma ne change que si une nouvelle relation apparaît
entre deux parties : c'est le moment de se demander si elle est voulue.

```mermaid
flowchart LR
  subgraph appli["apps/app (iOS, Android, web)"]
    n2["composants"]
    n0["pages"]
    n5["appels API"]
    n7["réglages"]
    n4["navigation"]
    n1["écrans"]
    n3["catalogue"]
  end
  subgraph api["apps/api (serveur)"]
    n14["socle"]
    n9["comptes"]
    n10["projets"]
    n8["routes"]
    n11["médias"]
    n12["e-mails"]
  end
  subgraph paquets["packages (partagés)"]
    n17["traductions"]
    n18["marque"]
    n15["contrats"]
    n16["base de données"]
  end
  n9 --> n12
  n9 --> n10
  n9 --> n14
  n9 --> n16
  n9 --> n15
  n9 --> n18
  n9 --> n17
  n12 --> n18
  n12 --> n17
  n10 --> n14
  n10 --> n16
  n10 --> n15
  n8 --> n9
  n8 --> n11
  n8 --> n10
  n8 --> n14
  n8 --> n16
  n8 --> n15
  n14 --> n9
  n14 --> n12
  n14 --> n11
  n14 --> n10
  n14 --> n8
  n14 --> n16
  n14 --> n15
  n14 --> n18
  n14 --> n17
  n5 --> n2
  n5 --> n7
  n5 --> n15
  n5 --> n18
  n3 --> n2
  n3 --> n18
  n2 --> n5
  n2 --> n7
  n2 --> n15
  n2 --> n18
  n2 --> n17
  n4 --> n5
  n4 --> n2
  n0 --> n5
  n0 --> n3
  n0 --> n2
  n0 --> n4
  n0 --> n7
  n0 --> n1
  n0 --> n17
  n7 --> n17
  n1 --> n5
  n1 --> n2
  n1 --> n4
  n1 --> n15
  n1 --> n18
  n1 --> n17
  n15 --> n17
  n17 --> n18
```

## Les règles vérifiées

- L'appli n'importe jamais le code de l'API ni la base de données (secrets, accès direct).
- L'API n'importe jamais le code de l'appli.
- Un paquet partagé (packages/) n'importe jamais une application.
- Les contrats, partagés avec l'appli, n'importent jamais la base de données.
- Un composant (src/ui) ne connaît ni les écrans, ni les appels à l’API, ni la navigation.
- Le code de production n’importe jamais les outils de test.

Exceptions acceptées :

- `apps/app/src/ui/LanguageSwitcher.tsx -> apps/app/src/profile/useChooseLanguage.ts`
