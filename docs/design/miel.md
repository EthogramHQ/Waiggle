# Le design « Miel »

La direction visuelle de Waiggle, choisie par Louis le 12/10/2026 : **blanc, verre et lumière de
miel**. Les visuels des projets s'affichent en grand. Derrière chaque écran, une lumière douce prend
la couleur du visuel affiché. L'interface bouge « comme du miel ».

**Miel 2** (refonte, tranche R1, octobre 2026) garde cette direction et l'affine : un fond « Cire »
à peine chaud d'où les surfaces blanches se détachent, une police à chasse fixe pour les noms
d'outils, deux ambiances (la lumière vivante et le « miel vif » des moments de marque), un logo
vectoriel, une mascotte et un chargement animé.

Ce document dit **où vit chaque décision de design dans le code** et **comment la changer**. Les
valeurs exactes (codes couleur, tailles) ne sont pas recopiées ici : elles vivent dans le code, à
un seul endroit, et ce document n'a donc jamais à être mis à jour quand une valeur change.

## Les maquettes

Les maquettes de départ (une galerie de tous les écrans, un canevas modifiable et un prototype
animé) ne sont pas publiées. Elles ont servi de point de départ. Une fois un écran construit, **la
référence, c'est l'appli** : le catalogue et les captures automatiques (voir plus bas) la montrent
à jour.

## Trois étages

Comme une maison : les matériaux, puis les éléments préfabriqués, puis les pièces.

| Étage | Où | Ce qu'on y trouve |
|---|---|---|
| La marque | `packages/brand/src/` | Le nom affiché et les jetons : couleurs, lettres, formes, ombres, mouvement |
| Les composants | `apps/app/src/ui/` | Texte, boutons, champs, surfaces, lumière d'ambiance, mise en page… Ce sont les seuls fichiers qui lisent les jetons |
| Les écrans | `apps/app/src/screens/` | Ils assemblent des composants, sans aucune valeur de style |

| Je veux changer… | Je modifie… |
|---|---|
| le miel, ou n'importe quelle couleur | `packages/brand/src/colors.ts` (jour **et** nuit) |
| la taille de tous les titres de projet | la ligne `title2` de `packages/brand/src/typography.ts` |
| l'arrondi des cartes | `radii` dans `packages/brand/src/shape.ts` |
| le rebond des animations | `springs` dans `packages/brand/src/motion.ts` |
| l'allure de tous les boutons | `apps/app/src/ui/Button.tsx` |
| un seul écran | son fichier dans `apps/app/src/screens/` |
| le nom de l'appli | `packages/brand/src/name.ts`, et `name` dans `apps/app/app.json` (un test vérifie que les deux concordent) |

## Les jetons

Un **jeton** est une valeur de design qui porte un nom de rôle : `textMuted` plutôt que « gris
#6B675E ». Les composants demandent un rôle, jamais une valeur. Résultat : la nuit peut donner une
autre teinte au même rôle, et on peut changer une teinte sans toucher aux composants.

- **Couleurs** (`colors.ts`) : deux jeux, `day` et `night`, qui ont exactement les mêmes noms (le
  code ne compile pas sinon). Le miel ne porte jamais de texte blanc (illisible) : le texte posé
  dessus est l'encre (`onHoney`).
- **Contraste** : la liste `contrastPairs` déclare chaque couple « texte sur fond » utilisé. Un test
  vérifie qu'ils restent lisibles (au moins 4,5:1, ou 3:1 pour les icônes), de jour comme de nuit.
