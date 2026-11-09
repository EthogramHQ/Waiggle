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
    n26["réglages"]
  end
  subgraph appliDomaines["apps/app : domaines"]
    n6["accounts"]
    n7["blocks"]
    n8["categories"]
    n9["comments"]
    n10["email"]
    n11["feed"]
    n12["follows"]
    n13["media"]
    n14["members"]
    n15["mentions"]
    n16["moderation"]
    n17["notes"]
    n18["notifications"]
    n19["profile"]
    n20["projects"]
    n21["reactions"]
    n22["reports"]
    n23["search"]
    n24["suggestions"]
    n25["tools"]
  end
  subgraph api["apps/api (serveur)"]
    n27["routes"]
    n53["socle"]
  end
  subgraph apiDomaines["apps/api : domaines"]
    n28["auth"]
    n29["blocks"]
    n30["catalogue"]
    n31["categories"]
    n32["comments"]
    n33["email"]
    n34["feed"]
    n35["follows"]
    n36["handles"]
    n37["jobs"]
    n38["media"]
    n39["mentions"]
    n40["moderation"]
    n41["notes"]
    n42["notifications"]
    n43["profile"]
    n44["projects"]
    n45["reactions"]
    n46["removals"]
    n47["reports"]
    n48["search"]
    n49["security"]
    n50["suggestions"]
    n51["suspension"]
    n52["tools"]
  end
  subgraph paquets["packages (partagés)"]
    n54["contrats"]
    n55["base de données"]
    n56["traductions"]
    n57["marque"]
  end
  n0 --> n1
  n0 --> n2
  n0 --> n3
  n0 --> n4
  n0 --> n5
  n0 --> n6
  n0 --> n19
  n0 --> n26
  n0 --> n56
  n1 --> n2
  n1 --> n4
  n1 --> n5
  n1 --> n6
  n1 --> n7
  n1 --> n8
  n1 --> n9
  n1 --> n10
  n1 --> n11
  n1 --> n12
  n1 --> n14
  n1 --> n15
  n1 --> n16
  n1 --> n17
  n1 --> n18
  n1 --> n19
  n1 --> n20
  n1 --> n21
  n1 --> n22
  n1 --> n23
  n1 --> n25
  n1 --> n26
  n1 --> n54
  n1 --> n56
  n1 --> n57
  n2 --> n19
  n2 --> n26
  n2 --> n54
  n2 --> n56
  n2 --> n57
  n3 --> n1
  n3 --> n2
  n3 --> n8
  n3 --> n20
  n3 --> n25
  n3 --> n26
  n3 --> n54
  n3 --> n57
  n4 --> n2
  n4 --> n5
  n4 --> n6
  n4 --> n16
  n4 --> n18
  n4 --> n19
  n5 --> n6
  n5 --> n26
  n6 --> n5
  n6 --> n26
  n6 --> n54
  n6 --> n57
  n7 --> n2
  n7 --> n4
  n7 --> n5
  n7 --> n11
  n7 --> n18
  n7 --> n54
  n8 --> n5
  n8 --> n54
  n8 --> n56
  n9 --> n5
  n9 --> n20
  n9 --> n54
  n10 --> n5
  n10 --> n26
  n10 --> n54
  n11 --> n2
  n11 --> n4
  n11 --> n5
  n11 --> n16
  n11 --> n17
  n11 --> n20
  n11 --> n24
  n11 --> n54
  n12 --> n5
  n12 --> n11
  n12 --> n20
  n14 --> n5
  n14 --> n54
  n15 --> n5
  n15 --> n54
  n16 --> n5
  n16 --> n6
  n16 --> n8
  n16 --> n19
  n16 --> n25
  n16 --> n54
  n17 --> n2
  n17 --> n5
  n17 --> n11
  n17 --> n20
  n17 --> n26
  n17 --> n54
  n18 --> n2
  n18 --> n5
  n18 --> n54
  n19 --> n5
  n19 --> n6
  n19 --> n13
  n19 --> n54
  n20 --> n2
  n20 --> n4
  n20 --> n5
  n20 --> n8
  n20 --> n11
  n20 --> n12
  n20 --> n13
  n20 --> n14
  n20 --> n16
  n20 --> n26
  n20 --> n54
  n21 --> n5
  n21 --> n20
  n22 --> n5
  n22 --> n54
  n23 --> n5
  n23 --> n54
  n24 --> n2
  n24 --> n5
  n24 --> n12
  n24 --> n16
  n24 --> n54
  n25 --> n5
  n25 --> n54
  n26 --> n56
  n27 --> n28
  n27 --> n29
  n27 --> n30
  n27 --> n31
  n27 --> n32
  n27 --> n33
  n27 --> n34
  n27 --> n35
  n27 --> n36
  n27 --> n38
  n27 --> n39
  n27 --> n40
  n27 --> n41
  n27 --> n42
  n27 --> n43
  n27 --> n44
  n27 --> n45
  n27 --> n47
  n27 --> n48
  n27 --> n49
  n27 --> n50
  n27 --> n51
  n27 --> n52
  n27 --> n53
  n27 --> n54
  n27 --> n55
  n27 --> n57
  n28 --> n32
  n28 --> n33
  n28 --> n36
  n28 --> n40
  n28 --> n44
  n28 --> n47
  n28 --> n51
  n28 --> n52
  n28 --> n53
  n28 --> n54
  n28 --> n55
  n28 --> n56
  n28 --> n57
  n29 --> n36
  n29 --> n43
  n29 --> n54
  n29 --> n55
  n30 --> n44
  n30 --> n53
  n30 --> n54
  n30 --> n55
  n31 --> n44
  n31 --> n55
  n32 --> n29
  n32 --> n39
  n32 --> n43
  n32 --> n44
  n32 --> n46
  n32 --> n53
  n32 --> n54
  n32 --> n55
  n33 --> n42
  n33 --> n54
  n33 --> n55
  n33 --> n56
  n33 --> n57
  n34 --> n35
  n34 --> n41
  n34 --> n44
  n34 --> n53
  n34 --> n54
  n34 --> n55
  n35 --> n44
  n35 --> n55
  n36 --> n42
  n36 --> n53
  n36 --> n54
  n36 --> n55
  n36 --> n56
  n37 --> n28
  n37 --> n33
  n37 --> n36
  n37 --> n42
  n37 --> n47
  n37 --> n51
  n37 --> n52
  n37 --> n53
  n37 --> n54
  n37 --> n55
  n39 --> n29
  n39 --> n32
  n39 --> n43
  n39 --> n48
  n39 --> n54
  n39 --> n55
  n40 --> n33
  n40 --> n47
  n40 --> n51
  n40 --> n53
  n40 --> n54
  n40 --> n55
  n41 --> n46
  n41 --> n54
  n41 --> n55
  n42 --> n29
  n42 --> n43
  n42 --> n44
  n42 --> n46
  n42 --> n51
  n42 --> n54
  n42 --> n55
  n43 --> n36
  n43 --> n51
  n43 --> n54
  n43 --> n55
  n43 --> n56
  n44 --> n29
  n44 --> n32
  n44 --> n35
  n44 --> n41
  n44 --> n43
  n44 --> n45
  n44 --> n46
  n44 --> n54
  n44 --> n55
  n45 --> n44
  n45 --> n54
  n45 --> n55
  n46 --> n54
  n46 --> n55
  n47 --> n29
  n47 --> n32
  n47 --> n36
  n47 --> n37
  n47 --> n40
  n47 --> n42
  n47 --> n43
  n47 --> n44
  n47 --> n51
  n47 --> n53
  n47 --> n54
  n47 --> n55
  n48 --> n29
  n48 --> n35
  n48 --> n43
  n48 --> n44
  n48 --> n54
  n48 --> n55
  n49 --> n53
  n50 --> n29
  n50 --> n36
  n50 --> n44
  n50 --> n53
  n50 --> n54
  n50 --> n55
  n51 --> n42
  n51 --> n53
  n51 --> n54
  n51 --> n55
  n52 --> n44
  n52 --> n53
  n52 --> n54
  n52 --> n55
  n53 --> n27
  n53 --> n28
  n53 --> n33
  n53 --> n36
  n53 --> n37
  n53 --> n38
  n53 --> n49
  n53 --> n51
  n53 --> n54
  n53 --> n55
  n53 --> n56
  n53 --> n57
  n54 --> n56
  n56 --> n57
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
