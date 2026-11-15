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
    n28["réglages"]
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
    n14["media"]
    n15["members"]
    n16["mentions"]
    n17["moderation"]
    n18["notifications"]
    n19["profile"]
    n20["projects"]
    n21["reactions"]
    n22["reports"]
    n23["search"]
    n24["suggestions"]
    n25["testers"]
    n26["tools"]
    n27["updates"]
  end
  subgraph api["apps/api (serveur)"]
    n29["routes"]
    n58["socle"]
  end
  subgraph apiDomaines["apps/api : domaines"]
    n30["auth"]
    n31["blocks"]
    n32["catalogue"]
    n33["categories"]
    n34["comments"]
    n35["email"]
    n36["feed"]
    n37["follows"]
    n38["handles"]
    n39["hives"]
    n40["jobs"]
    n41["media"]
    n42["mentions"]
    n43["moderation"]
    n44["notifications"]
    n45["profile"]
    n46["projects"]
    n47["reactions"]
    n48["removals"]
    n49["reports"]
    n50["rules"]
    n51["search"]
    n52["security"]
    n53["suggestions"]
    n54["suspension"]
    n55["testers"]
    n56["tools"]
    n57["updates"]
  end
  subgraph paquets["packages (partagés)"]
    n59["contrats"]
    n60["base de données"]
    n61["traductions"]
    n62["marque"]
  end
  n0 --> n1
  n0 --> n2
  n0 --> n3
  n0 --> n4
  n0 --> n5
  n0 --> n6
  n0 --> n17
  n0 --> n19
  n0 --> n28
  n0 --> n59
  n0 --> n61
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
  n1 --> n25
  n1 --> n26
  n1 --> n27
  n1 --> n28
  n1 --> n59
  n1 --> n61
  n1 --> n62
  n2 --> n19
  n2 --> n28
  n2 --> n59
  n2 --> n61
  n2 --> n62
  n3 --> n1
  n3 --> n2
  n3 --> n8
  n3 --> n20
  n3 --> n26
  n3 --> n27
  n3 --> n28
  n3 --> n59
  n3 --> n62
  n4 --> n2
  n4 --> n5
  n4 --> n6
  n4 --> n17
  n4 --> n18
  n4 --> n19
  n5 --> n6
  n5 --> n28
  n6 --> n5
  n6 --> n25
  n6 --> n28
  n6 --> n59
  n6 --> n62
  n7 --> n2
  n7 --> n4
  n7 --> n5
  n7 --> n11
  n7 --> n18
  n7 --> n59
  n8 --> n5
  n8 --> n59
  n8 --> n61
  n9 --> n5
  n9 --> n20
  n9 --> n59
  n10 --> n5
  n10 --> n28
  n10 --> n59
  n11 --> n2
  n11 --> n4
  n11 --> n5
  n11 --> n13
  n11 --> n17
  n11 --> n20
  n11 --> n24
  n11 --> n59
  n12 --> n5
  n12 --> n11
  n12 --> n20
  n13 --> n2
  n13 --> n4
  n13 --> n5
  n13 --> n11
  n13 --> n19
  n13 --> n24
  n13 --> n59
  n15 --> n5
  n15 --> n59
  n16 --> n5
  n16 --> n59
  n17 --> n2
  n17 --> n4
  n17 --> n5
  n17 --> n6
  n17 --> n8
  n17 --> n15
  n17 --> n19
  n17 --> n20
  n17 --> n26
  n17 --> n28
  n17 --> n59
  n18 --> n2
  n18 --> n5
  n18 --> n59
  n19 --> n2
  n19 --> n4
  n19 --> n5
  n19 --> n6
  n19 --> n14
  n19 --> n59
  n20 --> n1
  n20 --> n2
  n20 --> n4
  n20 --> n5
  n20 --> n8
  n20 --> n11
  n20 --> n12
  n20 --> n14
  n20 --> n15
  n20 --> n17
  n20 --> n25
  n20 --> n27
  n20 --> n28
  n20 --> n59
  n21 --> n5
  n21 --> n20
  n22 --> n5
  n22 --> n59
  n23 --> n5
  n23 --> n59
  n24 --> n2
  n24 --> n5
  n24 --> n12
  n24 --> n17
  n24 --> n59
  n25 --> n2
  n25 --> n4
  n25 --> n5
  n25 --> n14
  n25 --> n18
  n25 --> n20
  n25 --> n59
  n26 --> n5
  n26 --> n59
  n27 --> n5
  n27 --> n11
  n27 --> n20
  n27 --> n59
  n28 --> n61
  n29 --> n30
  n29 --> n31
  n29 --> n32
  n29 --> n33
  n29 --> n34
  n29 --> n35
  n29 --> n36
  n29 --> n37
  n29 --> n38
  n29 --> n39
  n29 --> n41
  n29 --> n42
  n29 --> n43
  n29 --> n44
  n29 --> n45
  n29 --> n46
  n29 --> n47
  n29 --> n48
  n29 --> n49
  n29 --> n50
  n29 --> n51
  n29 --> n52
  n29 --> n53
  n29 --> n54
  n29 --> n55
  n29 --> n56
  n29 --> n57
  n29 --> n58
  n29 --> n59
  n29 --> n60
  n29 --> n62
  n30 --> n34
  n30 --> n35
  n30 --> n38
  n30 --> n39
  n30 --> n43
  n30 --> n46
  n30 --> n49
  n30 --> n54
  n30 --> n56
  n30 --> n58
  n30 --> n59
  n30 --> n60
  n30 --> n61
  n30 --> n62
  n31 --> n38
  n31 --> n45
  n31 --> n59
  n31 --> n60
  n32 --> n31
  n32 --> n46
  n32 --> n56
  n32 --> n58
  n32 --> n59
  n32 --> n60
  n33 --> n46
  n33 --> n60
  n34 --> n31
  n34 --> n42
  n34 --> n45
  n34 --> n46
  n34 --> n48
  n34 --> n58
  n34 --> n59
  n34 --> n60
  n35 --> n41
  n35 --> n59
  n35 --> n60
  n35 --> n61
  n35 --> n62
  n36 --> n37
  n36 --> n39
  n36 --> n46
  n36 --> n57
  n36 --> n58
  n36 --> n59
  n36 --> n60
  n37 --> n46
  n37 --> n60
  n38 --> n44
  n38 --> n58
  n38 --> n59
  n38 --> n60
  n38 --> n61
  n39 --> n31
  n39 --> n38
  n39 --> n45
  n39 --> n46
  n39 --> n51
  n39 --> n57
  n39 --> n58
  n39 --> n59
  n39 --> n60
  n40 --> n30
  n40 --> n31
  n40 --> n35
  n40 --> n38
  n40 --> n39
  n40 --> n44
  n40 --> n46
  n40 --> n49
  n40 --> n54
  n40 --> n56
  n40 --> n57
  n40 --> n58
  n40 --> n59
  n40 --> n60
  n42 --> n31
  n42 --> n34
  n42 --> n45
  n42 --> n51
  n42 --> n59
  n42 --> n60
  n43 --> n35
  n43 --> n38
  n43 --> n45
  n43 --> n46
  n43 --> n49
  n43 --> n54
  n43 --> n56
  n43 --> n58
  n43 --> n59
  n43 --> n60
  n43 --> n61
  n44 --> n31
  n44 --> n39
  n44 --> n45
  n44 --> n46
  n44 --> n48
  n44 --> n49
  n44 --> n54
  n44 --> n55
  n44 --> n57
  n44 --> n59
  n44 --> n60
  n45 --> n38
  n45 --> n50
  n45 --> n54
  n45 --> n59
  n45 --> n60
  n45 --> n61
  n46 --> n31
  n46 --> n34
  n46 --> n37
  n46 --> n45
  n46 --> n47
  n46 --> n48
  n46 --> n57
  n46 --> n59
  n46 --> n60
  n47 --> n46
  n47 --> n59
  n47 --> n60
  n48 --> n45
  n48 --> n59
  n48 --> n60
  n49 --> n31
  n49 --> n34
  n49 --> n38
  n49 --> n39
  n49 --> n40
  n49 --> n43
  n49 --> n44
  n49 --> n45
  n49 --> n46
  n49 --> n54
  n49 --> n55
  n49 --> n57
  n49 --> n58
  n49 --> n59
  n49 --> n60
  n50 --> n59
  n50 --> n60
  n51 --> n31
  n51 --> n37
  n51 --> n45
  n51 --> n46
  n51 --> n58
  n51 --> n59
  n51 --> n60
  n52 --> n58
  n53 --> n31
  n53 --> n38
  n53 --> n46
  n53 --> n58
  n53 --> n59
  n53 --> n60
  n54 --> n44
  n54 --> n58
  n54 --> n59
  n54 --> n60
  n55 --> n31
  n55 --> n38
  n55 --> n45
  n55 --> n46
  n55 --> n48
  n55 --> n54
  n55 --> n58
  n55 --> n59
  n55 --> n60
  n56 --> n46
  n56 --> n58
  n56 --> n59
  n56 --> n60
  n57 --> n46
  n57 --> n48
  n57 --> n59
  n57 --> n60
  n58 --> n29
  n58 --> n30
  n58 --> n35
  n58 --> n38
  n58 --> n40
  n58 --> n41
  n58 --> n52
  n58 --> n54
  n58 --> n59
  n58 --> n60
  n58 --> n61
  n58 --> n62
  n59 --> n61
  n61 --> n62
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
