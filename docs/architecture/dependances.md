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
    n34["réglages"]
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
    n16["media"]
    n17["members"]
    n18["mentions"]
    n19["moderation"]
    n20["notifications"]
    n21["profile"]
    n22["projects"]
    n23["public"]
    n24["reactions"]
    n25["reports"]
    n26["rules"]
    n27["scout"]
    n28["search"]
    n29["showcase"]
    n30["suggestions"]
    n31["testers"]
    n32["tools"]
    n33["updates"]
  end
  subgraph api["apps/api (serveur)"]
    n35["routes"]
    n71["socle"]
  end
  subgraph apiDomaines["apps/api : domaines"]
    n36["account"]
    n37["accounts"]
    n38["auth"]
    n39["blocks"]
    n40["catalogue"]
    n41["categories"]
    n42["comments"]
    n43["email"]
    n44["feed"]
    n45["follows"]
    n46["game"]
    n47["handles"]
    n48["hives"]
    n49["jobs"]
    n50["media"]
    n51["mentions"]
    n52["moderation"]
    n53["notifications"]
    n54["profile"]
    n55["projects"]
    n56["public"]
    n57["reactions"]
    n58["removals"]
    n59["reports"]
    n60["rules"]
    n61["scouts"]
    n62["search"]
    n63["security"]
    n64["seo"]
    n65["showcase"]
    n66["suggestions"]
    n67["suspension"]
    n68["testers"]
    n69["tools"]
    n70["updates"]
  end
  subgraph paquets["packages (partagés)"]
    n72["contrats"]
    n73["base de données"]
    n74["traductions"]
    n75["marque"]
  end
  n0 --> n1
  n0 --> n2
  n0 --> n3
  n0 --> n4
  n0 --> n5
  n0 --> n6
  n0 --> n13
  n0 --> n19
  n0 --> n21
  n0 --> n26
  n0 --> n27
  n0 --> n34
  n0 --> n72
  n0 --> n74
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
  n1 --> n31
  n1 --> n32
  n1 --> n33
  n1 --> n34
  n1 --> n72
  n1 --> n74
  n1 --> n75
  n2 --> n21
  n2 --> n34
  n2 --> n72
  n2 --> n74
  n2 --> n75
  n3 --> n1
  n3 --> n2
  n3 --> n8
  n3 --> n19
  n3 --> n22
  n3 --> n32
  n3 --> n33
  n3 --> n34
  n3 --> n72
  n3 --> n75
  n4 --> n1
  n4 --> n2
  n4 --> n5
  n4 --> n6
  n4 --> n19
  n4 --> n20
  n4 --> n21
  n4 --> n27
  n4 --> n34
  n4 --> n74
  n5 --> n6
  n5 --> n34
  n5 --> n72
  n6 --> n1
  n6 --> n5
  n6 --> n31
  n6 --> n34
  n6 --> n72
  n6 --> n75
  n7 --> n2
  n7 --> n4
  n7 --> n5
  n7 --> n11
  n7 --> n20
  n7 --> n72
  n8 --> n5
  n8 --> n72
  n8 --> n74
  n9 --> n2
  n9 --> n5
  n9 --> n13
  n9 --> n22
  n9 --> n72
  n10 --> n5
  n10 --> n34
  n10 --> n72
  n11 --> n2
  n11 --> n4
  n11 --> n5
  n11 --> n13
  n11 --> n14
  n11 --> n19
  n11 --> n22
  n11 --> n30
  n11 --> n72
  n12 --> n5
  n12 --> n11
  n12 --> n13
  n12 --> n22
  n13 --> n2
  n13 --> n5
  n13 --> n8
  n13 --> n22
  n13 --> n72
  n13 --> n75
  n14 --> n2
  n14 --> n4
  n14 --> n5
  n14 --> n11
  n14 --> n13
  n14 --> n21
  n14 --> n30
  n14 --> n72
  n15 --> n72
  n15 --> n75
  n17 --> n5
  n17 --> n22
  n17 --> n72
  n18 --> n5
  n18 --> n72
  n19 --> n2
  n19 --> n4
  n19 --> n5
  n19 --> n6
  n19 --> n8
  n19 --> n17
  n19 --> n21
  n19 --> n22
  n19 --> n32
  n19 --> n34
  n19 --> n72
  n20 --> n2
  n20 --> n5
  n20 --> n13
  n20 --> n72
  n21 --> n2
  n21 --> n4
  n21 --> n5
  n21 --> n6
  n21 --> n16
  n21 --> n72
  n21 --> n74
  n22 --> n1
  n22 --> n2
  n22 --> n4
  n22 --> n5
  n22 --> n6
  n22 --> n8
  n22 --> n11
  n22 --> n12
  n22 --> n13
  n22 --> n16
  n22 --> n17
  n22 --> n19
  n22 --> n31
  n22 --> n33
  n22 --> n34
  n22 --> n72
  n22 --> n74
  n23 --> n5
  n23 --> n72
  n23 --> n74
  n24 --> n5
  n24 --> n13
  n24 --> n22
  n25 --> n5
  n25 --> n72
  n26 --> n1
  n26 --> n2
  n26 --> n5
  n26 --> n6
  n26 --> n21
  n26 --> n34
  n26 --> n72
  n26 --> n74
  n27 --> n2
  n27 --> n4
  n27 --> n5
  n27 --> n6
  n27 --> n13
  n27 --> n16
  n27 --> n19
  n27 --> n21
  n27 --> n34
  n27 --> n72
  n27 --> n74
  n28 --> n5
  n28 --> n72
  n29 --> n5
  n29 --> n20
  n29 --> n72
  n30 --> n2
  n30 --> n5
  n30 --> n12
  n30 --> n19
  n30 --> n72
  n31 --> n2
  n31 --> n4
  n31 --> n5
  n31 --> n13
  n31 --> n16
  n31 --> n20
  n31 --> n22
  n31 --> n72
  n32 --> n5
  n32 --> n72
  n33 --> n5
  n33 --> n11
  n33 --> n22
  n33 --> n72
  n34 --> n72
  n34 --> n74
  n35 --> n37
  n35 --> n38
  n35 --> n39
  n35 --> n40
  n35 --> n41
  n35 --> n42
  n35 --> n43
  n35 --> n44
  n35 --> n45
  n35 --> n46
  n35 --> n47
  n35 --> n48
  n35 --> n50
  n35 --> n51
  n35 --> n52
  n35 --> n53
  n35 --> n54
  n35 --> n55
  n35 --> n56
  n35 --> n57
  n35 --> n58
  n35 --> n59
  n35 --> n60
  n35 --> n61
  n35 --> n62
  n35 --> n63
  n35 --> n64
  n35 --> n65
  n35 --> n66
  n35 --> n67
  n35 --> n68
  n35 --> n69
  n35 --> n70
  n35 --> n71
  n35 --> n72
  n35 --> n73
  n35 --> n74
  n35 --> n75
  n36 --> n38
  n36 --> n42
  n36 --> n48
  n36 --> n52
  n36 --> n55
  n36 --> n59
  n36 --> n67
  n36 --> n69
  n36 --> n71
  n36 --> n73
  n37 --> n73
  n38 --> n36
  n38 --> n43
  n38 --> n47
  n38 --> n60
  n38 --> n61
  n38 --> n71
  n38 --> n72
  n38 --> n73
  n38 --> n74
  n38 --> n75
  n39 --> n47
  n39 --> n54
  n39 --> n71
  n39 --> n72
  n39 --> n73
  n40 --> n39
  n40 --> n55
  n40 --> n69
  n40 --> n71
  n40 --> n72
  n40 --> n73
  n41 --> n55
  n41 --> n73
  n42 --> n39
  n42 --> n51
  n42 --> n54
  n42 --> n55
  n42 --> n58
  n42 --> n71
  n42 --> n72
  n42 --> n73
  n43 --> n50
  n43 --> n72
  n43 --> n73
  n43 --> n74
  n43 --> n75
  n44 --> n45
  n44 --> n48
  n44 --> n55
  n44 --> n70
  n44 --> n71
  n44 --> n72
  n44 --> n73
  n45 --> n55
  n45 --> n73
  n46 --> n37
  n46 --> n39
  n46 --> n48
  n46 --> n54
  n46 --> n55
  n46 --> n67
  n46 --> n72
  n46 --> n73
  n47 --> n53
  n47 --> n71
  n47 --> n72
  n47 --> n73
  n47 --> n74
  n48 --> n39
  n48 --> n46
  n48 --> n47
  n48 --> n54
  n48 --> n55
  n48 --> n62
  n48 --> n70
  n48 --> n71
  n48 --> n72
  n48 --> n73
  n49 --> n36
  n49 --> n37
  n49 --> n38
  n49 --> n39
  n49 --> n43
  n49 --> n46
  n49 --> n47
  n49 --> n48
  n49 --> n53
  n49 --> n55
  n49 --> n59
  n49 --> n61
  n49 --> n67
  n49 --> n69
  n49 --> n70
  n49 --> n71
  n49 --> n72
  n49 --> n73
  n51 --> n39
  n51 --> n42
  n51 --> n54
  n51 --> n62
  n51 --> n72
  n51 --> n73
  n52 --> n43
  n52 --> n46
  n52 --> n47
  n52 --> n54
  n52 --> n55
  n52 --> n59
  n52 --> n67
  n52 --> n69
  n52 --> n71
  n52 --> n72
  n52 --> n73
  n52 --> n74
  n53 --> n39
  n53 --> n48
  n53 --> n54
  n53 --> n55
  n53 --> n58
  n53 --> n59
  n53 --> n67
  n53 --> n68
  n53 --> n70
  n53 --> n71
  n53 --> n72
  n53 --> n73
  n54 --> n37
  n54 --> n47
  n54 --> n60
  n54 --> n61
  n54 --> n67
  n54 --> n72
  n54 --> n73
  n54 --> n74
  n55 --> n37
  n55 --> n39
  n55 --> n42
  n55 --> n45
  n55 --> n46
  n55 --> n54
  n55 --> n57
  n55 --> n58
  n55 --> n70
  n55 --> n72
  n55 --> n73
  n56 --> n37
  n56 --> n39
  n56 --> n45
  n56 --> n54
  n56 --> n55
  n56 --> n57
  n56 --> n70
  n56 --> n72
  n56 --> n73
  n57 --> n55
  n57 --> n72
  n57 --> n73
  n58 --> n54
  n58 --> n72
  n58 --> n73
  n59 --> n39
  n59 --> n42
  n59 --> n43
  n59 --> n46
  n59 --> n47
  n59 --> n48
  n59 --> n49
  n59 --> n52
  n59 --> n53
  n59 --> n54
  n59 --> n55
  n59 --> n65
  n59 --> n67
  n59 --> n68
  n59 --> n70
  n59 --> n71
  n59 --> n72
  n59 --> n73
  n60 --> n67
  n60 --> n71
  n60 --> n72
  n60 --> n73
  n61 --> n46
  n61 --> n47
  n61 --> n53
  n61 --> n54
  n61 --> n71
  n61 --> n72
  n61 --> n73
  n62 --> n39
  n62 --> n45
  n62 --> n54
  n62 --> n55
  n62 --> n71
  n62 --> n72
  n62 --> n73
  n63 --> n71
  n64 --> n37
  n64 --> n55
  n64 --> n56
  n64 --> n72
  n64 --> n73
  n64 --> n74
  n64 --> n75
  n65 --> n55
  n65 --> n56
  n65 --> n72
  n65 --> n73
  n66 --> n37
  n66 --> n39
  n66 --> n47
  n66 --> n55
  n66 --> n71
  n66 --> n72
  n66 --> n73
  n67 --> n53
  n67 --> n71
  n67 --> n72
  n67 --> n73
  n68 --> n39
  n68 --> n42
  n68 --> n47
  n68 --> n54
  n68 --> n55
  n68 --> n58
  n68 --> n67
  n68 --> n71
  n68 --> n72
  n68 --> n73
  n69 --> n55
  n69 --> n71
  n69 --> n72
  n69 --> n73
  n70 --> n55
  n70 --> n58
  n70 --> n72
  n70 --> n73
  n71 --> n35
  n71 --> n36
  n71 --> n38
  n71 --> n43
  n71 --> n47
  n71 --> n49
  n71 --> n50
  n71 --> n60
  n71 --> n63
  n71 --> n67
  n71 --> n72
  n71 --> n73
  n71 --> n74
  n71 --> n75
  n72 --> n74
  n74 --> n75
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
