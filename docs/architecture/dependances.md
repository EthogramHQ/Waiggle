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
    n33["réglages"]
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
    n27["search"]
    n28["showcase"]
    n29["suggestions"]
    n30["testers"]
    n31["tools"]
    n32["updates"]
  end
  subgraph api["apps/api (serveur)"]
    n34["routes"]
    n70["socle"]
  end
  subgraph apiDomaines["apps/api : domaines"]
    n35["account"]
    n36["accounts"]
    n37["auth"]
    n38["blocks"]
    n39["catalogue"]
    n40["categories"]
    n41["comments"]
    n42["email"]
    n43["feed"]
    n44["follows"]
    n45["game"]
    n46["handles"]
    n47["hives"]
    n48["jobs"]
    n49["media"]
    n50["mentions"]
    n51["moderation"]
    n52["notifications"]
    n53["profile"]
    n54["projects"]
    n55["public"]
    n56["reactions"]
    n57["removals"]
    n58["reports"]
    n59["rules"]
    n60["scouts"]
    n61["search"]
    n62["security"]
    n63["seo"]
    n64["showcase"]
    n65["suggestions"]
    n66["suspension"]
    n67["testers"]
    n68["tools"]
    n69["updates"]
  end
  subgraph paquets["packages (partagés)"]
    n71["contrats"]
    n72["base de données"]
    n73["traductions"]
    n74["marque"]
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
  n0 --> n33
  n0 --> n71
  n0 --> n73
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
  n1 --> n30
  n1 --> n31
  n1 --> n32
  n1 --> n33
  n1 --> n71
  n1 --> n73
  n1 --> n74
  n2 --> n21
  n2 --> n33
  n2 --> n71
  n2 --> n73
  n2 --> n74
  n3 --> n1
  n3 --> n2
  n3 --> n8
  n3 --> n22
  n3 --> n31
  n3 --> n32
  n3 --> n33
  n3 --> n71
  n3 --> n74
  n4 --> n1
  n4 --> n2
  n4 --> n5
  n4 --> n6
  n4 --> n19
  n4 --> n20
  n4 --> n21
  n4 --> n33
  n4 --> n73
  n5 --> n6
  n5 --> n33
  n5 --> n71
  n6 --> n1
  n6 --> n5
  n6 --> n30
  n6 --> n33
  n6 --> n71
  n6 --> n74
  n7 --> n2
  n7 --> n4
  n7 --> n5
  n7 --> n11
  n7 --> n20
  n7 --> n71
  n8 --> n5
  n8 --> n71
  n8 --> n73
  n9 --> n2
  n9 --> n5
  n9 --> n13
  n9 --> n22
  n9 --> n71
  n10 --> n5
  n10 --> n33
  n10 --> n71
  n11 --> n2
  n11 --> n4
  n11 --> n5
  n11 --> n13
  n11 --> n14
  n11 --> n19
  n11 --> n22
  n11 --> n29
  n11 --> n71
  n12 --> n5
  n12 --> n11
  n12 --> n13
  n12 --> n22
  n13 --> n2
  n13 --> n5
  n13 --> n8
  n13 --> n22
  n13 --> n71
  n13 --> n74
  n14 --> n2
  n14 --> n4
  n14 --> n5
  n14 --> n11
  n14 --> n13
  n14 --> n21
  n14 --> n29
  n14 --> n71
  n15 --> n71
  n15 --> n74
  n17 --> n5
  n17 --> n22
  n17 --> n71
  n18 --> n5
  n18 --> n71
  n19 --> n2
  n19 --> n4
  n19 --> n5
  n19 --> n6
  n19 --> n8
  n19 --> n17
  n19 --> n21
  n19 --> n22
  n19 --> n31
  n19 --> n33
  n19 --> n71
  n20 --> n2
  n20 --> n5
  n20 --> n13
  n20 --> n71
  n21 --> n2
  n21 --> n4
  n21 --> n5
  n21 --> n6
  n21 --> n16
  n21 --> n71
  n21 --> n73
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
  n22 --> n30
  n22 --> n32
  n22 --> n33
  n22 --> n71
  n22 --> n73
  n23 --> n5
  n23 --> n71
  n23 --> n73
  n24 --> n5
  n24 --> n13
  n24 --> n22
  n25 --> n5
  n25 --> n71
  n26 --> n1
  n26 --> n2
  n26 --> n5
  n26 --> n6
  n26 --> n21
  n26 --> n33
  n26 --> n71
  n26 --> n73
  n27 --> n5
  n27 --> n71
  n28 --> n5
  n28 --> n20
  n28 --> n71
  n29 --> n2
  n29 --> n5
  n29 --> n12
  n29 --> n19
  n29 --> n71
  n30 --> n2
  n30 --> n4
  n30 --> n5
  n30 --> n13
  n30 --> n16
  n30 --> n20
  n30 --> n22
  n30 --> n71
  n31 --> n5
  n31 --> n71
  n32 --> n5
  n32 --> n11
  n32 --> n22
  n32 --> n71
  n33 --> n71
  n33 --> n73
  n34 --> n36
  n34 --> n37
  n34 --> n38
  n34 --> n39
  n34 --> n40
  n34 --> n41
  n34 --> n42
  n34 --> n43
  n34 --> n44
  n34 --> n45
  n34 --> n46
  n34 --> n47
  n34 --> n49
  n34 --> n50
  n34 --> n51
  n34 --> n52
  n34 --> n53
  n34 --> n54
  n34 --> n55
  n34 --> n56
  n34 --> n57
  n34 --> n58
  n34 --> n59
  n34 --> n60
  n34 --> n61
  n34 --> n62
  n34 --> n63
  n34 --> n64
  n34 --> n65
  n34 --> n66
  n34 --> n67
  n34 --> n68
  n34 --> n69
  n34 --> n70
  n34 --> n71
  n34 --> n72
  n34 --> n73
  n34 --> n74
  n35 --> n37
  n35 --> n41
  n35 --> n47
  n35 --> n51
  n35 --> n54
  n35 --> n58
  n35 --> n66
  n35 --> n68
  n35 --> n70
  n35 --> n72
  n36 --> n72
  n37 --> n35
  n37 --> n42
  n37 --> n46
  n37 --> n59
  n37 --> n60
  n37 --> n70
  n37 --> n71
  n37 --> n72
  n37 --> n73
  n37 --> n74
  n38 --> n46
  n38 --> n53
  n38 --> n70
  n38 --> n71
  n38 --> n72
  n39 --> n38
  n39 --> n54
  n39 --> n68
  n39 --> n70
  n39 --> n71
  n39 --> n72
  n40 --> n54
  n40 --> n72
  n41 --> n38
  n41 --> n50
  n41 --> n53
  n41 --> n54
  n41 --> n57
  n41 --> n70
  n41 --> n71
  n41 --> n72
  n42 --> n49
  n42 --> n71
  n42 --> n72
  n42 --> n73
  n42 --> n74
  n43 --> n44
  n43 --> n47
  n43 --> n54
  n43 --> n69
  n43 --> n70
  n43 --> n71
  n43 --> n72
  n44 --> n54
  n44 --> n72
  n45 --> n36
  n45 --> n38
  n45 --> n47
  n45 --> n53
  n45 --> n54
  n45 --> n66
  n45 --> n71
  n45 --> n72
  n46 --> n52
  n46 --> n70
  n46 --> n71
  n46 --> n72
  n46 --> n73
  n47 --> n38
  n47 --> n45
  n47 --> n46
  n47 --> n53
  n47 --> n54
  n47 --> n61
  n47 --> n69
  n47 --> n70
  n47 --> n71
  n47 --> n72
  n48 --> n35
  n48 --> n36
  n48 --> n37
  n48 --> n38
  n48 --> n42
  n48 --> n45
  n48 --> n46
  n48 --> n47
  n48 --> n52
  n48 --> n54
  n48 --> n58
  n48 --> n66
  n48 --> n68
  n48 --> n69
  n48 --> n70
  n48 --> n71
  n48 --> n72
  n50 --> n38
  n50 --> n41
  n50 --> n53
  n50 --> n61
  n50 --> n71
  n50 --> n72
  n51 --> n42
  n51 --> n45
  n51 --> n46
  n51 --> n53
  n51 --> n54
  n51 --> n58
  n51 --> n66
  n51 --> n68
  n51 --> n70
  n51 --> n71
  n51 --> n72
  n51 --> n73
  n52 --> n38
  n52 --> n47
  n52 --> n53
  n52 --> n54
  n52 --> n57
  n52 --> n58
  n52 --> n66
  n52 --> n67
  n52 --> n69
  n52 --> n70
  n52 --> n71
  n52 --> n72
  n53 --> n36
  n53 --> n46
  n53 --> n59
  n53 --> n66
  n53 --> n71
  n53 --> n72
  n53 --> n73
  n54 --> n36
  n54 --> n38
  n54 --> n41
  n54 --> n44
  n54 --> n45
  n54 --> n53
  n54 --> n56
  n54 --> n57
  n54 --> n69
  n54 --> n71
  n54 --> n72
  n55 --> n36
  n55 --> n38
  n55 --> n44
  n55 --> n53
  n55 --> n54
  n55 --> n56
  n55 --> n69
  n55 --> n71
  n55 --> n72
  n56 --> n54
  n56 --> n71
  n56 --> n72
  n57 --> n53
  n57 --> n71
  n57 --> n72
  n58 --> n38
  n58 --> n41
  n58 --> n42
  n58 --> n45
  n58 --> n46
  n58 --> n47
  n58 --> n48
  n58 --> n51
  n58 --> n52
  n58 --> n53
  n58 --> n54
  n58 --> n64
  n58 --> n66
  n58 --> n67
  n58 --> n69
  n58 --> n70
  n58 --> n71
  n58 --> n72
  n59 --> n66
  n59 --> n70
  n59 --> n71
  n59 --> n72
  n60 --> n45
  n60 --> n71
  n60 --> n72
  n61 --> n38
  n61 --> n44
  n61 --> n53
  n61 --> n54
  n61 --> n70
  n61 --> n71
  n61 --> n72
  n62 --> n70
  n63 --> n36
  n63 --> n54
  n63 --> n55
  n63 --> n71
  n63 --> n72
  n63 --> n73
  n63 --> n74
  n64 --> n54
  n64 --> n55
  n64 --> n71
  n64 --> n72
  n65 --> n36
  n65 --> n38
  n65 --> n46
  n65 --> n54
  n65 --> n70
  n65 --> n71
  n65 --> n72
  n66 --> n52
  n66 --> n70
  n66 --> n71
  n66 --> n72
  n67 --> n38
  n67 --> n41
  n67 --> n46
  n67 --> n53
  n67 --> n54
  n67 --> n57
  n67 --> n66
  n67 --> n70
  n67 --> n71
  n67 --> n72
  n68 --> n54
  n68 --> n70
  n68 --> n71
  n68 --> n72
  n69 --> n54
  n69 --> n57
  n69 --> n71
  n69 --> n72
  n70 --> n34
  n70 --> n35
  n70 --> n37
  n70 --> n42
  n70 --> n46
  n70 --> n48
  n70 --> n49
  n70 --> n59
  n70 --> n62
  n70 --> n66
  n70 --> n71
  n70 --> n72
  n70 --> n73
  n70 --> n74
  n71 --> n73
  n73 --> n74
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
