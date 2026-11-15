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
    n30["réglages"]
  end
  subgraph appliDomaines["apps/app : domaines"]
    n6["accounts"]
    n7["blocks"]
    n8["categories"]
    n9["comments"]
    n10["email"]
    n11["feed"]
    n12["follows"]
    n13["hives"]
    n14["legal"]
    n15["media"]
    n16["members"]
    n17["mentions"]
    n18["moderation"]
    n19["notifications"]
    n20["profile"]
    n21["projects"]
    n22["reactions"]
    n23["reports"]
    n24["rules"]
    n25["search"]
    n26["suggestions"]
    n27["testers"]
    n28["tools"]
    n29["updates"]
  end
  subgraph api["apps/api (serveur)"]
    n31["routes"]
    n60["socle"]
  end
  subgraph apiDomaines["apps/api : domaines"]
    n32["auth"]
    n33["blocks"]
    n34["catalogue"]
    n35["categories"]
    n36["comments"]
    n37["email"]
    n38["feed"]
    n39["follows"]
    n40["handles"]
    n41["hives"]
    n42["jobs"]
    n43["media"]
    n44["mentions"]
    n45["moderation"]
    n46["notifications"]
    n47["profile"]
    n48["projects"]
    n49["reactions"]
    n50["removals"]
    n51["reports"]
    n52["rules"]
    n53["search"]
    n54["security"]
    n55["suggestions"]
    n56["suspension"]
    n57["testers"]
    n58["tools"]
    n59["updates"]
  end
  subgraph paquets["packages (partagés)"]
    n61["contrats"]
    n62["base de données"]
    n63["traductions"]
    n64["marque"]
  end
  n0 --> n1
  n0 --> n2
  n0 --> n3
  n0 --> n4
  n0 --> n5
  n0 --> n6
  n0 --> n18
  n0 --> n20
  n0 --> n24
  n0 --> n30
  n0 --> n61
  n0 --> n63
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
  n1 --> n23
  n1 --> n24
  n1 --> n25
  n1 --> n27
  n1 --> n28
  n1 --> n29
  n1 --> n30
  n1 --> n61
  n1 --> n63
  n1 --> n64
  n2 --> n20
  n2 --> n30
  n2 --> n61
  n2 --> n63
  n2 --> n64
  n3 --> n1
  n3 --> n2
  n3 --> n8
  n3 --> n21
  n3 --> n28
  n3 --> n29
  n3 --> n30
  n3 --> n61
  n3 --> n64
  n4 --> n2
  n4 --> n5
  n4 --> n6
  n4 --> n18
  n4 --> n19
  n4 --> n20
  n5 --> n6
  n5 --> n30
  n6 --> n5
  n6 --> n27
  n6 --> n30
  n6 --> n61
  n6 --> n64
  n7 --> n2
  n7 --> n4
  n7 --> n5
  n7 --> n11
  n7 --> n19
  n7 --> n61
  n8 --> n5
  n8 --> n61
  n8 --> n63
  n9 --> n5
  n9 --> n21
  n9 --> n61
  n10 --> n5
  n10 --> n30
  n10 --> n61
  n11 --> n2
  n11 --> n4
  n11 --> n5
  n11 --> n13
  n11 --> n18
  n11 --> n21
  n11 --> n26
  n11 --> n61
  n12 --> n5
  n12 --> n11
  n12 --> n21
  n13 --> n2
  n13 --> n4
  n13 --> n5
  n13 --> n11
  n13 --> n20
  n13 --> n26
  n13 --> n61
  n14 --> n61
  n14 --> n64
  n16 --> n5
  n16 --> n61
  n17 --> n5
  n17 --> n61
  n18 --> n2
  n18 --> n4
  n18 --> n5
  n18 --> n6
  n18 --> n8
  n18 --> n16
  n18 --> n20
  n18 --> n21
  n18 --> n28
  n18 --> n30
  n18 --> n61
  n19 --> n2
  n19 --> n5
  n19 --> n61
  n20 --> n2
  n20 --> n4
  n20 --> n5
  n20 --> n6
  n20 --> n15
  n20 --> n61
  n21 --> n1
  n21 --> n2
  n21 --> n4
  n21 --> n5
  n21 --> n8
  n21 --> n11
  n21 --> n12
  n21 --> n15
  n21 --> n16
  n21 --> n18
  n21 --> n27
  n21 --> n29
  n21 --> n30
  n21 --> n61
  n22 --> n5
  n22 --> n21
  n23 --> n5
  n23 --> n61
  n24 --> n1
  n24 --> n2
  n24 --> n5
  n24 --> n6
  n24 --> n20
  n24 --> n61
  n25 --> n5
  n25 --> n61
  n26 --> n2
  n26 --> n5
  n26 --> n12
  n26 --> n18
  n26 --> n61
  n27 --> n2
  n27 --> n4
  n27 --> n5
  n27 --> n15
  n27 --> n19
  n27 --> n21
  n27 --> n61
  n28 --> n5
  n28 --> n61
  n29 --> n5
  n29 --> n11
  n29 --> n21
  n29 --> n61
  n30 --> n63
  n31 --> n32
  n31 --> n33
  n31 --> n34
  n31 --> n35
  n31 --> n36
  n31 --> n37
  n31 --> n38
  n31 --> n39
  n31 --> n40
  n31 --> n41
  n31 --> n43
  n31 --> n44
  n31 --> n45
  n31 --> n46
  n31 --> n47
  n31 --> n48
  n31 --> n49
  n31 --> n50
  n31 --> n51
  n31 --> n52
  n31 --> n53
  n31 --> n54
  n31 --> n55
  n31 --> n56
  n31 --> n57
  n31 --> n58
  n31 --> n59
  n31 --> n60
  n31 --> n61
  n31 --> n62
  n31 --> n64
  n32 --> n36
  n32 --> n37
  n32 --> n40
  n32 --> n41
  n32 --> n45
  n32 --> n48
  n32 --> n51
  n32 --> n52
  n32 --> n56
  n32 --> n58
  n32 --> n60
  n32 --> n61
  n32 --> n62
  n32 --> n63
  n32 --> n64
  n33 --> n40
  n33 --> n47
  n33 --> n61
  n33 --> n62
  n34 --> n33
  n34 --> n48
  n34 --> n58
  n34 --> n60
  n34 --> n61
  n34 --> n62
  n35 --> n48
  n35 --> n62
  n36 --> n33
  n36 --> n44
  n36 --> n47
  n36 --> n48
  n36 --> n50
  n36 --> n60
  n36 --> n61
  n36 --> n62
  n37 --> n43
  n37 --> n61
  n37 --> n62
  n37 --> n63
  n37 --> n64
  n38 --> n39
  n38 --> n41
  n38 --> n48
  n38 --> n59
  n38 --> n60
  n38 --> n61
  n38 --> n62
  n39 --> n48
  n39 --> n62
  n40 --> n46
  n40 --> n60
  n40 --> n61
  n40 --> n62
  n40 --> n63
  n41 --> n33
  n41 --> n40
  n41 --> n47
  n41 --> n48
  n41 --> n53
  n41 --> n59
  n41 --> n60
  n41 --> n61
  n41 --> n62
  n42 --> n32
  n42 --> n33
  n42 --> n37
  n42 --> n40
  n42 --> n41
  n42 --> n46
  n42 --> n48
  n42 --> n51
  n42 --> n56
  n42 --> n58
  n42 --> n59
  n42 --> n60
  n42 --> n61
  n42 --> n62
  n44 --> n33
  n44 --> n36
  n44 --> n47
  n44 --> n53
  n44 --> n61
  n44 --> n62
  n45 --> n37
  n45 --> n40
  n45 --> n47
  n45 --> n48
  n45 --> n51
  n45 --> n56
  n45 --> n58
  n45 --> n60
  n45 --> n61
  n45 --> n62
  n45 --> n63
  n46 --> n33
  n46 --> n41
  n46 --> n47
  n46 --> n48
  n46 --> n50
  n46 --> n51
  n46 --> n56
  n46 --> n57
  n46 --> n59
  n46 --> n61
  n46 --> n62
  n47 --> n40
  n47 --> n52
  n47 --> n56
  n47 --> n61
  n47 --> n62
  n47 --> n63
  n48 --> n33
  n48 --> n36
  n48 --> n39
  n48 --> n47
  n48 --> n49
  n48 --> n50
  n48 --> n59
  n48 --> n61
  n48 --> n62
  n49 --> n48
  n49 --> n61
  n49 --> n62
  n50 --> n47
  n50 --> n61
  n50 --> n62
  n51 --> n33
  n51 --> n36
  n51 --> n40
  n51 --> n41
  n51 --> n42
  n51 --> n45
  n51 --> n46
  n51 --> n47
  n51 --> n48
  n51 --> n56
  n51 --> n57
  n51 --> n59
  n51 --> n60
  n51 --> n61
  n51 --> n62
  n52 --> n56
  n52 --> n60
  n52 --> n61
  n52 --> n62
  n53 --> n33
  n53 --> n39
  n53 --> n47
  n53 --> n48
  n53 --> n60
  n53 --> n61
  n53 --> n62
  n54 --> n60
  n55 --> n33
  n55 --> n40
  n55 --> n48
  n55 --> n60
  n55 --> n61
  n55 --> n62
  n56 --> n46
  n56 --> n60
  n56 --> n61
  n56 --> n62
  n57 --> n33
  n57 --> n36
  n57 --> n40
  n57 --> n47
  n57 --> n48
  n57 --> n50
  n57 --> n56
  n57 --> n60
  n57 --> n61
  n57 --> n62
  n58 --> n48
  n58 --> n60
  n58 --> n61
  n58 --> n62
  n59 --> n48
  n59 --> n50
  n59 --> n61
  n59 --> n62
  n60 --> n31
  n60 --> n32
  n60 --> n37
  n60 --> n40
  n60 --> n42
  n60 --> n43
  n60 --> n52
  n60 --> n54
  n60 --> n56
  n60 --> n61
  n60 --> n62
  n60 --> n63
  n60 --> n64
  n61 --> n63
  n63 --> n64
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