- **Lettres** (`typography.ts`) : Funnel Display pour les titres, Funnel Sans pour le reste, Geist
  Mono (chasse fixe) pour les étiquettes d'outils, les versions et les prompts ; toutes sous
  licence libre OFL et livrées avec l'appli. Aucune requête ne part vers Google. Une échelle de
  rôles, de `toolNameWide` (le nom géant d'un outil) et `poster` (l'affiche d'un écran de marque)
  à `micro` (libellé d'onglet), plus `mono` et `code`.
- **Formes** (`shape.ts`) : espacements multiples de 4 (`xs` à `huge`), rayons du plus rond
  (`sheet`) au plus serré (`code`), largeurs d'écran (téléphone, tablette, ordinateur), 44 points
  minimum pour toucher.
- **Ombres** (`shadows.ts`) : teintées de miel le jour, jamais grises ; noires la nuit.
- **Mouvement** (`motion.ts`) : le ressort `honey` (raideur 170, amortissement 18, environ 5 % de
  dépassement) et trois durées (160, 320 et 560 ms).

## Les matières

Le composant `Surface` porte cinq matières. C'est le seul endroit qui décide du flou.

- `plain` : surface pleine, pour ce qui se lit longtemps (description, formulaires).
- `grouped` : groupe blanc bordé, pour des champs ou des réglages.
- `glass` : verre, pour ce qui flotte (barres, boutons ronds sur une image).
- `panel` : verre plus dense, pour du texte posé sur une image.
- `sheet` : feuille qui monte du bas de l'écran.

Le flou est calculé par l'appareil et coûte cher. Le canevas des maquettes, qui en affichait des
centaines à la fois, figeait le navigateur. Le vrai flou est donc réservé au verre et aux feuilles,
quelques-uns par écran. Sur Android, le vrai flou demande de désigner à l'avance ce qu'il faut
flouter : en attendant de le brancher, le verre y est un peu plus opaque, sans flou.

Sur le web, le flou est une couche posée sous la couleur de la matière, pas à sa place : le flou du
navigateur impose sa propre teinte, trop claire pour garder le texte lisible. Chaque couche reprend
les coins arrondis de la surface.

## Les formulaires sur téléphone

Un formulaire long garde son en-tête « Annuler / titre / action » en haut de l'écran pendant qu'on
fait défiler (`Screen` avec `stickyHeader`, en-tête `SheetHeader`). Le message qui suit l'action
(« Profil enregistré », une erreur) s'affiche juste sous cet en-tête (`notice`), là où se trouve le
bouton qu'on vient de toucher. Exemples : captures `publier-telephone-*` et `profil-telephone-*`.

## La lumière d'ambiance

`AmbientLight`, la signature de Miel. Derrière l'écran, une grande lueur prend la couleur du visuel
affiché (un projet, un avatar). Sans visuel, c'est la « lumière miel ». Elle respire lentement
(`durations.breath`) et, sur téléphone, suit l'inclinaison de l'appareil.

Depuis Miel 2, elle est **vivante** :

- **Sa source** : un écran la règle par `useAmbient().setSource(…)` (`ui/theme/ambient.tsx`),
  avec le ThumbHash d'un visuel ou trois couleurs. Elle passe d'une source à l'autre en fondu
  (`durations.lightFade`), et `pulse()` la fait briller un instant (une réaction, par exemple).
  Chaque écran a sa propre lumière : `Screen` monte son fournisseur.
- **Sur ordinateur** (`AmbientLight.web.tsx`), elle est dessinée par la carte graphique (WebGL) :
  une matière qui coule, des reflets de miel, une lueur qui suit la souris. Sans WebGL, sur
  téléphone, ou avec « Réduire les animations », c'est la version allégée
  (`AmbientLightSoft.tsx`). Les captures de la CI, sans carte graphique, montrent cette version.
- **Vie privée** : la position de la souris et le capteur d'inclinaison ne servent qu'au dessin.
  Rien n'est gardé ni envoyé, et le dessin n'est jamais relu.

Son flou ne coûte rien : on ne calcule aucun filtre, on agrandit une image minuscule, floue par
nature. Pour un visuel de projet, cette image est son **ThumbHash** : un résumé de l'image en
quelques dizaines d'octets, que le serveur calcule à l'envoi.

## Les deux ambiances

`Screen` prend une prop `ambiance` :

- `light` (par défaut) : la lumière d'ambiance derrière le contenu.
- `brand` : le **miel vif** des moments de marque (accueil d'un visiteur, connexion, inscription,
  adresse vérifiée, page introuvable…). Un dégradé de miel en haut de l'écran
  (`ui/BrandAmbiance.tsx`), et une feuille claire qui remonte dessus et porte le contenu et les
  boutons. La lumière d'ambiance est alors coupée. Aucun bouton encre n'est posé sur le miel.

## La marque : logo, mascotte, chargement

- **Le logo** (`ui/Logo.tsx`) : l'abeille et son « w », en tracés vectoriels générés par
  `apps/app/scripts/logo.mts` dans `ui/logo.generated.ts`. Le mot « waiggle » (`ui/Wordmark.tsx`)
  porte un point de miel sur le i. Ces signes de la marque ne sont pas sous AGPL (voir le README).
- **Le chargement** : au lancement de l'appli, l'abeille dessine son « w » en volant
  (`ui/LoadingLogo.tsx`). Une page qui charge montre des **squelettes** (`ui/Skeleton.tsx`), la
  forme grise de ce qui arrive ; « Chargement… » reste lu par les lecteurs d'écran.
- **La mascotte** (`ui/Mascot.tsx`) : l'abeille en quatre poses (vol, salut, sommeil, loupe), dans
  les états vides, la page introuvable et la fin du fil. Ses images sont découpées et ré-encodées
  sans métadonnées par `apps/app/scripts/images.mts`.

## Le mouvement

« Les choses bougent comme du miel » : elles partent vite, ralentissent et dépassent à peine leur
place avant de s'y poser. Les animations utilisent Reanimated, qui les fait tourner sur un fil à
part : elles restent fluides même quand l'appli travaille.

Par défaut, tout le monde a toutes les animations et la lumière d'ambiance vivante. Seule exception,
validée dans le scénario : si la personne a elle-même activé « Réduire les animations » sur son
appareil, les grands déplacements deviennent des fondus. Le hook `useCalmMotion()` le signale.
La lumière d'ambiance devient alors immobile : elle garde sa couleur et ses fondus d'une source à
l'autre, mais ne respire plus et ne suit plus la souris ni l'inclinaison (décision du 29/10/2026 ;
une animation qui tourne sans fin doit pouvoir s'arrêter, WCAG 2.2.2). Seule l'abeille du
lancement continue de voler : elle est seule à l'écran, le temps du chargement.

## L'ordinateur

Les pages sont fluides : le contenu ne dépasse pas 1 280 points de large, centré. `Columns` place
une colonne principale et une colonne latérale. Quand la place manque, la latérale passe dessous,
sans calcul : chaque colonne a une largeur de base et va à la ligne quand les deux ne tiennent
plus côte à côte. Il n'y a jamais de défilement horizontal.

## L'écriture

- **Le ton** : phrases courtes, verbes d'action, tutoiement, pas de jargon (« visuel », « lien de
  démo », « étiquette », « réaction »).
- **Les boutons** : un bouton dit ce qu'il fait (« Publier », « Tester la démo »), et le message qui
  suit reprend le même verbe (« Projet publié »).
- **Les erreurs** : elles disent ce qui ne va pas et comment corriger, sans excuse.
- **Ce qu'on n'utilise pas** :
  - le tiret cadratin ni le demi-cadratin dans les textes affichés ;
  - les étiquettes en capitales au-dessus des titres ;
  - la flèche « → » dans les boutons (l'icône `arrow-up-right` est réservée aux liens qui sortent
    de l'appli) ;
  - les émojis ;
  - les mots creux.
- **Les exemples** : toujours les personnes et les projets des maquettes (Léa, Max, Papi Jean,
  Inès… et leurs projets), jamais de faux latin.

## Les garde-fous automatiques

Ils tournent dans `pnpm check`, donc à chaque pull request :

- **Lint Biome** : un écran (`src/screens/`, `app/`) ne peut pas importer `Text`, `View`,
  `StyleSheet`, `Pressable`, `Image`… de React Native. Le message d'erreur renvoie vers `src/ui`.
- **`src/design-rules.test.ts`** :
  - aucune couleur écrite à la main dans l'appli ;
  - le nom sous l'icône du téléphone (`app.json`) est bien celui de la marque.
- **`packages/brand/src/brand.test.ts`** :
  - contraste suffisant ;
  - mêmes noms de jour et de nuit ;
  - graisses de police livrées ;
  - ressort réglé.
- **`packages/i18n/src/i18n.test.ts`** : aucun texte n'écrit le nom de l'appli en dur (on écrit
  `{{appName}}`).
- **Les tests des écrans** : ils retrouvent les éléments par leur rôle et leur nom (« le bouton
  Publier »), jamais par leur apparence. Refaire l'interface ne les casse pas.

## Voir ses changements

- **Le catalogue** : `pnpm --filter @ruche/app web`, puis la page `/catalogue`. Il montre chaque
  composant dans tous ses états, avec des boutons Jour / Nuit et Français / English. Il n'existe
  qu'en développement.
- **Les captures** : `pnpm --filter @ruche/app shots` photographie le catalogue et chaque écran,
  sur téléphone et sur ordinateur, de jour et de nuit, dans `apps/app/shots/`. La CI fait de même à
  chaque pull request : sur la page de la vérification, rubrique « Artifacts », fichier
  « captures ».

## Recettes

**Ajouter un composant.**
1. Créer `apps/app/src/ui/MonComposant.tsx`, avec une phrase en tête qui dit à quoi il sert.
2. Lire les couleurs avec `useTheme()` et les tailles dans `@ruche/brand`.
3. L'ajouter au catalogue (`src/catalogue/CatalogueScreen.tsx`) dans tous ses états.
4. Tester son comportement (rôle, nom, état) dans son propre fichier, `src/ui/MonComposant.test.tsx`.

**Ajouter une icône.** Ajouter son nom (celui du catalogue <https://phosphoricons.com>) à la liste
de `apps/app/scripts/icons.mts`, puis lancer `pnpm --filter @ruche/app icons`.

**Ajouter une couleur.**
1. L'ajouter au jour **et** à la nuit dans `colors.ts`.
2. Si elle porte du texte, ajouter le couple à `contrastPairs`.

**Renommer l'appli.** Changer `packages/brand/src/name.ts` et `name` dans `apps/app/app.json`. Le
nom de code « Ruche » (dépôt, paquets `@ruche/...`, identifiants techniques) ne change pas.
