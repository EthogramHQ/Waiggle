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
    n56["socle"]
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
    n39["jobs"]
    n40["media"]
    n41["mentions"]
    n42["moderation"]
    n43["notifications"]
    n44["profile"]
    n45["projects"]
    n46["reactions"]
    n47["removals"]
    n48["reports"]
    n49["search"]
    n50["security"]
    n51["suggestions"]
    n52["suspension"]
    n53["testers"]
    n54["tools"]
    n55["updates"]
  end
  subgraph paquets["packages (partagés)"]
    n57["contrats"]
    n58["base de données"]
    n59["traductions"]
    n60["marque"]
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
  n0 --> n57
  n0 --> n59
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
  n1 --> n57
  n1 --> n59
  n1 --> n60
  n2 --> n19
  n2 --> n28
  n2 --> n57
  n2 --> n59
  n2 --> n60
  n3 --> n1
  n3 --> n2
  n3 --> n8
  n3 --> n20
  n3 --> n26
  n3 --> n27
  n3 --> n28
  n3 --> n57
  n3 --> n60
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
  n6 --> n57
  n6 --> n60
  n7 --> n2
  n7 --> n4
  n7 --> n5
  n7 --> n11
  n7 --> n18
  n7 --> n57
  n8 --> n5
  n8 --> n57
  n8 --> n59
  n9 --> n5
  n9 --> n20
  n9 --> n57
  n10 --> n5
  n10 --> n28
  n10 --> n57
  n11 --> n2
  n11 --> n4
  n11 --> n5
  n11 --> n17
  n11 --> n20
  n11 --> n24
  n11 --> n57
  n12 --> n5
  n12 --> n11
  n12 --> n20
  n13 --> n5
  n13 --> n11
  n13 --> n19
  n13 --> n24
  n13 --> n57
  n15 --> n5
  n15 --> n57
  n16 --> n5
  n16 --> n57
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
  n17 --> n57
  n18 --> n2
  n18 --> n5
  n18 --> n57
  n19 --> n2
  n19 --> n4
  n19 --> n5
  n19 --> n6
  n19 --> n14
  n19 --> n57
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
  n20 --> n57
  n21 --> n5
  n21 --> n20
  n22 --> n5
  n22 --> n57
  n23 --> n5
  n23 --> n57
  n24 --> n2
  n24 --> n5
  n24 --> n12
  n24 --> n17
  n24 --> n57
  n25 --> n2
  n25 --> n4
  n25 --> n5
  n25 --> n14
  n25 --> n18
  n25 --> n20
  n25 --> n57
  n26 --> n5
  n26 --> n57
  n27 --> n5
  n27 --> n11
  n27 --> n20
  n27 --> n57
  n28 --> n59
  n29 --> n30
  n29 --> n31
  n29 --> n32
  n29 --> n33
  n29 --> n34
  n29 --> n35
  n29 --> n36
  n29 --> n37
  n29 --> n38
  n29 --> n40
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
  n29 --> n60
  n30 --> n34
  n30 --> n35
  n30 --> n38
  n30 --> n42
  n30 --> n45
  n30 --> n48
  n30 --> n52
  n30 --> n54
  n30 --> n56
  n30 --> n57
  n30 --> n58
  n30 --> n59
  n30 --> n60
  n31 --> n38
  n31 --> n44
  n31 --> n57
  n31 --> n58
  n32 --> n31
  n32 --> n45
  n32 --> n54
  n32 --> n56
  n32 --> n57
  n32 --> n58
  n33 --> n45
  n33 --> n58
  n34 --> n31
  n34 --> n41
  n34 --> n44
  n34 --> n45
  n34 --> n47
  n34 --> n56
  n34 --> n57
  n34 --> n58
  n35 --> n40
  n35 --> n57
  n35 --> n58
  n35 --> n59
  n35 --> n60
  n36 --> n37
  n36 --> n45
  n36 --> n55
  n36 --> n56
  n36 --> n57
  n36 --> n58
  n37 --> n45
  n37 --> n58
  n38 --> n43
  n38 --> n56
  n38 --> n57
  n38 --> n58
  n38 --> n59
  n39 --> n30
  n39 --> n35
  n39 --> n38
  n39 --> n43
  n39 --> n45
  n39 --> n48
  n39 --> n52
  n39 --> n54
  n39 --> n56
  n39 --> n57
  n39 --> n58
  n41 --> n31
  n41 --> n34
  n41 --> n44
  n41 --> n49
  n41 --> n57
  n41 --> n58
  n42 --> n35
  n42 --> n38
  n42 --> n44
  n42 --> n45
  n42 --> n48
  n42 --> n52
  n42 --> n54
  n42 --> n56
  n42 --> n57
  n42 --> n58
  n42 --> n59
  n43 --> n31
  n43 --> n44
  n43 --> n45
  n43 --> n47
  n43 --> n48
  n43 --> n52
  n43 --> n53
  n43 --> n55
  n43 --> n57
  n43 --> n58
  n44 --> n38
  n44 --> n52
  n44 --> n57
  n44 --> n58
  n44 --> n59
  n45 --> n31
  n45 --> n34
  n45 --> n37
  n45 --> n44
  n45 --> n46
  n45 --> n47
  n45 --> n55
  n45 --> n57
  n45 --> n58
  n46 --> n45
  n46 --> n57
  n46 --> n58
  n47 --> n44
  n47 --> n57
  n47 --> n58
  n48 --> n31
  n48 --> n34
  n48 --> n38
  n48 --> n39
  n48 --> n42
  n48 --> n43
  n48 --> n44
  n48 --> n45
  n48 --> n52
  n48 --> n53
  n48 --> n55
  n48 --> n56
  n48 --> n57
  n48 --> n58
  n49 --> n31
  n49 --> n37
  n49 --> n44
  n49 --> n45
  n49 --> n57
  n49 --> n58
  n50 --> n56
  n51 --> n31
  n51 --> n38
  n51 --> n45
  n51 --> n56
  n51 --> n57
  n51 --> n58
  n52 --> n43
  n52 --> n56
  n52 --> n57
  n52 --> n58
  n53 --> n31
  n53 --> n38
  n53 --> n44
  n53 --> n45
  n53 --> n47
  n53 --> n52
  n53 --> n56
  n53 --> n57
  n53 --> n58
  n54 --> n45
  n54 --> n56
  n54 --> n57
  n54 --> n58
  n55 --> n45
  n55 --> n47
  n55 --> n57
  n55 --> n58
  n56 --> n29
  n56 --> n30
  n56 --> n35
  n56 --> n38
  n56 --> n39
  n56 --> n40
  n56 --> n50
  n56 --> n52
  n56 --> n57
  n56 --> n58
  n56 --> n59
  n56 --> n60
  n57 --> n59
  n59 --> n60
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
