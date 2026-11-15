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
    n29["réglages"]
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
    n24["search"]
    n25["suggestions"]
    n26["testers"]
    n27["tools"]
    n28["updates"]
  end
  subgraph api["apps/api (serveur)"]
    n30["routes"]
    n59["socle"]
  end
  subgraph apiDomaines["apps/api : domaines"]
    n31["auth"]
    n32["blocks"]
    n33["catalogue"]
    n34["categories"]
    n35["comments"]
    n36["email"]
    n37["feed"]
    n38["follows"]
    n39["handles"]
    n40["hives"]
    n41["jobs"]
    n42["media"]
    n43["mentions"]
    n44["moderation"]
    n45["notifications"]
    n46["profile"]
    n47["projects"]
    n48["reactions"]
    n49["removals"]
    n50["reports"]
    n51["rules"]
    n52["search"]
    n53["security"]
    n54["suggestions"]
    n55["suspension"]
    n56["testers"]
    n57["tools"]
    n58["updates"]
  end
  subgraph paquets["packages (partagés)"]
    n60["contrats"]
    n61["base de données"]
    n62["traductions"]
    n63["marque"]
  end
  n0 --> n1
  n0 --> n2
  n0 --> n3
  n0 --> n4
  n0 --> n5
  n0 --> n6
  n0 --> n18
  n0 --> n20
  n0 --> n29
  n0 --> n60
  n0 --> n62
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
  n1 --> n26
  n1 --> n27
  n1 --> n28
  n1 --> n29
  n1 --> n60
  n1 --> n62
  n1 --> n63
  n2 --> n20
  n2 --> n29
  n2 --> n60
  n2 --> n62
  n2 --> n63
  n3 --> n1
  n3 --> n2
  n3 --> n8
  n3 --> n21
  n3 --> n27
  n3 --> n28
  n3 --> n29
  n3 --> n60
  n3 --> n63
  n4 --> n2
  n4 --> n5
  n4 --> n6
  n4 --> n18
  n4 --> n19
  n4 --> n20
  n5 --> n6
  n5 --> n29
  n6 --> n5
  n6 --> n26
  n6 --> n29
  n6 --> n60
  n6 --> n63
  n7 --> n2
  n7 --> n4
  n7 --> n5
  n7 --> n11
  n7 --> n19
  n7 --> n60
  n8 --> n5
  n8 --> n60
  n8 --> n62
  n9 --> n5
  n9 --> n21
  n9 --> n60
  n10 --> n5
  n10 --> n29
  n10 --> n60
  n11 --> n2
  n11 --> n4
  n11 --> n5
  n11 --> n13
  n11 --> n18
  n11 --> n21
  n11 --> n25
  n11 --> n60
  n12 --> n5
  n12 --> n11
  n12 --> n21
  n13 --> n2
  n13 --> n4
  n13 --> n5
  n13 --> n11
  n13 --> n20
  n13 --> n25
  n13 --> n60
  n14 --> n60
  n14 --> n63
  n16 --> n5
  n16 --> n60
  n17 --> n5
  n17 --> n60
  n18 --> n2
  n18 --> n4
  n18 --> n5
  n18 --> n6
  n18 --> n8
  n18 --> n16
  n18 --> n20
  n18 --> n21
  n18 --> n27
  n18 --> n29
  n18 --> n60
  n19 --> n2
  n19 --> n5
  n19 --> n60
  n20 --> n2
  n20 --> n4
  n20 --> n5
  n20 --> n6
  n20 --> n15
  n20 --> n60
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
  n21 --> n26
  n21 --> n28
  n21 --> n29
  n21 --> n60
  n22 --> n5
  n22 --> n21
  n23 --> n5
  n23 --> n60
  n24 --> n5
  n24 --> n60
  n25 --> n2
  n25 --> n5
  n25 --> n12
  n25 --> n18
  n25 --> n60
  n26 --> n2
  n26 --> n4
  n26 --> n5
  n26 --> n15
  n26 --> n19
  n26 --> n21
  n26 --> n60
  n27 --> n5
  n27 --> n60
  n28 --> n5
  n28 --> n11
  n28 --> n21
  n28 --> n60
  n29 --> n62
  n30 --> n31
  n30 --> n32
  n30 --> n33
  n30 --> n34
  n30 --> n35
  n30 --> n36
  n30 --> n37
  n30 --> n38
  n30 --> n39
  n30 --> n40
  n30 --> n42
  n30 --> n43
  n30 --> n44
  n30 --> n45
  n30 --> n46
  n30 --> n47
  n30 --> n48
  n30 --> n49
  n30 --> n50
  n30 --> n51
  n30 --> n52
  n30 --> n53
  n30 --> n54
  n30 --> n55
  n30 --> n56
  n30 --> n57
  n30 --> n58
  n30 --> n59
  n30 --> n60
  n30 --> n61
  n30 --> n63
  n31 --> n35
  n31 --> n36
  n31 --> n39
  n31 --> n40
  n31 --> n44
  n31 --> n47
  n31 --> n50
  n31 --> n51
  n31 --> n55
  n31 --> n57
  n31 --> n59
  n31 --> n60
  n31 --> n61
  n31 --> n62
  n31 --> n63
  n32 --> n39
  n32 --> n46
  n32 --> n60
  n32 --> n61
  n33 --> n32
  n33 --> n47
  n33 --> n57
  n33 --> n59
  n33 --> n60
  n33 --> n61
  n34 --> n47
  n34 --> n61
  n35 --> n32
  n35 --> n43
  n35 --> n46
  n35 --> n47
  n35 --> n49
  n35 --> n59
  n35 --> n60
  n35 --> n61
  n36 --> n42
  n36 --> n60
  n36 --> n61
  n36 --> n62
  n36 --> n63
  n37 --> n38
  n37 --> n40
  n37 --> n47
  n37 --> n58
  n37 --> n59
  n37 --> n60
  n37 --> n61
  n38 --> n47
  n38 --> n61
  n39 --> n45
  n39 --> n59
  n39 --> n60
  n39 --> n61
  n39 --> n62
  n40 --> n32
  n40 --> n39
  n40 --> n46
  n40 --> n47
  n40 --> n52
  n40 --> n58
  n40 --> n59
  n40 --> n60
  n40 --> n61
  n41 --> n31
  n41 --> n32
  n41 --> n36
  n41 --> n39
  n41 --> n40
  n41 --> n45
  n41 --> n47
  n41 --> n50
  n41 --> n55
  n41 --> n57
  n41 --> n58
  n41 --> n59
  n41 --> n60
  n41 --> n61
  n43 --> n32
  n43 --> n35
  n43 --> n46
  n43 --> n52
  n43 --> n60
  n43 --> n61
  n44 --> n36
  n44 --> n39
  n44 --> n46
  n44 --> n47
  n44 --> n50
  n44 --> n55
  n44 --> n57
  n44 --> n59
  n44 --> n60
  n44 --> n61
  n44 --> n62
  n45 --> n32
  n45 --> n40
  n45 --> n46
  n45 --> n47
  n45 --> n49
  n45 --> n50
  n45 --> n55
  n45 --> n56
  n45 --> n58
  n45 --> n60
  n45 --> n61
  n46 --> n39
  n46 --> n51
  n46 --> n55
  n46 --> n60
  n46 --> n61
  n46 --> n62
  n47 --> n32
  n47 --> n35
  n47 --> n38
  n47 --> n46
  n47 --> n48
  n47 --> n49
  n47 --> n58
  n47 --> n60
  n47 --> n61
  n48 --> n47
  n48 --> n60
  n48 --> n61
  n49 --> n46
  n49 --> n60
  n49 --> n61
  n50 --> n32
  n50 --> n35
  n50 --> n39
  n50 --> n40
  n50 --> n41
  n50 --> n44
  n50 --> n45
  n50 --> n46
  n50 --> n47
  n50 --> n55
  n50 --> n56
  n50 --> n58
  n50 --> n59
  n50 --> n60
  n50 --> n61
  n51 --> n55
  n51 --> n59
  n51 --> n60
  n51 --> n61
  n52 --> n32
  n52 --> n38
  n52 --> n46
  n52 --> n47
  n52 --> n59
  n52 --> n60
  n52 --> n61
  n53 --> n59
  n54 --> n32
  n54 --> n39
  n54 --> n47
  n54 --> n59
  n54 --> n60
  n54 --> n61
  n55 --> n45
  n55 --> n59
  n55 --> n60
  n55 --> n61
  n56 --> n32
  n56 --> n35
  n56 --> n39
  n56 --> n46
  n56 --> n47
  n56 --> n49
  n56 --> n55
  n56 --> n59
  n56 --> n60
  n56 --> n61
  n57 --> n47
  n57 --> n59
  n57 --> n60
  n57 --> n61
  n58 --> n47
  n58 --> n49
  n58 --> n60
  n58 --> n61
  n59 --> n30
  n59 --> n31
  n59 --> n36
  n59 --> n39
  n59 --> n41
  n59 --> n42
  n59 --> n51
  n59 --> n53
  n59 --> n55
  n59 --> n60
  n59 --> n61
  n59 --> n62
  n59 --> n63
  n60 --> n62
  n62 --> n63
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
