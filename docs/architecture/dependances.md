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
    n72["socle"]
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
    n51["media"]
    n52["mentions"]
    n53["moderation"]
    n54["notifications"]
    n55["profile"]
    n56["projects"]
    n57["public"]
    n58["reactions"]
    n59["removals"]
    n60["reports"]
    n61["rules"]
    n62["scouts"]
    n63["search"]
    n64["security"]
    n65["seo"]
    n66["showcase"]
    n67["suggestions"]
    n68["suspension"]
    n69["testers"]
    n70["tools"]
    n71["updates"]
  end
  subgraph paquets["packages (partagés)"]
    n73["contrats"]
    n74["base de données"]
    n75["traductions"]
    n76["marque"]
  end
  n0 --> n1
  n0 --> n2
  n0 --> n3
  n0 --> n4
  n0 --> n5
  n0 --> n6
  n0 --> n13
  n0 --> n20
  n0 --> n22
  n0 --> n27
  n0 --> n28
  n0 --> n35
  n0 --> n73
  n0 --> n75
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
  n1 --> n73
  n1 --> n75
  n1 --> n76
  n2 --> n22
  n2 --> n35
  n2 --> n73
  n2 --> n75
  n2 --> n76
  n3 --> n1
  n3 --> n2
  n3 --> n8
  n3 --> n20
  n3 --> n23
  n3 --> n33
  n3 --> n34
  n3 --> n35
  n3 --> n73
  n3 --> n76
  n4 --> n1
  n4 --> n2
  n4 --> n5
  n4 --> n6
  n4 --> n20
  n4 --> n21
  n4 --> n22
  n4 --> n28
  n4 --> n35
  n4 --> n75
  n5 --> n6
  n5 --> n35
  n5 --> n73
  n6 --> n1
  n6 --> n5
  n6 --> n32
  n6 --> n35
  n6 --> n73
  n6 --> n76
  n7 --> n2
  n7 --> n4
  n7 --> n5
  n7 --> n11
  n7 --> n21
  n7 --> n73
  n8 --> n5
  n8 --> n73
  n8 --> n75
  n9 --> n2
  n9 --> n5
  n9 --> n13
  n9 --> n23
  n9 --> n73
  n10 --> n5
  n10 --> n35
  n10 --> n73
  n11 --> n2
  n11 --> n4
  n11 --> n5
  n11 --> n13
  n11 --> n14
  n11 --> n20
  n11 --> n23
  n11 --> n31
  n11 --> n73
  n12 --> n5
  n12 --> n11
  n12 --> n13
  n12 --> n23
  n13 --> n2
  n13 --> n5
  n13 --> n8
  n13 --> n23
  n13 --> n73
  n13 --> n76
  n14 --> n2
  n14 --> n4
  n14 --> n5
  n14 --> n11
  n14 --> n13
  n14 --> n22
  n14 --> n31
  n14 --> n73
  n15 --> n73
  n15 --> n76
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
  n16 --> n73
  n18 --> n5
  n18 --> n23
  n18 --> n73
  n19 --> n5
  n19 --> n73
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
  n20 --> n73
  n21 --> n2
  n21 --> n5
  n21 --> n13
  n21 --> n73
  n22 --> n2
  n22 --> n4
  n22 --> n5
  n22 --> n6
  n22 --> n17
  n22 --> n73
  n22 --> n75
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
  n23 --> n73
  n23 --> n75
  n24 --> n5
  n24 --> n73
  n24 --> n75
  n25 --> n5
  n25 --> n13
  n25 --> n23
  n26 --> n5
  n26 --> n73
  n27 --> n1
  n27 --> n2
  n27 --> n5
  n27 --> n6
  n27 --> n22
  n27 --> n35
  n27 --> n73
  n27 --> n75
  n28 --> n2
  n28 --> n4
  n28 --> n5
  n28 --> n6
  n28 --> n13
  n28 --> n17
  n28 --> n20
  n28 --> n22
  n28 --> n35
  n28 --> n73
  n28 --> n75
  n29 --> n5
  n29 --> n73
  n30 --> n5
  n30 --> n21
  n30 --> n73
  n31 --> n2
  n31 --> n5
  n31 --> n12
  n31 --> n20
  n31 --> n73
  n32 --> n2
  n32 --> n4
  n32 --> n5
  n32 --> n13
  n32 --> n17
  n32 --> n21
  n32 --> n23
  n32 --> n73
  n33 --> n5
  n33 --> n73
  n34 --> n5
  n34 --> n11
  n34 --> n23
  n34 --> n73
  n35 --> n73
  n35 --> n75
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
  n37 --> n39
  n37 --> n43
  n37 --> n49
  n37 --> n53
  n37 --> n56
  n37 --> n60
  n37 --> n68
  n37 --> n70
  n37 --> n72
  n37 --> n74
  n38 --> n74
  n39 --> n37
  n39 --> n44
  n39 --> n48
  n39 --> n61
  n39 --> n62
  n39 --> n72
  n39 --> n73
  n39 --> n74
  n39 --> n75
  n39 --> n76
  n40 --> n48
  n40 --> n55
  n40 --> n72
  n40 --> n73
  n40 --> n74
  n41 --> n40
  n41 --> n56
  n41 --> n70
  n41 --> n72
  n41 --> n73
  n41 --> n74
  n42 --> n56
  n42 --> n74
  n43 --> n40
  n43 --> n52
  n43 --> n55
  n43 --> n56
  n43 --> n59
  n43 --> n72
  n43 --> n73
  n43 --> n74
  n44 --> n51
  n44 --> n73
  n44 --> n74
  n44 --> n75
  n44 --> n76
  n45 --> n46
  n45 --> n49
  n45 --> n56
  n45 --> n71
  n45 --> n72
  n45 --> n73
  n45 --> n74
  n46 --> n56
  n46 --> n74
  n47 --> n38
  n47 --> n40
  n47 --> n49
  n47 --> n55
  n47 --> n56
  n47 --> n68
  n47 --> n73
  n47 --> n74
  n48 --> n54
  n48 --> n72
  n48 --> n73
  n48 --> n74
  n48 --> n75
  n49 --> n40
  n49 --> n47
  n49 --> n48
  n49 --> n55
  n49 --> n56
  n49 --> n63
  n49 --> n71
  n49 --> n72
  n49 --> n73
  n49 --> n74
  n50 --> n37
  n50 --> n38
  n50 --> n39
  n50 --> n40
  n50 --> n44
  n50 --> n47
  n50 --> n48
  n50 --> n49
  n50 --> n54
  n50 --> n56
  n50 --> n60
  n50 --> n62
  n50 --> n68
  n50 --> n70
  n50 --> n71
  n50 --> n72
  n50 --> n73
  n50 --> n74
  n52 --> n40
  n52 --> n43
  n52 --> n55
  n52 --> n63
  n52 --> n73
  n52 --> n74
  n53 --> n44
  n53 --> n47
  n53 --> n48
  n53 --> n55
  n53 --> n56
  n53 --> n60
  n53 --> n68
  n53 --> n70
  n53 --> n72
  n53 --> n73
  n53 --> n74
  n53 --> n75
  n54 --> n40
  n54 --> n49
  n54 --> n55
  n54 --> n56
  n54 --> n59
  n54 --> n60
  n54 --> n68
  n54 --> n69
  n54 --> n71
  n54 --> n72
  n54 --> n73
  n54 --> n74
  n55 --> n38
  n55 --> n48
  n55 --> n61
  n55 --> n62
  n55 --> n68
  n55 --> n73
  n55 --> n74
  n55 --> n75
  n56 --> n38
  n56 --> n40
  n56 --> n43
  n56 --> n46
  n56 --> n47
  n56 --> n55
  n56 --> n58
  n56 --> n59
  n56 --> n71
  n56 --> n73
  n56 --> n74
  n57 --> n38
  n57 --> n40
  n57 --> n46
  n57 --> n55
  n57 --> n56
  n57 --> n58
  n57 --> n71
  n57 --> n73
  n57 --> n74
  n58 --> n56
  n58 --> n73
  n58 --> n74
  n59 --> n55
  n59 --> n73
  n59 --> n74
  n60 --> n40
  n60 --> n43
  n60 --> n44
  n60 --> n47
  n60 --> n48
  n60 --> n49
  n60 --> n50
  n60 --> n53
  n60 --> n54
  n60 --> n55
  n60 --> n56
  n60 --> n66
  n60 --> n68
  n60 --> n69
  n60 --> n71
  n60 --> n72
  n60 --> n73
  n60 --> n74
  n61 --> n68
  n61 --> n72
  n61 --> n73
  n61 --> n74
  n62 --> n47
  n62 --> n48
  n62 --> n54
  n62 --> n55
  n62 --> n72
  n62 --> n73
  n62 --> n74
  n63 --> n40
  n63 --> n46
  n63 --> n55
  n63 --> n56
  n63 --> n72
  n63 --> n73
  n63 --> n74
  n64 --> n72
  n65 --> n38
  n65 --> n56
  n65 --> n57
  n65 --> n73
  n65 --> n74
  n65 --> n75
  n65 --> n76
  n66 --> n56
  n66 --> n57
  n66 --> n73
  n66 --> n74
  n67 --> n38
  n67 --> n40
  n67 --> n48
  n67 --> n56
  n67 --> n72
  n67 --> n73
  n67 --> n74
  n68 --> n54
  n68 --> n72
  n68 --> n73
  n68 --> n74
  n69 --> n40
  n69 --> n43
  n69 --> n48
  n69 --> n55
  n69 --> n56
  n69 --> n59
  n69 --> n68
  n69 --> n72
  n69 --> n73
  n69 --> n74
  n70 --> n56
  n70 --> n72
  n70 --> n73
  n70 --> n74
  n71 --> n56
  n71 --> n59
  n71 --> n73
  n71 --> n74
  n72 --> n36
  n72 --> n37
  n72 --> n39
  n72 --> n44
  n72 --> n48
  n72 --> n50
  n72 --> n51
  n72 --> n61
  n72 --> n64
  n72 --> n68
  n72 --> n73
  n72 --> n74
  n72 --> n75
  n72 --> n76
  n73 --> n75
  n75 --> n76
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
