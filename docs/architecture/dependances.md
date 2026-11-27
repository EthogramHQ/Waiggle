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
    n35["réglages"]
  end
  subgraph appliDomaines["apps/app : domaines"]
    n6["accounts"]
    n7["blocks"]
    n8["categories"]
    n9["comments"]
    n10["email"]
    n11["feed"]
    n12["follows"]
    n13["gamification"]
    n14["hives"]
    n15["legal"]
    n16["live"]
    n17["media"]
    n18["members"]
    n19["mentions"]
    n20["moderation"]
    n21["notifications"]
    n22["profile"]
    n23["projects"]
    n24["public"]
    n25["reactions"]
    n26["reports"]
    n27["rules"]
    n28["scout"]
    n29["search"]
    n30["showcase"]
    n31["suggestions"]
    n32["testers"]
    n33["tools"]
    n34["updates"]
  end
  subgraph api["apps/api (serveur)"]
    n36["routes"]
    n73["socle"]
  end
  subgraph apiDomaines["apps/api : domaines"]
    n37["account"]
    n38["accounts"]
    n39["auth"]
    n40["blocks"]
    n41["catalogue"]
    n42["categories"]
    n43["comments"]
    n44["email"]
    n45["feed"]
    n46["follows"]
    n47["game"]
    n48["handles"]
    n49["hives"]
    n50["jobs"]
    n51["live"]
    n52["media"]
    n53["mentions"]
    n54["moderation"]
    n55["notifications"]
    n56["profile"]
    n57["projects"]
    n58["public"]
    n59["reactions"]
    n60["removals"]
    n61["reports"]
    n62["rules"]
    n63["scouts"]
    n64["search"]
    n65["security"]
    n66["seo"]
    n67["showcase"]
    n68["suggestions"]
    n69["suspension"]
    n70["testers"]
    n71["tools"]
    n72["updates"]
  end
  subgraph paquets["packages (partagés)"]
    n74["contrats"]
    n75["base de données"]
    n76["traductions"]
    n77["marque"]
  end
  n0 --> n1
  n0 --> n2
  n0 --> n3
  n0 --> n4
  n0 --> n5
  n0 --> n6
  n0 --> n13
  n0 --> n16
  n0 --> n20
  n0 --> n22
  n0 --> n27
  n0 --> n28
  n0 --> n35
  n0 --> n74
  n0 --> n76
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
  n1 --> n28
  n1 --> n29
  n1 --> n30
  n1 --> n32
  n1 --> n33
  n1 --> n34
  n1 --> n35
  n1 --> n74
  n1 --> n76
  n1 --> n77
  n2 --> n22
  n2 --> n35
  n2 --> n74
  n2 --> n76
  n2 --> n77
  n3 --> n1
  n3 --> n2
  n3 --> n8
  n3 --> n20
  n3 --> n23
  n3 --> n33
  n3 --> n34
  n3 --> n35
  n3 --> n74
  n3 --> n77
  n4 --> n1
  n4 --> n2
  n4 --> n5
  n4 --> n6
  n4 --> n20
  n4 --> n21
  n4 --> n22
  n4 --> n28
  n4 --> n35
  n4 --> n76
  n5 --> n6
  n5 --> n35
  n5 --> n74
  n6 --> n1
  n6 --> n5
  n6 --> n32
  n6 --> n35
  n6 --> n74
  n6 --> n77
  n7 --> n2
  n7 --> n4
  n7 --> n5
  n7 --> n11
  n7 --> n21
  n7 --> n74
  n8 --> n5
  n8 --> n74
  n8 --> n76
  n9 --> n2
  n9 --> n5
  n9 --> n13
  n9 --> n23
  n9 --> n74
  n10 --> n5
  n10 --> n35
  n10 --> n74
  n11 --> n2
  n11 --> n4
  n11 --> n5
  n11 --> n13
  n11 --> n14
  n11 --> n16
  n11 --> n20
  n11 --> n23
  n11 --> n31
  n11 --> n74
  n12 --> n5
  n12 --> n11
  n12 --> n13
  n12 --> n23
  n13 --> n2
  n13 --> n5
  n13 --> n8
  n13 --> n23
  n13 --> n74
  n13 --> n77
  n14 --> n2
  n14 --> n4
  n14 --> n5
  n14 --> n11
  n14 --> n13
  n14 --> n22
  n14 --> n31
  n14 --> n74
  n15 --> n74
  n15 --> n77
  n16 --> n2
  n16 --> n5
  n16 --> n6
  n16 --> n9
  n16 --> n11
  n16 --> n13
  n16 --> n14
  n16 --> n20
  n16 --> n21
  n16 --> n23
  n16 --> n28
  n16 --> n32
  n16 --> n34
  n16 --> n35
  n16 --> n74
  n18 --> n5
  n18 --> n23
  n18 --> n74
  n19 --> n5
  n19 --> n74
  n20 --> n2
  n20 --> n4
  n20 --> n5
  n20 --> n6
  n20 --> n8
  n20 --> n18
  n20 --> n22
  n20 --> n23
  n20 --> n33
  n20 --> n35
  n20 --> n74
  n21 --> n2
  n21 --> n5
  n21 --> n13
  n21 --> n16
  n21 --> n74
  n22 --> n2
  n22 --> n4
  n22 --> n5
  n22 --> n6
  n22 --> n17
  n22 --> n74
  n22 --> n76
  n23 --> n1
  n23 --> n2
  n23 --> n4
  n23 --> n5
  n23 --> n6
  n23 --> n8
  n23 --> n11
  n23 --> n12
  n23 --> n13
  n23 --> n17
  n23 --> n18
  n23 --> n20
  n23 --> n32
  n23 --> n34
  n23 --> n35
  n23 --> n74
  n23 --> n76
  n24 --> n5
  n24 --> n74
  n24 --> n76
  n25 --> n5
  n25 --> n13
  n25 --> n23
  n26 --> n5
  n26 --> n74
  n27 --> n1
  n27 --> n2
  n27 --> n5
  n27 --> n6
  n27 --> n22
  n27 --> n35
  n27 --> n74
  n27 --> n76
  n28 --> n2
  n28 --> n4
  n28 --> n5
  n28 --> n6
  n28 --> n13
  n28 --> n17
  n28 --> n20
  n28 --> n22
  n28 --> n35
  n28 --> n74
  n28 --> n76
  n29 --> n5
  n29 --> n74
  n30 --> n5
  n30 --> n21
  n30 --> n74
  n31 --> n2
  n31 --> n5
  n31 --> n12
  n31 --> n20
  n31 --> n74
  n32 --> n2
  n32 --> n4
  n32 --> n5
  n32 --> n13
  n32 --> n17
  n32 --> n21
  n32 --> n23
  n32 --> n74
  n33 --> n5
  n33 --> n74
  n34 --> n5
  n34 --> n11
  n34 --> n23
  n34 --> n74
  n35 --> n74
  n35 --> n76
  n36 --> n38
  n36 --> n39
  n36 --> n40
  n36 --> n41
  n36 --> n42
  n36 --> n43
  n36 --> n44
  n36 --> n45
  n36 --> n46
  n36 --> n47
  n36 --> n48
  n36 --> n49
  n36 --> n51
  n36 --> n52
  n36 --> n53
  n36 --> n54
  n36 --> n55
  n36 --> n56
  n36 --> n57
  n36 --> n58
  n36 --> n59
  n36 --> n60
  n36 --> n61
  n36 --> n62
  n36 --> n63
  n36 --> n64
  n36 --> n65
  n36 --> n66
  n36 --> n67
  n36 --> n68
  n36 --> n69
  n36 --> n70
  n36 --> n71
  n36 --> n72
  n36 --> n73
  n36 --> n74
  n36 --> n75
  n36 --> n76
  n36 --> n77
  n37 --> n39
  n37 --> n43
  n37 --> n49
  n37 --> n54
  n37 --> n57
  n37 --> n61
  n37 --> n69
  n37 --> n71
  n37 --> n73
  n37 --> n75
  n38 --> n75
  n39 --> n37
  n39 --> n44
  n39 --> n48
  n39 --> n62
  n39 --> n63
  n39 --> n73
  n39 --> n74
  n39 --> n75
  n39 --> n76
  n39 --> n77
  n40 --> n48
  n40 --> n56
  n40 --> n73
  n40 --> n74
  n40 --> n75
  n41 --> n40
  n41 --> n57
  n41 --> n71
  n41 --> n73
  n41 --> n74
  n41 --> n75
  n42 --> n57
  n42 --> n75
  n43 --> n40
  n43 --> n53
  n43 --> n56
  n43 --> n57
  n43 --> n60
  n43 --> n73
  n43 --> n74
  n43 --> n75
  n44 --> n52
  n44 --> n74
  n44 --> n75
  n44 --> n76
  n44 --> n77
  n45 --> n46
  n45 --> n49
  n45 --> n57
  n45 --> n72
  n45 --> n73
  n45 --> n74
  n45 --> n75
  n46 --> n57
  n46 --> n75
  n47 --> n38
  n47 --> n40
  n47 --> n49
  n47 --> n56
  n47 --> n57
  n47 --> n69
  n47 --> n74
  n47 --> n75
  n48 --> n55
  n48 --> n73
  n48 --> n74
  n48 --> n75
  n48 --> n76
  n49 --> n40
  n49 --> n47
  n49 --> n48
  n49 --> n56
  n49 --> n57
  n49 --> n64
  n49 --> n72
  n49 --> n73
  n49 --> n74
  n49 --> n75
  n50 --> n37
  n50 --> n38
  n50 --> n39
  n50 --> n40
  n50 --> n44
  n50 --> n47
  n50 --> n48
  n50 --> n49
  n50 --> n55
  n50 --> n57
  n50 --> n61
  n50 --> n63
  n50 --> n69
  n50 --> n71
  n50 --> n72
  n50 --> n73
  n50 --> n74
  n50 --> n75
  n51 --> n40
  n51 --> n57
  n51 --> n61
  n51 --> n70
  n51 --> n73
  n51 --> n74
  n51 --> n75
  n53 --> n40
  n53 --> n43
  n53 --> n56
  n53 --> n64
  n53 --> n74
  n53 --> n75
  n54 --> n44
  n54 --> n47
  n54 --> n48
  n54 --> n51
  n54 --> n56
  n54 --> n57
  n54 --> n61
  n54 --> n69
  n54 --> n71
  n54 --> n73
  n54 --> n74
  n54 --> n75
  n54 --> n76
  n55 --> n40
  n55 --> n49
  n55 --> n56
  n55 --> n57
  n55 --> n60
  n55 --> n61
  n55 --> n69
  n55 --> n70
  n55 --> n72
  n55 --> n73
  n55 --> n74
  n55 --> n75
  n56 --> n38
  n56 --> n48
  n56 --> n62
  n56 --> n63
  n56 --> n69
  n56 --> n74
  n56 --> n75
  n56 --> n76
  n57 --> n38
  n57 --> n40
  n57 --> n43
  n57 --> n46
  n57 --> n47
  n57 --> n56
  n57 --> n59
  n57 --> n60
  n57 --> n72
  n57 --> n74
  n57 --> n75
  n58 --> n38
  n58 --> n40
  n58 --> n46
  n58 --> n56
  n58 --> n57
  n58 --> n59
  n58 --> n72
  n58 --> n74
  n58 --> n75
  n59 --> n57
  n59 --> n74
  n59 --> n75
  n60 --> n56
  n60 --> n74
  n60 --> n75
  n61 --> n40
  n61 --> n43
  n61 --> n44
  n61 --> n47
  n61 --> n48
  n61 --> n49
  n61 --> n50
  n61 --> n51
  n61 --> n54
  n61 --> n55
  n61 --> n56
  n61 --> n57
  n61 --> n67
  n61 --> n69
  n61 --> n70
  n61 --> n72
  n61 --> n73
  n61 --> n74
  n61 --> n75
  n62 --> n69
  n62 --> n73
  n62 --> n74
  n62 --> n75
  n63 --> n47
  n63 --> n48
  n63 --> n55
  n63 --> n56
  n63 --> n73
  n63 --> n74
  n63 --> n75
  n64 --> n40
  n64 --> n46
  n64 --> n56
  n64 --> n57
  n64 --> n73
  n64 --> n74
  n64 --> n75
  n65 --> n73
  n66 --> n38
  n66 --> n57
  n66 --> n58
  n66 --> n74
  n66 --> n75
  n66 --> n76
  n66 --> n77
  n67 --> n57
  n67 --> n58
  n67 --> n74
  n67 --> n75
  n68 --> n38
  n68 --> n40
  n68 --> n48
  n68 --> n57
  n68 --> n73
  n68 --> n74
  n68 --> n75
  n69 --> n55
  n69 --> n73
  n69 --> n74
  n69 --> n75
  n70 --> n40
  n70 --> n43
  n70 --> n48
  n70 --> n56
  n70 --> n57
  n70 --> n60
  n70 --> n69
  n70 --> n73
  n70 --> n74
  n70 --> n75
  n71 --> n57
  n71 --> n73
  n71 --> n74
  n71 --> n75
  n72 --> n57
  n72 --> n60
  n72 --> n74
  n72 --> n75
  n73 --> n36
  n73 --> n37
  n73 --> n39
  n73 --> n44
  n73 --> n48
  n73 --> n50
  n73 --> n51
  n73 --> n52
  n73 --> n62
  n73 --> n65
  n73 --> n69
  n73 --> n74
  n73 --> n75
  n73 --> n76
  n73 --> n77
  n74 --> n76
  n76 --> n77
```

## Les règles vérifiées

- L'appli n'importe jamais le code de l'API ni la base de données (secrets, accès direct).
- L'API n'importe jamais le code de l'appli.
- Un paquet partagé (packages/) n'importe jamais une application.
- Les contrats, partagés avec l'appli, n'importent jamais la base de données.
- Un composant (src/ui) ne connaît ni les écrans, ni les appels à l’API, ni la navigation.
- Le code de production n’importe jamais les outils de test.
- Le client de l’API (src/api) ne connaît pas la récolte : il rend le pollen, le hook du geste le montre.
- Le magasin du pollen (gamification/pollen.ts), importé par chaque domaine de geste, n’importe aucun fichier de l’appli.

Exceptions acceptées :

- `apps/app/src/ui/LanguageSwitcher.tsx -> apps/app/src/profile/useChooseLanguage.ts`
