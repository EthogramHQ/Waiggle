# Les dépendances entre les parties du projet

Fichier fabriqué par `pnpm arch` (`scripts/architecture.mjs`) : ne pas le modifier à la main.
Chaque flèche dit « importe » (tests exclus). Le schéma ne change que si une nouvelle relation apparaît
entre deux parties : c'est le moment de se demander si elle est voulue.

```mermaid
flowchart LR
  subgraph appli["apps/app (iOS, Android, web)"]
    n0["pages"]
    n1["écrans"]
    n2["composants"]
    n3["catalogue"]
    n4["navigation"]
    n5["client API"]
    n22["réglages"]
  end
  subgraph appliDomaines["apps/app : domaines"]
    n6["accounts"]
    n7["blocks"]
    n8["comments"]
    n9["email"]
    n10["feed"]
    n11["follows"]
    n12["media"]
    n13["members"]
    n14["mentions"]
    n15["moderation"]
    n16["notes"]
    n17["notifications"]
    n18["profile"]
    n19["projects"]
    n20["reactions"]
    n21["reports"]
  end
  subgraph api["apps/api (serveur)"]
    n23["routes"]
    n44["socle"]
  end
  subgraph apiDomaines["apps/api : domaines"]
    n24["auth"]
    n25["blocks"]
    n26["comments"]
    n27["email"]
    n28["feed"]
    n29["follows"]
    n30["handles"]
    n31["jobs"]
    n32["media"]
    n33["mentions"]
    n34["moderation"]
    n35["notes"]
    n36["notifications"]
    n37["profile"]
    n38["projects"]
    n39["reactions"]
    n40["removals"]
    n41["reports"]
    n42["security"]
    n43["suspension"]
  end
  subgraph paquets["packages (partagés)"]
    n45["contrats"]
    n46["base de données"]
    n47["traductions"]
    n48["marque"]
  end
  n0 --> n1
  n0 --> n2
  n0 --> n3
  n0 --> n4
  n0 --> n5
  n0 --> n18
  n0 --> n22
  n0 --> n47
  n1 --> n2
  n1 --> n4
  n1 --> n5
  n1 --> n6
  n1 --> n7
  n1 --> n8
  n1 --> n9
  n1 --> n10
  n1 --> n11
  n1 --> n13
  n1 --> n14
  n1 --> n15
  n1 --> n16
  n1 --> n17
  n1 --> n18
  n1 --> n19
  n1 --> n20
  n1 --> n21
  n1 --> n22
  n1 --> n45
  n1 --> n47
  n1 --> n48
  n2 --> n18
  n2 --> n22
  n2 --> n45
  n2 --> n47
  n2 --> n48
  n3 --> n2
  n3 --> n45
  n3 --> n48
  n4 --> n2
  n4 --> n5
  n4 --> n6
  n4 --> n15
  n4 --> n17
  n4 --> n18
  n5 --> n6
  n5 --> n22
  n6 --> n5
  n6 --> n22
  n6 --> n45
  n6 --> n48
  n7 --> n2
  n7 --> n4
  n7 --> n5
  n7 --> n10
  n7 --> n17
  n7 --> n45
  n8 --> n5
  n8 --> n19
  n8 --> n45
  n9 --> n5
  n9 --> n22
  n9 --> n45
  n10 --> n5
  n10 --> n45
  n11 --> n5
  n11 --> n10
  n11 --> n19
  n13 --> n5
  n13 --> n45
  n14 --> n5
  n14 --> n45
  n15 --> n5
  n15 --> n6
  n15 --> n18
  n15 --> n45
  n16 --> n2
  n16 --> n5
  n16 --> n10
  n16 --> n19
  n16 --> n22
  n16 --> n45
  n17 --> n2
  n17 --> n5
  n17 --> n45
  n18 --> n5
  n18 --> n6
  n18 --> n12
  n18 --> n45
  n19 --> n2
  n19 --> n5
  n19 --> n12
  n19 --> n18
  n19 --> n45
  n20 --> n5
  n20 --> n19
  n21 --> n5
  n21 --> n45
  n22 --> n47
  n23 --> n24
  n23 --> n25
  n23 --> n26
  n23 --> n27
  n23 --> n28
  n23 --> n29
  n23 --> n30
  n23 --> n32
  n23 --> n33
  n23 --> n34
  n23 --> n35
  n23 --> n36
  n23 --> n37
  n23 --> n38
  n23 --> n39
  n23 --> n41
  n23 --> n43
  n23 --> n44
  n23 --> n45
  n23 --> n46
  n23 --> n48
  n24 --> n26
  n24 --> n27
  n24 --> n30
  n24 --> n34
  n24 --> n38
  n24 --> n41
  n24 --> n43
  n24 --> n44
  n24 --> n45
  n24 --> n46
  n24 --> n47
  n24 --> n48
  n25 --> n30
  n25 --> n37
  n25 --> n45
  n25 --> n46
  n26 --> n25
  n26 --> n33
  n26 --> n37
  n26 --> n38
  n26 --> n40
  n26 --> n44
  n26 --> n45
  n26 --> n46
  n27 --> n36
  n27 --> n45
  n27 --> n46
  n27 --> n47
  n27 --> n48
  n28 --> n29
  n28 --> n35
  n28 --> n38
  n28 --> n44
  n28 --> n45
  n28 --> n46
  n29 --> n38
  n29 --> n46
  n30 --> n36
  n30 --> n44
  n30 --> n45
  n30 --> n46
  n30 --> n47
  n31 --> n24
  n31 --> n27
  n31 --> n30
  n31 --> n36
  n31 --> n41
  n31 --> n43
  n31 --> n44
  n31 --> n45
  n31 --> n46
  n33 --> n25
  n33 --> n26
  n33 --> n37
  n33 --> n45
  n33 --> n46
  n34 --> n27
  n34 --> n41
  n34 --> n43
  n34 --> n44
  n34 --> n45
  n34 --> n46
  n35 --> n40
  n35 --> n45
  n35 --> n46
  n36 --> n25
  n36 --> n37
  n36 --> n38
  n36 --> n40
  n36 --> n43
  n36 --> n45
  n36 --> n46
  n37 --> n30
  n37 --> n43
  n37 --> n46
  n37 --> n47
  n38 --> n25
  n38 --> n26
  n38 --> n29
  n38 --> n35
  n38 --> n37
  n38 --> n39
  n38 --> n40
  n38 --> n45
  n38 --> n46
  n39 --> n38
  n39 --> n45
  n39 --> n46
  n40 --> n45
  n40 --> n46
  n41 --> n25
  n41 --> n26
  n41 --> n30
  n41 --> n31
  n41 --> n34
  n41 --> n36
  n41 --> n38
  n41 --> n43
  n41 --> n44
  n41 --> n45
  n41 --> n46
  n42 --> n44
  n43 --> n36
  n43 --> n44
  n43 --> n45
  n43 --> n46
  n44 --> n23
  n44 --> n24
  n44 --> n27
  n44 --> n30
  n44 --> n31
  n44 --> n32
  n44 --> n42
  n44 --> n43
  n44 --> n45
  n44 --> n46
  n44 --> n47
  n44 --> n48
  n45 --> n47
  n47 --> n48
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
