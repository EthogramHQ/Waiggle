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
    n66["socle"]
  end
  subgraph apiDomaines["apps/api : domaines"]
    n34["account"]
    n35["auth"]
    n36["blocks"]
    n37["catalogue"]
    n38["categories"]
    n39["comments"]
    n40["email"]
    n41["feed"]
    n42["follows"]
    n43["handles"]
    n44["hives"]
    n45["jobs"]
    n46["media"]
    n47["mentions"]
    n48["moderation"]
    n49["notifications"]
    n50["profile"]
    n51["projects"]
    n52["public"]
    n53["reactions"]
    n54["removals"]
    n55["reports"]
    n56["rules"]
    n57["search"]
    n58["security"]
    n59["seo"]
    n60["showcase"]
    n61["suggestions"]
    n62["suspension"]
    n63["testers"]
    n64["tools"]
    n65["updates"]
  end
  subgraph paquets["packages (partagés)"]
    n67["contrats"]
    n68["base de données"]
    n69["traductions"]
    n70["marque"]
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
  n0 --> n67
  n0 --> n69
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
  n1 --> n67
  n1 --> n69
  n1 --> n70
  n2 --> n4
  n2 --> n20
  n2 --> n32
  n2 --> n67
  n2 --> n69
  n2 --> n70
  n3 --> n1
  n3 --> n2
  n3 --> n8
  n3 --> n21
  n3 --> n30
  n3 --> n31
  n3 --> n32
  n3 --> n67
  n3 --> n70
  n4 --> n1
  n4 --> n2
  n4 --> n5
  n4 --> n6
  n4 --> n18
  n4 --> n19
  n4 --> n20
  n4 --> n32
  n4 --> n67
  n4 --> n69
  n5 --> n6
  n5 --> n32
  n6 --> n5
  n6 --> n29
  n6 --> n32
  n6 --> n67
  n6 --> n70
  n7 --> n2
  n7 --> n4
  n7 --> n5
  n7 --> n11
  n7 --> n19
  n7 --> n67
  n8 --> n5
  n8 --> n67
  n8 --> n69
  n9 --> n2
  n9 --> n5
  n9 --> n21
  n9 --> n67
  n10 --> n5
  n10 --> n32
  n10 --> n67
  n11 --> n2
  n11 --> n4
  n11 --> n5
  n11 --> n13
  n11 --> n18
  n11 --> n21
  n11 --> n28
  n11 --> n67
  n12 --> n5
  n12 --> n11
  n12 --> n21
  n13 --> n2
  n13 --> n4
  n13 --> n5
  n13 --> n11
  n13 --> n20
  n13 --> n28
  n13 --> n67
  n14 --> n67
  n14 --> n70
  n16 --> n5
  n16 --> n67
  n17 --> n5
  n17 --> n67
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
  n18 --> n67
  n19 --> n2
  n19 --> n5
  n19 --> n67
  n20 --> n2
  n20 --> n4
  n20 --> n5
  n20 --> n6
  n20 --> n15
  n20 --> n67
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
  n21 --> n67
  n22 --> n5
  n22 --> n67
  n22 --> n69
  n23 --> n5
  n23 --> n21
  n24 --> n5
  n24 --> n67
  n25 --> n1
  n25 --> n2
  n25 --> n4
  n25 --> n5
  n25 --> n6
  n25 --> n20
  n25 --> n67
  n25 --> n69
  n26 --> n5
  n26 --> n67
  n27 --> n5
  n27 --> n19
  n27 --> n67
  n28 --> n2
  n28 --> n5
  n28 --> n12
  n28 --> n18
  n28 --> n67
  n29 --> n2
  n29 --> n4
  n29 --> n5
  n29 --> n15
  n29 --> n19
  n29 --> n21
  n29 --> n67
  n30 --> n5
  n30 --> n67
  n31 --> n5
  n31 --> n11
  n31 --> n21
  n31 --> n67
  n32 --> n69
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
  n33 --> n46
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
  n33 --> n70
  n34 --> n35
  n34 --> n39
  n34 --> n44
  n34 --> n48
  n34 --> n51
  n34 --> n55
  n34 --> n62
  n34 --> n64
  n34 --> n66
  n34 --> n68
  n35 --> n34
  n35 --> n40
  n35 --> n43
  n35 --> n56
  n35 --> n66
  n35 --> n67
  n35 --> n68
  n35 --> n69
  n35 --> n70
  n36 --> n43
  n36 --> n50
  n36 --> n67
  n36 --> n68
  n37 --> n36
  n37 --> n51
  n37 --> n64
  n37 --> n66
  n37 --> n67
  n37 --> n68
  n38 --> n51
  n38 --> n68
  n39 --> n36
  n39 --> n47
  n39 --> n50
  n39 --> n51
  n39 --> n54
  n39 --> n66
  n39 --> n67
  n39 --> n68
  n40 --> n46
  n40 --> n67
  n40 --> n68
  n40 --> n69
  n40 --> n70
  n41 --> n42
  n41 --> n44
  n41 --> n51
  n41 --> n65
  n41 --> n66
  n41 --> n67
  n41 --> n68
  n42 --> n51
  n42 --> n68
  n43 --> n49
  n43 --> n66
  n43 --> n67
  n43 --> n68
  n43 --> n69
  n44 --> n36
  n44 --> n43
  n44 --> n50
  n44 --> n51
  n44 --> n57
  n44 --> n65
  n44 --> n66
  n44 --> n67
  n44 --> n68
  n45 --> n34
  n45 --> n35
  n45 --> n36
  n45 --> n40
  n45 --> n43
  n45 --> n44
  n45 --> n49
  n45 --> n51
  n45 --> n55
  n45 --> n62
  n45 --> n64
  n45 --> n65
  n45 --> n66
  n45 --> n67
  n45 --> n68
  n47 --> n36
  n47 --> n39
  n47 --> n50
  n47 --> n57
  n47 --> n67
  n47 --> n68
  n48 --> n40
  n48 --> n43
  n48 --> n50
  n48 --> n51
  n48 --> n55
  n48 --> n62
  n48 --> n64
  n48 --> n66
  n48 --> n67
  n48 --> n68
  n48 --> n69
  n49 --> n36
  n49 --> n44
  n49 --> n50
  n49 --> n51
  n49 --> n54
  n49 --> n55
  n49 --> n62
  n49 --> n63
  n49 --> n65
  n49 --> n67
  n49 --> n68
  n50 --> n43
  n50 --> n56
  n50 --> n62
  n50 --> n67
  n50 --> n68
  n50 --> n69
  n51 --> n36
  n51 --> n39
  n51 --> n42
  n51 --> n50
  n51 --> n53
  n51 --> n54
  n51 --> n65
  n51 --> n67
  n51 --> n68
  n52 --> n36
  n52 --> n42
  n52 --> n50
  n52 --> n51
  n52 --> n53
  n52 --> n65
  n52 --> n67
  n52 --> n68
  n53 --> n51
  n53 --> n67
  n53 --> n68
  n54 --> n50
  n54 --> n67
  n54 --> n68
  n55 --> n36
  n55 --> n39
  n55 --> n40
  n55 --> n43
  n55 --> n44
  n55 --> n45
  n55 --> n48
  n55 --> n49
  n55 --> n50
  n55 --> n51
  n55 --> n60
  n55 --> n62
  n55 --> n63
  n55 --> n65
  n55 --> n66
  n55 --> n67
  n55 --> n68
  n56 --> n62
  n56 --> n66
  n56 --> n67
  n56 --> n68
  n57 --> n36
  n57 --> n42
  n57 --> n50
  n57 --> n51
  n57 --> n66
  n57 --> n67
  n57 --> n68
  n58 --> n66
  n59 --> n51
  n59 --> n52
  n59 --> n67
  n59 --> n68
  n59 --> n69
  n59 --> n70
  n60 --> n51
  n60 --> n52
  n60 --> n67
  n60 --> n68
  n61 --> n36
  n61 --> n43
  n61 --> n51
  n61 --> n66
  n61 --> n67
  n61 --> n68
  n62 --> n49
  n62 --> n66
  n62 --> n67
  n62 --> n68
  n63 --> n36
  n63 --> n39
  n63 --> n43
  n63 --> n50
  n63 --> n51
  n63 --> n54
  n63 --> n62
  n63 --> n66
  n63 --> n67
  n63 --> n68
  n64 --> n51
  n64 --> n66
  n64 --> n67
  n64 --> n68
  n65 --> n51
  n65 --> n54
  n65 --> n67
  n65 --> n68
  n66 --> n33
  n66 --> n34
  n66 --> n35
  n66 --> n40
  n66 --> n43
  n66 --> n45
  n66 --> n46
  n66 --> n56
  n66 --> n58
  n66 --> n62
  n66 --> n67
  n66 --> n68
  n66 --> n69
  n66 --> n70
  n67 --> n69
  n69 --> n70
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
- `apps/app/src/ui/LegalLinks.tsx -> apps/app/src/navigation/publicPath.ts`
- `apps/app/src/ui/LanguageLink.tsx -> apps/app/src/navigation/publicPath.ts`
- `apps/app/src/ui/share.ts -> apps/app/src/navigation/publicPath.ts`
