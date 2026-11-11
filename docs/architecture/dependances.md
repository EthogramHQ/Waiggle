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
    n27["réglages"]
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
    n17["notifications"]
    n18["profile"]
    n19["projects"]
    n20["reactions"]
    n21["reports"]
    n22["search"]
    n23["suggestions"]
    n24["testers"]
    n25["tools"]
    n26["updates"]
  end
  subgraph api["apps/api (serveur)"]
    n28["routes"]
    n55["socle"]
  end
  subgraph apiDomaines["apps/api : domaines"]
    n29["auth"]
    n30["blocks"]
    n31["catalogue"]
    n32["categories"]
    n33["comments"]
    n34["email"]
    n35["feed"]
    n36["follows"]
    n37["handles"]
    n38["jobs"]
    n39["media"]
    n40["mentions"]
    n41["moderation"]
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
    n52["testers"]
    n53["tools"]
    n54["updates"]
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
  n0 --> n18
  n0 --> n27
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
  n1 --> n26
  n1 --> n27
  n1 --> n56
  n1 --> n58
  n1 --> n59
  n2 --> n18
  n2 --> n27
  n2 --> n56
  n2 --> n58
  n2 --> n59
  n3 --> n1
  n3 --> n2
  n3 --> n8
  n3 --> n19
  n3 --> n25
  n3 --> n26
  n3 --> n27
  n3 --> n56
  n3 --> n59
  n4 --> n2
  n4 --> n5
  n4 --> n6
  n4 --> n16
  n4 --> n17
  n4 --> n18
  n5 --> n6
  n5 --> n27
  n6 --> n5
  n6 --> n24
  n6 --> n27
  n6 --> n56
  n6 --> n59
  n7 --> n2
  n7 --> n4
  n7 --> n5
  n7 --> n11
  n7 --> n17
  n7 --> n56
  n8 --> n5
  n8 --> n56
  n8 --> n58
  n9 --> n5
  n9 --> n19
  n9 --> n56
  n10 --> n5
  n10 --> n27
  n10 --> n56
  n11 --> n2
  n11 --> n4
  n11 --> n5
  n11 --> n16
  n11 --> n19
  n11 --> n23
  n11 --> n56
  n12 --> n5
  n12 --> n11
  n12 --> n19
  n14 --> n5
  n14 --> n56
  n15 --> n5
  n15 --> n56
  n16 --> n5
  n16 --> n6
  n16 --> n8
  n16 --> n18
  n16 --> n25
  n16 --> n56
  n17 --> n2
  n17 --> n5
  n17 --> n56
  n18 --> n5
  n18 --> n6
  n18 --> n13
  n18 --> n56
  n19 --> n1
  n19 --> n2
  n19 --> n4
  n19 --> n5
  n19 --> n8
  n19 --> n11
  n19 --> n12
  n19 --> n13
  n19 --> n14
  n19 --> n16
  n19 --> n24
  n19 --> n26
  n19 --> n27
  n19 --> n56
  n20 --> n5
  n20 --> n19
  n21 --> n5
  n21 --> n56
  n22 --> n5
  n22 --> n56
  n23 --> n2
  n23 --> n5
  n23 --> n12
  n23 --> n16
  n23 --> n56
  n24 --> n2
  n24 --> n4
  n24 --> n5
  n24 --> n13
  n24 --> n17
  n24 --> n19
  n24 --> n56
  n25 --> n5
  n25 --> n56
  n26 --> n5
  n26 --> n11
  n26 --> n19
  n26 --> n56
  n27 --> n58
  n28 --> n29
  n28 --> n30
  n28 --> n31
  n28 --> n32
  n28 --> n33
  n28 --> n34
  n28 --> n35
  n28 --> n36
  n28 --> n37
  n28 --> n39
  n28 --> n40
  n28 --> n41
  n28 --> n42
  n28 --> n43
  n28 --> n44
  n28 --> n45
  n28 --> n46
  n28 --> n47
  n28 --> n48
  n28 --> n49
  n28 --> n50
  n28 --> n51
  n28 --> n52
  n28 --> n53
  n28 --> n54
  n28 --> n55
  n28 --> n56
  n28 --> n57
  n28 --> n59
  n29 --> n33
  n29 --> n34
  n29 --> n37
  n29 --> n41
  n29 --> n44
  n29 --> n47
  n29 --> n51
  n29 --> n53
  n29 --> n55
  n29 --> n56
  n29 --> n57
  n29 --> n58
  n29 --> n59
  n30 --> n37
  n30 --> n43
  n30 --> n56
  n30 --> n57
  n31 --> n30
  n31 --> n44
  n31 --> n53
  n31 --> n55
  n31 --> n56
  n31 --> n57
  n32 --> n44
  n32 --> n57
  n33 --> n30
  n33 --> n40
  n33 --> n43
  n33 --> n44
  n33 --> n46
  n33 --> n55
  n33 --> n56
  n33 --> n57
  n34 --> n42
  n34 --> n56
  n34 --> n57
  n34 --> n58
  n34 --> n59
  n35 --> n36
  n35 --> n44
  n35 --> n54
  n35 --> n55
  n35 --> n56
  n35 --> n57
  n36 --> n44
  n36 --> n57
  n37 --> n42
  n37 --> n55
  n37 --> n56
  n37 --> n57
  n37 --> n58
  n38 --> n29
  n38 --> n34
  n38 --> n37
  n38 --> n42
  n38 --> n47
  n38 --> n51
  n38 --> n53
  n38 --> n55
  n38 --> n56
  n38 --> n57
  n40 --> n30
  n40 --> n33
  n40 --> n43
  n40 --> n48
  n40 --> n56
  n40 --> n57
  n41 --> n34
  n41 --> n47
  n41 --> n51
  n41 --> n55
  n41 --> n56
  n41 --> n57
  n42 --> n30
  n42 --> n43
  n42 --> n44
  n42 --> n46
  n42 --> n51
  n42 --> n54
  n42 --> n56
  n42 --> n57
  n43 --> n37
  n43 --> n51
  n43 --> n56
  n43 --> n57
  n43 --> n58
  n44 --> n30
  n44 --> n33
  n44 --> n36
  n44 --> n43
  n44 --> n45
  n44 --> n46
  n44 --> n54
  n44 --> n56
  n44 --> n57
  n45 --> n44
  n45 --> n56
  n45 --> n57
  n46 --> n56
  n46 --> n57
  n47 --> n30
  n47 --> n33
  n47 --> n37
  n47 --> n38
  n47 --> n41
  n47 --> n42
  n47 --> n43
  n47 --> n44
  n47 --> n51
  n47 --> n54
  n47 --> n55
  n47 --> n56
  n47 --> n57
  n48 --> n30
  n48 --> n36
  n48 --> n43
  n48 --> n44
  n48 --> n56
  n48 --> n57
  n49 --> n55
  n50 --> n30
  n50 --> n37
  n50 --> n44
  n50 --> n55
  n50 --> n56
  n50 --> n57
  n51 --> n42
  n51 --> n55
  n51 --> n56
  n51 --> n57
  n52 --> n30
  n52 --> n43
  n52 --> n46
  n52 --> n51
  n52 --> n55
  n52 --> n56
  n52 --> n57
  n53 --> n44
  n53 --> n55
  n53 --> n56
  n53 --> n57
  n54 --> n44
  n54 --> n46
  n54 --> n56
  n54 --> n57
  n55 --> n28
  n55 --> n29
  n55 --> n34
  n55 --> n37
  n55 --> n38
  n55 --> n39
  n55 --> n49
  n55 --> n51
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
