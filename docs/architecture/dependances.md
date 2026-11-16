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
    n61["socle"]
  end
  subgraph apiDomaines["apps/api : domaines"]
    n32["account"]
    n33["auth"]
    n34["blocks"]
    n35["catalogue"]
    n36["categories"]
    n37["comments"]
    n38["email"]
    n39["feed"]
    n40["follows"]
    n41["handles"]
    n42["hives"]
    n43["jobs"]
    n44["media"]
    n45["mentions"]
    n46["moderation"]
    n47["notifications"]
    n48["profile"]
    n49["projects"]
    n50["reactions"]
    n51["removals"]
    n52["reports"]
    n53["rules"]
    n54["search"]
    n55["security"]
    n56["suggestions"]
    n57["suspension"]
    n58["testers"]
    n59["tools"]
    n60["updates"]
  end
  subgraph paquets["packages (partagés)"]
    n62["contrats"]
    n63["base de données"]
    n64["traductions"]
    n65["marque"]
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
  n0 --> n62
  n0 --> n64
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
  n1 --> n62
  n1 --> n64
  n1 --> n65
  n2 --> n20
  n2 --> n30
  n2 --> n62
  n2 --> n64
  n2 --> n65
  n3 --> n1
  n3 --> n2
  n3 --> n8
  n3 --> n21
  n3 --> n28
  n3 --> n29
  n3 --> n30
  n3 --> n62
  n3 --> n65
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
  n6 --> n62
  n6 --> n65
  n7 --> n2
  n7 --> n4
  n7 --> n5
  n7 --> n11
  n7 --> n19
  n7 --> n62
  n8 --> n5
  n8 --> n62
  n8 --> n64
  n9 --> n2
  n9 --> n5
  n9 --> n21
  n9 --> n62
  n10 --> n5
  n10 --> n30
  n10 --> n62
  n11 --> n2
  n11 --> n4
  n11 --> n5
  n11 --> n13
  n11 --> n18
  n11 --> n21
  n11 --> n26
  n11 --> n62
  n12 --> n5
  n12 --> n11
  n12 --> n21
  n13 --> n2
  n13 --> n4
  n13 --> n5
  n13 --> n11
  n13 --> n20
  n13 --> n26
  n13 --> n62
  n14 --> n62
  n14 --> n65
  n16 --> n5
  n16 --> n62
  n17 --> n5
  n17 --> n62
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
  n18 --> n62
  n19 --> n2
  n19 --> n5
  n19 --> n62
  n20 --> n2
  n20 --> n4
  n20 --> n5
  n20 --> n6
  n20 --> n15
  n20 --> n62
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
  n21 --> n62
  n22 --> n5
  n22 --> n21
  n23 --> n5
  n23 --> n62
  n24 --> n1
  n24 --> n2
  n24 --> n5
  n24 --> n6
  n24 --> n20
  n24 --> n62
  n25 --> n5
  n25 --> n62
  n26 --> n2
  n26 --> n5
  n26 --> n12
  n26 --> n18
  n26 --> n62
  n27 --> n2
  n27 --> n4
  n27 --> n5
  n27 --> n15
  n27 --> n19
  n27 --> n21
  n27 --> n62
  n28 --> n5
  n28 --> n62
  n29 --> n5
  n29 --> n11
  n29 --> n21
  n29 --> n62
  n30 --> n64
  n31 --> n33
  n31 --> n34
  n31 --> n35
  n31 --> n36
  n31 --> n37
  n31 --> n38
  n31 --> n39
  n31 --> n40
  n31 --> n41
  n31 --> n42
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
  n31 --> n63
  n31 --> n65
  n32 --> n33
  n32 --> n37
  n32 --> n42
  n32 --> n46
  n32 --> n49
  n32 --> n52
  n32 --> n57
  n32 --> n59
  n32 --> n61
  n32 --> n63
  n33 --> n32
  n33 --> n38
  n33 --> n41
  n33 --> n53
  n33 --> n61
  n33 --> n62
  n33 --> n63
  n33 --> n64
  n33 --> n65
  n34 --> n41
  n34 --> n48
  n34 --> n62
  n34 --> n63
  n35 --> n34
  n35 --> n49
  n35 --> n59
  n35 --> n61
  n35 --> n62
  n35 --> n63
  n36 --> n49
  n36 --> n63
  n37 --> n34
  n37 --> n45
  n37 --> n48
  n37 --> n49
  n37 --> n51
  n37 --> n61
  n37 --> n62
  n37 --> n63
  n38 --> n44
  n38 --> n62
  n38 --> n63
  n38 --> n64
  n38 --> n65
  n39 --> n40
  n39 --> n42
  n39 --> n49
  n39 --> n60
  n39 --> n61
  n39 --> n62
  n39 --> n63
  n40 --> n49
  n40 --> n63
  n41 --> n47
  n41 --> n61
  n41 --> n62
  n41 --> n63
  n41 --> n64
  n42 --> n34
  n42 --> n41
  n42 --> n48
  n42 --> n49
  n42 --> n54
  n42 --> n60
  n42 --> n61
  n42 --> n62
  n42 --> n63
  n43 --> n32
  n43 --> n33
  n43 --> n34
  n43 --> n38
  n43 --> n41
  n43 --> n42
  n43 --> n47
  n43 --> n49
  n43 --> n52
  n43 --> n57
  n43 --> n59
  n43 --> n60
  n43 --> n61
  n43 --> n62
  n43 --> n63
  n45 --> n34
  n45 --> n37
  n45 --> n48
  n45 --> n54
  n45 --> n62
  n45 --> n63
  n46 --> n38
  n46 --> n41
  n46 --> n48
  n46 --> n49
  n46 --> n52
  n46 --> n57
  n46 --> n59
  n46 --> n61
  n46 --> n62
  n46 --> n63
  n46 --> n64
  n47 --> n34
  n47 --> n42
  n47 --> n48
  n47 --> n49
  n47 --> n51
  n47 --> n52
  n47 --> n57
  n47 --> n58
  n47 --> n60
  n47 --> n62
  n47 --> n63
  n48 --> n41
  n48 --> n53
  n48 --> n57
  n48 --> n62
  n48 --> n63
  n48 --> n64
  n49 --> n34
  n49 --> n37
  n49 --> n40
  n49 --> n48
  n49 --> n50
  n49 --> n51
  n49 --> n60
  n49 --> n62
  n49 --> n63
  n50 --> n49
  n50 --> n62
  n50 --> n63
  n51 --> n48
  n51 --> n62
  n51 --> n63
  n52 --> n34
  n52 --> n37
  n52 --> n41
  n52 --> n42
  n52 --> n43
  n52 --> n46
  n52 --> n47
  n52 --> n48
  n52 --> n49
  n52 --> n57
  n52 --> n58
  n52 --> n60
  n52 --> n61
  n52 --> n62
  n52 --> n63
  n53 --> n57
  n53 --> n61
  n53 --> n62
  n53 --> n63
  n54 --> n34
  n54 --> n40
  n54 --> n48
  n54 --> n49
  n54 --> n61
  n54 --> n62
  n54 --> n63
  n55 --> n61
  n56 --> n34
  n56 --> n41
  n56 --> n49
  n56 --> n61
  n56 --> n62
  n56 --> n63
  n57 --> n47
  n57 --> n61
  n57 --> n62
  n57 --> n63
  n58 --> n34
  n58 --> n37
  n58 --> n41
  n58 --> n48
  n58 --> n49
  n58 --> n51
  n58 --> n57
  n58 --> n61
  n58 --> n62
  n58 --> n63
  n59 --> n49
  n59 --> n61
  n59 --> n62
  n59 --> n63
  n60 --> n49
  n60 --> n51
  n60 --> n62
  n60 --> n63
  n61 --> n31
  n61 --> n32
  n61 --> n33
  n61 --> n38
  n61 --> n41
  n61 --> n43
  n61 --> n44
  n61 --> n53
  n61 --> n55
  n61 --> n57
  n61 --> n62
  n61 --> n63
  n61 --> n64
  n61 --> n65
  n62 --> n64
  n64 --> n65
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
