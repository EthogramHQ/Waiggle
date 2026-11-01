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
    n25["réglages"]
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
    n22["search"]
    n23["suggestions"]
    n24["tools"]
  end
  subgraph api["apps/api (serveur)"]
    n26["routes"]
    n50["socle"]
  end
  subgraph apiDomaines["apps/api : domaines"]
    n27["auth"]
    n28["blocks"]
    n29["comments"]
    n30["email"]
    n31["feed"]
    n32["follows"]
    n33["handles"]
    n34["jobs"]
    n35["media"]
    n36["mentions"]
    n37["moderation"]
    n38["notes"]
    n39["notifications"]
    n40["profile"]
    n41["projects"]
    n42["reactions"]
    n43["removals"]
    n44["reports"]
    n45["search"]
    n46["security"]
    n47["suggestions"]
    n48["suspension"]
    n49["tools"]
  end
  subgraph paquets["packages (partagés)"]
    n51["contrats"]
    n52["base de données"]
    n53["traductions"]
    n54["marque"]
  end
  n0 --> n1
  n0 --> n2
  n0 --> n3
  n0 --> n4
  n0 --> n5
  n0 --> n6
  n0 --> n18
  n0 --> n25
  n0 --> n53
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
  n1 --> n24
  n1 --> n25
  n1 --> n51
  n1 --> n53
  n1 --> n54
  n2 --> n18
  n2 --> n25
  n2 --> n51
  n2 --> n53
  n2 --> n54
  n3 --> n2
  n3 --> n51
  n3 --> n54
  n4 --> n2
  n4 --> n5
  n4 --> n6
  n4 --> n15
  n4 --> n17
  n4 --> n18
  n5 --> n6
  n5 --> n25
  n6 --> n5
  n6 --> n25
  n6 --> n51
  n6 --> n54
  n7 --> n2
  n7 --> n4
  n7 --> n5
  n7 --> n10
  n7 --> n17
  n7 --> n51
  n8 --> n5
  n8 --> n19
  n8 --> n51
  n9 --> n5
  n9 --> n25
  n9 --> n51
  n10 --> n2
  n10 --> n5
  n10 --> n15
  n10 --> n16
  n10 --> n19
  n10 --> n23
  n10 --> n51
  n11 --> n5
  n11 --> n10
  n11 --> n19
  n13 --> n5
  n13 --> n51
  n14 --> n5
  n14 --> n51
  n15 --> n5
  n15 --> n6
  n15 --> n18
  n15 --> n51
  n16 --> n2
  n16 --> n5
  n16 --> n10
  n16 --> n19
  n16 --> n25
  n16 --> n51
  n17 --> n2
  n17 --> n5
  n17 --> n51
  n18 --> n5
  n18 --> n6
  n18 --> n12
  n18 --> n51
  n19 --> n2
  n19 --> n5
  n19 --> n12
  n19 --> n18
  n19 --> n51
  n20 --> n5
  n20 --> n19
  n21 --> n5
  n21 --> n51
  n22 --> n5
  n22 --> n51
  n23 --> n2
  n23 --> n5
  n23 --> n11
  n23 --> n15
  n23 --> n51
  n24 --> n5
  n24 --> n51
  n25 --> n53
  n26 --> n27
  n26 --> n28
  n26 --> n29
  n26 --> n30
  n26 --> n31
  n26 --> n32
  n26 --> n33
  n26 --> n35
  n26 --> n36
  n26 --> n37
  n26 --> n38
  n26 --> n39
  n26 --> n40
  n26 --> n41
  n26 --> n42
  n26 --> n44
  n26 --> n45
  n26 --> n47
  n26 --> n48
  n26 --> n49
  n26 --> n50
  n26 --> n51
  n26 --> n52
  n26 --> n54
  n27 --> n29
  n27 --> n30
  n27 --> n33
  n27 --> n37
  n27 --> n41
  n27 --> n44
  n27 --> n48
  n27 --> n50
  n27 --> n51
  n27 --> n52
  n27 --> n53
  n27 --> n54
  n28 --> n33
  n28 --> n40
  n28 --> n51
  n28 --> n52
  n29 --> n28
  n29 --> n36
  n29 --> n40
  n29 --> n41
  n29 --> n43
  n29 --> n50
  n29 --> n51
  n29 --> n52
  n30 --> n39
  n30 --> n51
  n30 --> n52
  n30 --> n53
  n30 --> n54
  n31 --> n32
  n31 --> n38
  n31 --> n41
  n31 --> n50
  n31 --> n51
  n31 --> n52
  n32 --> n41
  n32 --> n52
  n33 --> n39
  n33 --> n50
  n33 --> n51
  n33 --> n52
  n33 --> n53
  n34 --> n27
  n34 --> n30
  n34 --> n33
  n34 --> n39
  n34 --> n44
  n34 --> n48
  n34 --> n50
  n34 --> n51
  n34 --> n52
  n36 --> n28
  n36 --> n29
  n36 --> n40
  n36 --> n51
  n36 --> n52
  n37 --> n30
  n37 --> n44
  n37 --> n48
  n37 --> n50
  n37 --> n51
  n37 --> n52
  n38 --> n43
  n38 --> n51
  n38 --> n52
  n39 --> n28
  n39 --> n40
  n39 --> n41
  n39 --> n43
  n39 --> n48
  n39 --> n51
  n39 --> n52
  n40 --> n33
  n40 --> n48
  n40 --> n52
  n40 --> n53
  n41 --> n28
  n41 --> n29
  n41 --> n32
  n41 --> n38
  n41 --> n40
  n41 --> n42
  n41 --> n43
  n41 --> n51
  n41 --> n52
  n42 --> n41
  n42 --> n51
  n42 --> n52
  n43 --> n51
  n43 --> n52
  n44 --> n28
  n44 --> n29
  n44 --> n33
  n44 --> n34
  n44 --> n37
  n44 --> n39
  n44 --> n41
  n44 --> n48
  n44 --> n50
  n44 --> n51
  n44 --> n52
  n45 --> n28
  n45 --> n32
  n45 --> n40
  n45 --> n41
  n45 --> n49
  n45 --> n51
  n45 --> n52
  n46 --> n50
  n47 --> n33
  n47 --> n41
  n47 --> n50
  n47 --> n51
  n47 --> n52
  n48 --> n39
  n48 --> n50
  n48 --> n51
  n48 --> n52
  n49 --> n41
  n49 --> n45
  n49 --> n51
  n49 --> n52
  n50 --> n26
  n50 --> n27
  n50 --> n30
  n50 --> n33
  n50 --> n34
  n50 --> n35
  n50 --> n46
  n50 --> n48
  n50 --> n51
  n50 --> n52
  n50 --> n53
  n50 --> n54
  n51 --> n53
  n53 --> n54
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
