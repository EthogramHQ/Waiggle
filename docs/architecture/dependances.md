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
    n32["réglages"]
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
    n22["public"]
    n23["reactions"]
    n24["reports"]
    n25["rules"]
    n26["search"]
    n27["showcase"]
    n28["suggestions"]
    n29["testers"]
    n30["tools"]
    n31["updates"]
  end
  subgraph api["apps/api (serveur)"]
    n33["routes"]
    n67["socle"]
  end
  subgraph apiDomaines["apps/api : domaines"]
    n34["account"]
    n35["accounts"]
    n36["auth"]
    n37["blocks"]
    n38["catalogue"]
    n39["categories"]
    n40["comments"]
    n41["email"]
    n42["feed"]
    n43["follows"]
    n44["handles"]
    n45["hives"]
    n46["jobs"]
    n47["media"]
    n48["mentions"]
    n49["moderation"]
    n50["notifications"]
    n51["profile"]
    n52["projects"]
    n53["public"]
    n54["reactions"]
    n55["removals"]
    n56["reports"]
    n57["rules"]
    n58["search"]
    n59["security"]
    n60["seo"]
    n61["showcase"]
    n62["suggestions"]
    n63["suspension"]
    n64["testers"]
    n65["tools"]
    n66["updates"]
  end
  subgraph paquets["packages (partagés)"]
    n68["contrats"]
    n69["base de données"]
    n70["traductions"]
    n71["marque"]
  end
  n0 --> n1
  n0 --> n2
  n0 --> n3
  n0 --> n4
  n0 --> n5
  n0 --> n6
  n0 --> n18
  n0 --> n20
  n0 --> n25
  n0 --> n32
  n0 --> n68
  n0 --> n70
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
  n1 --> n26
  n1 --> n27
  n1 --> n29
  n1 --> n30
  n1 --> n31
  n1 --> n32
  n1 --> n68
  n1 --> n70
  n1 --> n71
  n2 --> n20
  n2 --> n32
  n2 --> n68
  n2 --> n70
  n2 --> n71
  n3 --> n1
  n3 --> n2
  n3 --> n8
  n3 --> n21
  n3 --> n30
  n3 --> n31
  n3 --> n32
  n3 --> n68
  n3 --> n71
  n4 --> n1
  n4 --> n2
  n4 --> n5
  n4 --> n6
  n4 --> n18
  n4 --> n19
  n4 --> n20
  n4 --> n32
  n4 --> n70
  n5 --> n6
  n5 --> n32
  n6 --> n1
  n6 --> n5
  n6 --> n29
  n6 --> n32
  n6 --> n68
  n6 --> n71
  n7 --> n2
  n7 --> n4
  n7 --> n5
  n7 --> n11
  n7 --> n19
  n7 --> n68
  n8 --> n5
  n8 --> n68
  n8 --> n70
  n9 --> n2
  n9 --> n5
  n9 --> n21
  n9 --> n68
  n10 --> n5
  n10 --> n32
  n10 --> n68
  n11 --> n2
  n11 --> n4
  n11 --> n5
  n11 --> n13
  n11 --> n18
  n11 --> n21
  n11 --> n28
  n11 --> n68
  n12 --> n5
  n12 --> n11
  n12 --> n21
  n13 --> n2
  n13 --> n4
  n13 --> n5
  n13 --> n11
  n13 --> n20
  n13 --> n28
  n13 --> n68
  n14 --> n68
  n14 --> n71
  n16 --> n5
  n16 --> n21
  n16 --> n68
  n17 --> n5
  n17 --> n68
  n18 --> n2
  n18 --> n4
  n18 --> n5
  n18 --> n6
  n18 --> n8
  n18 --> n16
  n18 --> n20
  n18 --> n21
  n18 --> n30
  n18 --> n32
  n18 --> n68
  n19 --> n2
  n19 --> n5
  n19 --> n68
  n20 --> n2
  n20 --> n4
  n20 --> n5
  n20 --> n6
  n20 --> n15
  n20 --> n68
  n20 --> n70
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
  n21 --> n29
  n21 --> n31
  n21 --> n32
  n21 --> n68
  n21 --> n70
  n22 --> n5
  n22 --> n68
  n22 --> n70
  n23 --> n5
  n23 --> n21
  n24 --> n5
  n24 --> n68
  n25 --> n1
  n25 --> n2
  n25 --> n5
  n25 --> n6
  n25 --> n20
  n25 --> n32
  n25 --> n68
  n25 --> n70
  n26 --> n5
  n26 --> n68
  n27 --> n5
  n27 --> n19
  n27 --> n68
  n28 --> n2
  n28 --> n5
  n28 --> n12
  n28 --> n18
  n28 --> n68
  n29 --> n2
  n29 --> n4
  n29 --> n5
  n29 --> n15
  n29 --> n19
  n29 --> n21
  n29 --> n68
  n30 --> n5
  n30 --> n68
  n31 --> n5
  n31 --> n11
  n31 --> n21
  n31 --> n68
  n32 --> n68
  n32 --> n70
  n33 --> n35
  n33 --> n36
  n33 --> n37
  n33 --> n38
  n33 --> n39
  n33 --> n40
  n33 --> n41
  n33 --> n42
  n33 --> n43
  n33 --> n44
  n33 --> n45
  n33 --> n47
  n33 --> n48
  n33 --> n49
  n33 --> n50
  n33 --> n51
  n33 --> n52
  n33 --> n53
  n33 --> n54
  n33 --> n55
  n33 --> n56
  n33 --> n57
  n33 --> n58
  n33 --> n59
  n33 --> n60
  n33 --> n61
  n33 --> n62
  n33 --> n63
  n33 --> n64
  n33 --> n65
  n33 --> n66
  n33 --> n67
  n33 --> n68
  n33 --> n69
  n33 --> n71
  n34 --> n36
  n34 --> n40
  n34 --> n45
  n34 --> n49
  n34 --> n52
  n34 --> n56
  n34 --> n63
  n34 --> n65
  n34 --> n67
  n34 --> n69
  n35 --> n69
  n36 --> n34
  n36 --> n41
  n36 --> n44
  n36 --> n57
  n36 --> n67
  n36 --> n68
  n36 --> n69
  n36 --> n70
  n36 --> n71
  n37 --> n44
  n37 --> n51
  n37 --> n67
  n37 --> n68
  n37 --> n69
  n38 --> n37
  n38 --> n52
  n38 --> n65
  n38 --> n67
  n38 --> n68
  n38 --> n69
  n39 --> n52
  n39 --> n69
  n40 --> n37
  n40 --> n48
  n40 --> n51
  n40 --> n52
  n40 --> n55
  n40 --> n67
  n40 --> n68
  n40 --> n69
  n41 --> n47
  n41 --> n68
  n41 --> n69
  n41 --> n70
  n41 --> n71
  n42 --> n43
  n42 --> n45
  n42 --> n52
  n42 --> n66
  n42 --> n67
  n42 --> n68
  n42 --> n69
  n43 --> n52
  n43 --> n69
  n44 --> n50
  n44 --> n67
  n44 --> n68
  n44 --> n69
  n44 --> n70
  n45 --> n37
  n45 --> n44
  n45 --> n51
  n45 --> n52
  n45 --> n58
  n45 --> n66
  n45 --> n67
  n45 --> n68
  n45 --> n69
  n46 --> n34
  n46 --> n35
  n46 --> n36
  n46 --> n37
  n46 --> n41
  n46 --> n44
  n46 --> n45
  n46 --> n50
  n46 --> n52
  n46 --> n56
  n46 --> n63
  n46 --> n65
  n46 --> n66
  n46 --> n67
  n46 --> n68
  n46 --> n69
  n48 --> n37
  n48 --> n40
  n48 --> n51
  n48 --> n58
  n48 --> n68
  n48 --> n69
  n49 --> n41
  n49 --> n44
  n49 --> n51
  n49 --> n52
  n49 --> n56
  n49 --> n63
  n49 --> n65
  n49 --> n67
  n49 --> n68
  n49 --> n69
  n49 --> n70
  n50 --> n37
  n50 --> n45
  n50 --> n51
  n50 --> n52
  n50 --> n55
  n50 --> n56
  n50 --> n63
  n50 --> n64
  n50 --> n66
  n50 --> n67
  n50 --> n68
  n50 --> n69
  n51 --> n35
  n51 --> n44
  n51 --> n57
  n51 --> n63
  n51 --> n68
  n51 --> n69
  n51 --> n70
  n52 --> n35
  n52 --> n37
  n52 --> n40
  n52 --> n43
  n52 --> n51
  n52 --> n54
  n52 --> n55
  n52 --> n66
  n52 --> n68
  n52 --> n69
  n53 --> n35
  n53 --> n37
  n53 --> n43
  n53 --> n51
  n53 --> n52
  n53 --> n54
  n53 --> n66
  n53 --> n68
  n53 --> n69
  n54 --> n52
  n54 --> n68
  n54 --> n69
  n55 --> n51
  n55 --> n68
  n55 --> n69
  n56 --> n37
  n56 --> n40
  n56 --> n41
  n56 --> n44
  n56 --> n45
  n56 --> n46
  n56 --> n49
  n56 --> n50
  n56 --> n51
  n56 --> n52
  n56 --> n61
  n56 --> n63
  n56 --> n64
  n56 --> n66
  n56 --> n67
  n56 --> n68
  n56 --> n69
  n57 --> n63
  n57 --> n67
  n57 --> n68
  n57 --> n69
  n58 --> n37
  n58 --> n43
  n58 --> n51
  n58 --> n52
  n58 --> n67
  n58 --> n68
  n58 --> n69
  n59 --> n67
  n60 --> n35
  n60 --> n52
  n60 --> n53
  n60 --> n68
  n60 --> n69
  n60 --> n70
  n60 --> n71
  n61 --> n52
  n61 --> n53
  n61 --> n68
  n61 --> n69
  n62 --> n35
  n62 --> n37
  n62 --> n44
  n62 --> n52
  n62 --> n67
  n62 --> n68
  n62 --> n69
  n63 --> n50
  n63 --> n67
  n63 --> n68
  n63 --> n69
  n64 --> n37
  n64 --> n40
  n64 --> n44
  n64 --> n51
  n64 --> n52
  n64 --> n55
  n64 --> n63
  n64 --> n67
  n64 --> n68
  n64 --> n69
  n65 --> n52
  n65 --> n67
  n65 --> n68
  n65 --> n69
  n66 --> n52
  n66 --> n55
  n66 --> n68
  n66 --> n69
  n67 --> n33
  n67 --> n34
  n67 --> n36
  n67 --> n41
  n67 --> n44
  n67 --> n46
  n67 --> n47
  n67 --> n57
  n67 --> n59
  n67 --> n63
  n67 --> n68
  n67 --> n69
  n67 --> n70
  n67 --> n71
  n68 --> n70
  n70 --> n71
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
