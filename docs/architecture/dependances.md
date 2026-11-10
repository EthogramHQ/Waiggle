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
    n28["réglages"]
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
    n25["testers"]
    n26["tools"]
    n27["updates"]
  end
  subgraph api["apps/api (serveur)"]
    n29["routes"]
    n55["socle"]
  end
  subgraph apiDomaines["apps/api : domaines"]
    n30["auth"]
    n31["blocks"]
    n32["catalogue"]
    n33["categories"]
    n34["comments"]
    n35["email"]
    n36["feed"]
    n37["follows"]
    n38["handles"]
    n39["jobs"]
    n40["media"]
    n41["mentions"]
    n42["moderation"]
    n43["notes"]
    n44["notifications"]
    n45["profile"]
    n46["projects"]
    n47["reactions"]
    n48["removals"]
    n49["reports"]
    n50["search"]
    n51["security"]
    n52["suggestions"]
    n53["suspension"]
    n54["tools"]
  end
  subgraph paquets["packages (partagés)"]
    n56["contrats"]
    n57["base de données"]
    n58["traductions"]
    n59["marque"]
  end
  n0 --> n1
  n0 --> n2
  n0 --> n3
  n0 --> n4
  n0 --> n5
  n0 --> n6
  n0 --> n19
  n0 --> n28
  n0 --> n58
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
  n1 --> n26
  n1 --> n28
  n1 --> n56
  n1 --> n58
  n1 --> n59
  n2 --> n19
  n2 --> n28
  n2 --> n56
  n2 --> n58
  n2 --> n59
  n3 --> n1
  n3 --> n2
  n3 --> n8
  n3 --> n20
  n3 --> n26
  n3 --> n28
  n3 --> n56
  n3 --> n59
  n4 --> n2
  n4 --> n5
  n4 --> n6
  n4 --> n16
  n4 --> n18
  n4 --> n19
  n5 --> n6
  n5 --> n28
  n6 --> n5
  n6 --> n28
  n6 --> n56
  n6 --> n59
  n7 --> n2
  n7 --> n4
  n7 --> n5
  n7 --> n11
  n7 --> n18
  n7 --> n56
  n8 --> n5
  n8 --> n56
  n8 --> n58
  n9 --> n5
  n9 --> n20
  n9 --> n56
  n10 --> n5
  n10 --> n28
  n10 --> n56
  n11 --> n2
  n11 --> n4
  n11 --> n5
  n11 --> n16
  n11 --> n17
  n11 --> n20
  n11 --> n24
  n11 --> n56
  n12 --> n5
  n12 --> n11
  n12 --> n20
  n14 --> n5
  n14 --> n56
  n15 --> n5
  n15 --> n56
  n16 --> n5
  n16 --> n6
  n16 --> n8
  n16 --> n19
  n16 --> n26
  n16 --> n56
  n17 --> n2
  n17 --> n5
  n17 --> n11
  n17 --> n20
  n17 --> n28
  n17 --> n56
  n18 --> n2
  n18 --> n5
  n18 --> n56
  n19 --> n5
  n19 --> n6
  n19 --> n13
  n19 --> n56
  n20 --> n2
  n20 --> n4
  n20 --> n5
  n20 --> n8
  n20 --> n11
  n20 --> n12
  n20 --> n13
  n20 --> n14
  n20 --> n16
  n20 --> n28
  n20 --> n56
  n21 --> n5
  n21 --> n20
  n22 --> n5
  n22 --> n56
  n23 --> n5
  n23 --> n56
  n24 --> n2
  n24 --> n5
  n24 --> n12
  n24 --> n16
  n24 --> n56
  n25 --> n5
  n25 --> n20
  n26 --> n5
  n26 --> n56
  n27 --> n5
  n27 --> n11
  n27 --> n20
  n27 --> n56
  n28 --> n58
  n29 --> n30
  n29 --> n31
  n29 --> n32
  n29 --> n33
  n29 --> n34
  n29 --> n35
  n29 --> n36
  n29 --> n37
  n29 --> n38
  n29 --> n40
  n29 --> n41
  n29 --> n42
  n29 --> n43
  n29 --> n44
  n29 --> n45
  n29 --> n46
  n29 --> n47
  n29 --> n49
  n29 --> n50
  n29 --> n51
  n29 --> n52
  n29 --> n53
  n29 --> n54
  n29 --> n55
  n29 --> n56
  n29 --> n57
  n29 --> n59
  n30 --> n34
  n30 --> n35
  n30 --> n38
  n30 --> n42
  n30 --> n46
  n30 --> n49
  n30 --> n53
  n30 --> n54
  n30 --> n55
  n30 --> n56
  n30 --> n57
  n30 --> n58
  n30 --> n59
  n31 --> n38
  n31 --> n45
  n31 --> n56
  n31 --> n57
  n32 --> n31
  n32 --> n46
  n32 --> n54
  n32 --> n55
  n32 --> n56
  n32 --> n57
  n33 --> n46
  n33 --> n57
  n34 --> n31
  n34 --> n41
  n34 --> n45
  n34 --> n46
  n34 --> n48
  n34 --> n55
  n34 --> n56
  n34 --> n57
  n35 --> n44
  n35 --> n56
  n35 --> n57
  n35 --> n58
  n35 --> n59
  n36 --> n37
  n36 --> n43
  n36 --> n46
  n36 --> n55
  n36 --> n56
  n36 --> n57
  n37 --> n46
  n37 --> n57
  n38 --> n44
  n38 --> n55
  n38 --> n56
  n38 --> n57
  n38 --> n58
  n39 --> n30
  n39 --> n35
  n39 --> n38
  n39 --> n44
  n39 --> n49
  n39 --> n53
  n39 --> n54
  n39 --> n55
  n39 --> n56
  n39 --> n57
  n41 --> n31
  n41 --> n34
  n41 --> n45
  n41 --> n50
  n41 --> n56
  n41 --> n57
  n42 --> n35
  n42 --> n49
  n42 --> n53
  n42 --> n55
  n42 --> n56
  n42 --> n57
  n43 --> n48
  n43 --> n56
  n43 --> n57
  n44 --> n31
  n44 --> n45
  n44 --> n46
  n44 --> n48
  n44 --> n53
  n44 --> n56
  n44 --> n57
  n45 --> n38
  n45 --> n53
  n45 --> n56
  n45 --> n57
  n45 --> n58
  n46 --> n31
  n46 --> n34
  n46 --> n37
  n46 --> n43
  n46 --> n45
  n46 --> n47
  n46 --> n48
  n46 --> n56
  n46 --> n57
  n47 --> n46
  n47 --> n56
  n47 --> n57
  n48 --> n56
  n48 --> n57
  n49 --> n31
  n49 --> n34
  n49 --> n38
  n49 --> n39
  n49 --> n42
  n49 --> n44
  n49 --> n45
  n49 --> n46
  n49 --> n53
  n49 --> n55
  n49 --> n56
  n49 --> n57
  n50 --> n31
  n50 --> n37
  n50 --> n45
  n50 --> n46
  n50 --> n56
  n50 --> n57
  n51 --> n55
  n52 --> n31
  n52 --> n38
  n52 --> n46
  n52 --> n55
  n52 --> n56
  n52 --> n57
  n53 --> n44
  n53 --> n55
  n53 --> n56
  n53 --> n57
  n54 --> n46
  n54 --> n55
  n54 --> n56
  n54 --> n57
  n55 --> n29
  n55 --> n30
  n55 --> n35
  n55 --> n38
  n55 --> n39
  n55 --> n40
  n55 --> n51
  n55 --> n53
  n55 --> n56
  n55 --> n57
  n55 --> n58
  n55 --> n59
  n56 --> n58
  n58 --> n59
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
