# Phase 2 — La refonte « Miel 2 » : scénarios

Statut : R1 **validé par Louis** le 28/10/2026 ; R2 **validé** le 29/10/2026.

La refonte applique les maquettes et les décisions du 28/10/2026 (image de marque validée le
27/10, décisions pour la refonte, maquettes du 27 au 28/10), en quatorze tranches : R1 les
fondations, R2 le compte, R3 la navigation et Explorer, R4 le fil, R5a la page projet, R5b les
commentaires, R6a la feuille de publication, R6b les outils et les catégories, R7a les mises à
jour et les testeurs, R7b le coin des testeurs, R8 les notifications, R9 la modération, R10 les Ruches, R11 la conformité, R12 les projets
publics. Chaque tranche ajoute ici ses scénarios.
Les scénarios de la phase 1 (`phase-1.md`) restent valables : la refonte change l'apparence et
le mouvement, jamais une règle métier sans le dire.

---

## R1 — Les fondations « Miel 2 »

La première tranche ne crée aucun écran ni aucune route : elle change la matière de l'appli. Les
jetons (`packages/brand`), les composants (`apps/app/src/ui`) et le catalogue prennent l'identité
« Miel 2 » ; tous les écrans existants en héritent sans être redessinés. Chaque tranche suivante
redessine ses écrans avec ces fondations. Aucun contrat d'API ne change.

**La Cire, fond de jour**
- Étant donné un membre, de jour
- Alors le fond de l'appli est la Cire, un blanc chaud, à la place du blanc pur
- Et les surfaces blanches qui se lisent longtemps (cartes, champs) ont une fine bordure beige
- Et tous les couples « texte sur fond » restent lisibles (4,5:1, ou 3:1 pour les icônes et les
  gros titres), vérifiés par le test de contraste

**Le verre et l'ombre**
- Le verre de jour est plus dense qu'avant, et son reflet de nuit plus discret
- L'ombre est sous la carte, jamais sous le panneau de verre posé dans la carte
- Sur le web, le flou du verre avive légèrement les couleurs qu'il recouvre
- Le vrai flou reste réservé au verre et aux feuilles, quelques-uns par écran

**La nuit**
- Le choix actif d'un contrôle segmenté est crème, avec un texte encre
- Les halos de miel sont plus forts que le jour
- Les cartes ont une ombre noire et un fin liseré
- La lumière d'ambiance prend la couleur de la photo affichée
- Un écran qui n'a pas de maquette de nuit se déduit des jetons, sans valeur écrite à la main

**Les couleurs portent les noms de la marque**
- Les jetons gardent leurs rôles (`honey`, `text`…) et le catalogue affiche à côté le nom de la
  marque : Miel, Ambre, Pollen, Crème, Encre, Nuit, Cire
- De nouveaux rôles : le texte posé sur du verre, les pointillés, le nom de l'auteur sur une
  tuile miel, le bandeau d'erreur et sa bordure
- La pastille rouge des nouveautés garde son rouge, pour le contraste de son chiffre blanc

**Les lettres**
- Trois nouveaux rôles : l'accroche (sous un titre), l'affiche (un grand mot sur l'accueil) et le
  nom géant d'un outil (plus grand sur ordinateur que sur téléphone, et qui rétrécit quand le
  nom est long)
- Geist Mono, par petites touches : les étiquettes d'outils, les versions, les compteurs et les
  prompts. Elle est livrée avec l'appli, sous licence libre, sans requête vers un service extérieur
- Les avatars sans photo affichent deux initiales, en graisse très forte

**Les formes**
- Un nouveau rayon, le plus rond, et un nouvel espacement, le plus large, tous deux de 40
- Le bouton principal fait 56 de haut ; un petit bouton de 36 garde une zone à toucher de 44

**Les nouveaux composants**, chacun au catalogue dans tous ses états, avec son test
- une case à cocher et un bouton radio rond, qui se choisissent au clavier (Espace, flèches dans
  un groupe) et annoncent leur état aux lecteurs d'écran
- un toast, en verre, qui s'affiche 2,4 secondes puis s'efface ; les lecteurs d'écran l'annoncent
  sans qu'il prenne le focus
- une pile d'avatars, pour montrer « des membres » (une ruche, des testeurs), jamais pour dire qui
  a réagi ni qui suit
- des tuiles de projet (crème et encre) et une tuile « + Ajouter »
- des formes de verre pleines, pour un contenu en cours de chargement (le fil, une page), à la
  place de « Chargement… »
- le bouton rouge de confirmation a un reflet et un halo ; l'élément choisi au clavier a un
  contour miel avec un halo

**Le mouvement, la base**
- Les jetons du mouvement : la courbe « miel », des ressorts nommés, les durées, l'enfoncement
  d'un bouton à 0,96 (0,92 pour le bouton « + »)
- Le passage du jour à la nuit est un fondu, pendant lequel les textes restent lisibles
- Les grands moments du prototype (la carte qui devient la page, la goutte des onglets, la
  réaction, l'éventail, le portail, la danse de publication, la sphère, la vague de miel)
  arrivent chacun avec la tranche de leur écran, construits sur ces jetons
- « Réduire les animations » (règle A11, précisée le 29/10/2026) : les grands déplacements
  deviennent des fondus, les petits mouvements (appui, interrupteur) restent, et **la lumière
  d'ambiance devient immobile** : elle garde sa couleur et change encore de teinte en fondu
  d'un projet à l'autre, mais ne respire plus, ne suit plus la souris et n'a plus de reflets
  (WCAG 2.2.2 : un mouvement qui démarre seul, dure plus de 5 secondes et accompagne du contenu
  doit pouvoir s'arrêter). L'abeille du lancement, seule à l'écran, est exemptée

**La lumière vivante**
- Sur ordinateur : la lumière prend la couleur de la carte au centre de l'écran, change en fondu
  d'une carte à l'autre, pulse à chaque action (une réaction, une publication) et suit la souris
- Sur téléphone, une version allégée : la couleur des cartes et le fondu, sans reflets d'eau
- Quand l'appli passe en arrière-plan, la lumière s'arrête, et repart au retour
- Un écran sans photo garde la lumière miel
- Avec « Réduire les animations », la lumière est immobile (voir « Le mouvement, la base »)

**Les deux ambiances**
- Le miel vif, en haut de l'écran, pour les moments de marque : l'accueil, la connexion,
  l'inscription, la vérification, le portail, la page introuvable et « Tu es à jour »
- Un fond clair, avec la lumière tirée des photos, pour les écrans d'usage
- Sur le miel vif, les boutons sont posés sur une feuille claire, en miel comme partout : jamais
  un bouton encre directement sur le miel
- En R1, l'ambiance miel vif habille les écrans de marque qui existent déjà (accueil, connexion,
  inscription, vérification, introuvable), sans changer leur contenu ; R2 les redessine

**La mascotte dans les états**
- La loupe pour une page introuvable ou une recherche vide ; le salut pour la bienvenue et le
  premier lancement ; le vol pour « Vérifie ta boîte mail » et un projet publié ; le sommeil pour
  « Tu es à jour » et les listes vides
- Elle se pose sur un fond de verre, et chaque image a un texte de remplacement
- Sur l'accueil avant connexion, c'est le logo, pas la mascotte

**Le chargement de l'appli**
- Au lancement, l'abeille grandit le long du chemin du logo, se pose (c'est le logo), puis repart
  à l'horizontale en s'effaçant, le chemin accroché derrière elle ; la boucle dure 4,6 secondes,
  de jour comme de nuit
- Elle est dessinée en Reanimated, à partir du chemin vectoriel du logo
- Avec « Réduire les animations », le logo reste affiché, immobile
- Le chargement d'un contenu dans l'appli (le fil, une page) n'utilise pas l'abeille : des formes
  de verre pleines

**Le logo vectoriel**
- Le logo (l'abeille dont le vol écrit le « w ») existe en vectoriel, de jour, de nuit et en
  version teintée ; l'abeille seule sert aux petites tailles (favicon, icône)
- Le nom s'écrit en minuscules, Funnel Display gras, le point du i en miel
- Il est redessiné par l'assistant depuis la ligne centrale du chemin, l'abeille décalquée puis
  nettoyée ; Louis le valide sur les captures, avant qu'il remplace l'ancien
- Il apparaît partout où l'appli signe (l'accueil, la barre, les e-mails) ; l'icône de l'appli
  et le favicon en sont tirés

**Le catalogue**
- Deux nouvelles rubriques : « Navigation » et « Jetons » (les couleurs avec leurs noms de marque,
  les lettres, les formes, les ombres, le mouvement)
- Chaque nouveau composant y est, dans tous ses états, de jour et de nuit, en français et en anglais
- Les captures (`shots`) le photographient entier, sur téléphone et sur ordinateur

**Rien ne se perd**
- Tous les écrans existants s'affichent avec les nouvelles fondations, et leurs tests passent
  sans changer ce qu'ils cherchent (rôles et noms)
- Aucune couleur, taille ou police n'est écrite dans un écran ; le lint et le test des règles de
  design le vérifient
- Le parcours d'un membre (`journey`) reste vert

---

## R2 — Le compte

R2 redessine tout le compte avec les fondations « Miel 2 » (11 planches) et ajoute ce qui manque
(décisions du 28/10, B9) : le mot de passe oublié, en priorité, le changement du mot de passe,
« trop d'essais », « Vérifie ta boîte mail » complet, les onglets sur ordinateur, et une seule page
« Réglages ». Trois routes de Better Auth fermées aujourd'hui s'ouvrent, avec leurs quotas ; deux
e-mails s'ajoutent. Relectures : sécurité et juridique (e-mails, données).

Hors de R2 : les règles de Waiggle (case à l'inscription et page) viennent avec R11, qui en écrit
le texte ; la mascotte de ces écrans arrive avec la PR « mascotte » du samedi.

### Entrer

**Bienvenue**
- Étant donné un visiteur sans compte
- Alors l'accueil est sur le miel vif, avec le logo, l'accroche et la constellation
- Et le texte et les boutons sont posés sur une feuille claire (à 430 de large sur ordinateur)
- Et le second bouton est en verre
- Et la phrase de confidentialité dit « Rien n'est visible sans compte, ni trouvé par un moteur de
  recherche. » (R12 la remplacera par « Rien n'est public sans ton accord. » quand le public
  existera)

**Se connecter et créer un compte**
- Les textes suivent la maquette : « Te revoilà », « Créer ton compte », « Créer mon compte »
- Sur téléphone, les boutons principaux sont en bas, dans la zone du pouce, et remontent au-dessus
  du clavier
- Sur ordinateur, « Se connecter » et « Créer un compte » sont deux onglets d'un même panneau ; on
  passe de l'un à l'autre sans changer de page, au clavier comme à la souris, et l'adresse de la
  page suit l'onglet (un lien vers `/sign-up` ouvre le bon onglet)
- La langue se choisit sur ces deux pages
- « Voir le code » est annoncé comme un site externe (flèche, et « ouvre un site externe » pour les
  lecteurs d'écran)
- Le bouton « Créer mon compte » reste actif ; à l'envoi, chaque champ incomplet dit ce qui manque,
  et le premier reçoit le focus

**Vérifie ta boîte mail**
- Étant donné un nouveau membre qui vient de s'inscrire
- Alors la page lui dit à quelle adresse le lien est parti
- Et « Renvoyer l'e-mail » renvoie le lien, puis attend une minute avant de pouvoir resservir ;
  au-delà de quelques envois par heure ou par jour, il dit à quelle heure réessayer
- Et la réponse est la même que l'adresse ait un compte ou non
- Et « Changer d'adresse » lui permet de corriger une faute de frappe avant d'avoir vérifié :
  il donne la bonne adresse **et son mot de passe**, l'ancien lien cesse de marcher, un nouveau
  part à la bonne adresse ; la page dit « Si cette adresse n'est pas déjà utilisée, un lien vient
  d'y partir. » (on ne révèle pas qui a un compte ; la connexion qui suit peut le laisser deviner,
  comme à l'inscription : risque accepté par Louis le 29/10/2026)
- Et « Ouvrir ma messagerie » ouvre l'appli de messagerie sur téléphone ; sur ordinateur, le
  webmail quand l'adresse est d'un service connu (Gmail, Outlook, Yahoo, Proton, iCloud, Orange,
  Free, SFR, La Poste) ; sinon le bouton n'apparaît pas

### Le mot de passe

**J'ai oublié mon mot de passe**
- Étant donné un visiteur sur « Se connecter »
- Quand il touche « Mot de passe oublié ? » et donne son adresse
- Alors la page dit toujours la même chose, qu'un compte existe ou non : « Si un compte existe
  pour cette adresse, un e-mail vient de partir. »
- Et, si le compte existe, il reçoit un e-mail dans la langue de son compte, avec un lien valable
  une heure, utilisable une seule fois, qui dit quoi faire s'il n'a rien demandé

**Choisir un nouveau mot de passe**
- Quand il ouvre le lien
- Alors l'appli lui demande un nouveau mot de passe, avec les règles et la jauge de l'inscription
- Quand il le valide
- Alors son mot de passe change, **tous ses appareils sont déconnectés**, et il arrive sur « Se
  connecter » avec « Mot de passe changé. Connecte-toi avec le nouveau. »
- Et il reçoit l'e-mail de sécurité « Ton mot de passe a changé » (sans le mot de passe), qui dit
  quoi faire si ce n'était pas lui
- Étant donné un lien expiré, déjà utilisé ou abîmé
- Alors la page le dit simplement et propose « Demander un nouveau lien »

**Changer mon mot de passe** (rubrique « Sécurité » des réglages)
- On demande le mot de passe actuel et le nouveau
- L'actuel faux : le champ le dit, rien ne change
- Les deux bons : le mot de passe change, **les autres appareils sont déconnectés**, celui-ci
  reste connecté, un toast dit « Mot de passe changé », l'e-mail de sécurité part

**Trop d'essais**
- Étant donné un visiteur qui s'est trompé 5 fois en 15 minutes
- Alors « Se connecter » dit « Trop d'essais pour l'instant. Nouvel essai possible à 21 h 47. »
  (une heure fixe, rien qui défile ; pas de « tu » : l'adresse IP est partagée par une famille)
- Et le bouton est bloqué, dit pourquoi, et un lien propose « Choisir un nouveau mot de passe »
- Quand l'heure arrive, le bouton se débloque tout seul
- Même chose pour « Mot de passe oublié », « Renvoyer l'e-mail » et « Changer mon mot de passe »
  quand leur quota est atteint

### Les réglages

**Une seule page « Réglages »** (elle remplace « Mon compte » ; `/account` et `/profile` y mènent)
- En haut, la carte du membre en verre : sa photo, son nom, « Voir ma page » et « Modifier »
- Les rubriques : Mon profil, Notifications, Langue, Apparence, Mes données, Sécurité, Compte, À
  propos
- Sur téléphone, en liste ; chaque rubrique ouvre sa page
- Sur ordinateur, en colonne à gauche, la rubrique choisie à droite ; l'adresse suit la rubrique
- Rien de ce que l'on règle aujourd'hui ne disparaît : chaque réglage existant trouve sa rubrique

**Modifier mon profil**
- Le profil se modifie dans une feuille posée sur sa photo floutée, la photo dans un anneau de
  verre, « Changer la photo » qui la chevauche
- Sur ordinateur, l'aperçu de sa page se met à jour pendant qu'on écrit
- Les règles du profil ne changent pas (longueurs, photo ré-encodée sans métadonnées)

**L'apparence** tient sur une ligne (Système, Jour, Nuit) et passe en liste pour les grandes
tailles de texte

**Supprimer mon compte**
- Dans une feuille, par-dessus les réglages, avec sa photo et les vignettes de ses projets
- La liste complète de ce qui disparaît et de ce qui reste est gardée (décision A8)
- Le mot de passe est toujours demandé

### Les garde-fous (relus par la sécurité avant les tests)

- Mot de passe oublié et renvoi du lien de vérification : quotas par adresse e-mail **et** par
  adresse IP ; au-delà, la même réponse, sans e-mail (rien ne révèle le quota d'une adresse)
- Le lien de l'e-mail ne contient que le jeton ; la page qui l'ouvre ne le montre à aucun autre
  site (pas de lien externe, pas de référent)
- Changer son mot de passe : 5 essais par 15 minutes et par membre
- Changer d'adresse avant vérification : le mot de passe est exigé, avec un quota ; l'ancien lien
  est révoqué
- Un membre suspendu peut changer son mot de passe, mais reste suspendu
- Chaque nouvelle route a son test d'autorisation
- Le parcours d'un membre (`journey`) gagne : oublier son mot de passe, recevoir le lien, le
  changer, constater la déconnexion de l'autre appareil ; renvoyer le lien de vérification

**Changer d'adresse, le second lien** (tranche « adresse », renforcée)
- Étant donné Inès qui change d'adresse et se trompe d'une lettre
- Quand un inconnu ouvre le lien envoyé à l'adresse mal tapée
- Alors rien ne change : ce lien ne marche que sur un appareil où Inès est connectée (sinon,
  l'appli demande de se connecter, puis le lien aboutit)
- Ainsi, avec le mot de passe oublié, l'inconnu ne peut jamais prendre le compte (le risque
  accepté le 25/10 disparaît)

### Les décisions de Louis (29/10/2026)

- Le lien du mot de passe oublié vérifie aussi l'adresse, **seulement si c'est celle à qui il a
  été envoyé**
- Après « Choisir un nouveau mot de passe », retour à « Se connecter »
- « Changer d'adresse » avant la vérification exige le mot de passe
- Le mot de passe sur le miel vif, comme la connexion ; les réglages sur le fond clair
- Le second lien d'un changement d'adresse ne marche que dans la session du membre
- « Trop d'essais » : une heure fixe, pas de décompte

---

## R3 — La navigation et Explorer

Scénario validé par Louis le 30/10/2026 vers 23 h, tel que proposé (conversation 1 de R3).

R3 donne à l'appli sa forme définitive (10 planches R3, décisions B1 F-Nav1 à F-Nav10 et B2
F-Fil5 à F-Fil8) : la barre d'onglets en bas sur téléphone, la barre du haut sur ordinateur,
Explorer (qui reprend Découvrir), la recherche par mots, et la page « Moi » avec sa roue des
réglages. Les réglages à rubriques existent depuis R2 : R3 change seulement la façon d'y entrer.
Une nouvelle route d'API (la recherche) ; aucune table nouvelle. Relectures : sécurité (la
recherche respecte la visibilité et les blocages), juridique (ce que la recherche garde ou non).

Hors de R3, et où ça va :
- les catégories (filtres de « Récents », « Toutes les catégories ») : R6, qui les crée ;
- le catalogue normé des outils, leurs logos, leurs familles : R6. En R3, « Outils » veut dire les
  étiquettes d'aujourd'hui, avec une tuile à l'initiale ;
- la feuille de publication qui monte du bas : R6. En R3, « + » ouvre la page de publication
  d'aujourd'hui ;
- les ruches elles-mêmes : R10 ;
- le nouveau fil (cartes, « Tu es à jour », premier lancement) : R4 ;
- la page « Activité » redessinée : R8. En R3, la cloche mène à la page d'aujourd'hui ;
- partager sa page et le projet épinglé de la planche « Moi » : plus tard (R5 pour le partage).

### La barre d'onglets (téléphone)

**Les cinq places**
- Étant donné un membre connecté, sur téléphone
- Alors une barre de verre flotte en bas : **Fil · Explorer · ( + ) · Ruches · Moi**
- Et « Moi » montre sa photo (ses initiales s'il n'en a pas), cerclée quand l'onglet est actif
- Et le « + » est un rond miel de 56 au milieu, qui ouvre la publication
- Et chaque onglet a un nom lu par les lecteurs d'écran, et dit lequel est actif
- Et la barre reste au-dessus de la zone du geste de l'appareil (iPhone, Android)

**La goutte**
- Quand le membre touche un autre onglet
- Alors la goutte claire de l'onglet actif glisse jusqu'à lui en s'étirant, puis se pose
- Et avec « Réduire les animations », elle apparaît en fondu à sa nouvelle place

**Où la barre se montre**
- Elle se montre sur Fil, Explorer, la recherche, la page d'un outil, la page d'un membre, Ruches
  et Moi
- Elle disparaît sur les pages poussées par-dessus : un projet, l'Activité, les réglages et leurs
  rubriques, publier et modifier, signaler, la modération ; ces pages gardent leur « Retour »
- Toucher l'onglet déjà actif ramène à sa première page, ou en haut de sa liste
- Un visiteur sans compte ne la voit jamais

**Ruches avant R10** (choix de Louis, 30/10/2026)
- L'onglet est là dès R3 et ouvre une page « Les ruches arrivent bientôt », avec la mascotte et
  deux phrases sur ce qu'elles seront (des groupes de proches : « Ma ruche Famille »)

**Un membre suspendu**
- Étant donné un membre suspendu
- Alors le « + » disparaît de la barre (et « Publier » de la barre du haut), comme aujourd'hui

### La barre du haut (ordinateur)

**Une barre pour toutes les pages d'un membre**
- Étant donné un membre connecté, sur un écran large
- Alors une barre de verre en haut porte : le logo et le mot « waiggle », les liens Fil, Explorer,
  Ruches (le lien actif dans sa goutte), le champ de recherche, la cloche avec sa pastille, sa
  photo, et le bouton miel « Publier »
- Et un administrateur y voit aussi « Modération »
- Et sa photo mène à « Moi »
- Et la barre est la même sur toutes les pages, « Publier » compris (F-Nav4)

**Passer du téléphone à l'ordinateur**
- Quand la fenêtre s'élargit ou se rétrécit
- Alors la barre du bas laisse la place à celle du haut, sans recharger la page
- Et la page pré-rendue sur le web ne montre ni l'une ni l'autre avant de connaître la largeur
  (pas d'écart signalé par React)

### Le Fil

**Le Fil ne garde que les abonnements** (F-Nav6, F-Nav10)
- Étant donné un membre sur l'onglet Fil
- Alors il voit le fil de ceux qu'il suit, sans le choix « Abonnements / Découvrir »
- Et le haut du fil montre le logo à la place de « Bonjour Léa ! », avec la cloche « Activité » et
  sa pastille à droite
- Et la cloche ouvre l'Activité, une page poussée, sans barre d'onglets
- Et le fil vide propose « Explorer les projets », qui ouvre l'onglet Explorer
- Le reste du Fil (cartes, nouveautés, « Tu es à jour ») change en R4

### Explorer

**La page** (F-Fil6, planches `R3-Explorer`, `R3-Explorer-Nuit`, `R3-Explorer-Desktop`)
- Étant donné un membre sur l'onglet Explorer
- Alors il voit, de haut en bas :
  - le titre « Explorer » et, sur ordinateur, « Les projets de tous les membres : à tester, à
    suivre, pour t'inspirer. » (Louis, 30/10/2026) ;
  - le champ « Un projet, une personne, un outil » (sur téléphone ; sur ordinateur, c'est celui de
    la barre du haut) ;
  - « Ils cherchent des testeurs » : un carrousel des projets testables qui ont un lien de démo,
    chacun avec sa photo, « Tester ↗ » posé sur l'image, son titre et son auteur ;
  - « Outils populaires » : les outils les plus utilisés dans les projets publics, avec leur
    nombre sur ordinateur, et « Tous les outils » ;
  - « Récents » : les projets publics de tous les membres, du plus récent au plus ancien, par
    pages, comme Découvrir aujourd'hui
- Et la nuit suit les jetons, comme le reste de l'appli

**Tester depuis le carrousel**
- Quand il touche « Tester ↗ »
- Alors la démo s'ouvre par la page d'avertissement des liens externes, comme aujourd'hui
- Et « Tester » est annoncé comme un site externe
- Sur ordinateur, des flèches font défiler le carrousel ; au clavier, chaque carte se rejoint par
  Tab
- Quand il touche le titre d'une carte du carrousel, la page du projet s'ouvre (Louis, 31/10/2026)

**Suivre l'auteur depuis une carte** (F-Fil8, Explorer seulement)
- Étant donné une carte de « Récents » dont il ne suit pas l'auteur
- Alors une pastille de verre « Suivre Nora » est posée sur la photo
- Quand il la touche
- Alors il suit Nora, et la pastille dit « Tu suis Nora ✓ »
- Et ses propres projets n'ont pas de pastille

**Les outils**
- Quand il touche un outil, populaire ou dans « Tous les outils »
- Alors il voit la page de cet outil (la page d'étiquette d'aujourd'hui), barre d'onglets
  visible, Explorer actif
- « Tous les outils » liste les outils des projets publics par ordre alphabétique, chacun avec son
  nombre de projets publics

### La recherche par mots (F-Nav7, planche `R3-Recherche`)

**Chercher**
- Étant donné un membre qui touche le champ de recherche
- Quand il tape « carn »
- Alors les résultats arrivent pendant qu'il tape, rangés en trois groupes : Projets, Membres,
  Outils
- Et des onglets « Tout · Projets 2 · Membres 1 · Outils 1 » filtrent les groupes
- Et la partie du texte qui correspond est surlignée de miel
- Et « Annuler » (téléphone) vide la recherche et revient à Explorer
- Et l'adresse de la page garde la recherche (`/search?q=carn`), qu'on peut partager entre membres

**Ce qui est cherché**
- Les projets : le titre, le pitch et la description ; le résultat montre la photo, le titre,
  l'auteur et le statut, ou l'extrait du texte qui correspond
- Les membres : le nom et le pseudo ; le résultat montre l'avatar, le nom, « @pseudo · 12
  abonnés »
- Les outils : leur nom ; le résultat dit « 7 projets publics »
- Les accents et les majuscules ne comptent pas : « eleve » trouve « Élève »
- La recherche commence à 2 caractères ; les mots d'une seule lettre sont ignorés
- Les membres : à 2 caractères, seuls ceux que l'on suit ; tous à partir de 3 caractères, comme
  les mentions (Louis, 30/10/2026, après les relectures de sécurité et juridique : sinon
  l'annuaire du cercle se relève en moins d'un jour) ; ils sont rangés par nom, jamais par
  nombre d'abonnés

**Ce qui n'est jamais trouvé**
- Un projet privé d'un autre membre, un projet retiré par la modération
- Un membre qui a bloqué celui qui cherche, ou qu'il a bloqué, ni ses projets
- Un compte supprimé ou jamais vérifié
- Les projets privés de celui qui cherche sont trouvés, marqués « Privé »

**Rien trouvé**
- Quand rien ne correspond, par exemple « carnaval »
- Alors la mascotte à la loupe dit « Aucun résultat pour « carnaval » » et propose « Essaie un mot
  plus court, ou le nom d'un outil comme « Claude ». »

**Les garde-fous**
- La recherche est réservée aux membres connectés
- Un quota par membre (à fixer au plan) ; au-delà, « Trop de recherches, réessaie dans un
  instant »
- Les recherches ne sont gardées nulle part : ni en base, ni dans les journaux (le mot cherché
  n'apparaît pas dans les logs de l'API), ni sur l'appareil (pas de « recherches récentes »)
- Taper ne crée pas une page de plus dans l'historique du navigateur à chaque lettre
- Chaque groupe montre 20 résultats au plus

### Moi (F-Nav8, F-Nav9, planches `R3-Moi`, `R3-Membre-Desktop`)

**Ma page**
- Étant donné un membre sur l'onglet Moi (ou qui touche sa photo sur ordinateur)
- Alors il voit sa propre page de membre : sa photo, son nom, « @pseudo », sa bio, son nombre
  d'abonnés, ses outils favoris
- Et « Modifier mon profil » mène à la rubrique « Mon profil » des réglages
- Et une roue dentée, en haut à droite, ouvre les Réglages
- Et « Mes projets · 3 » liste ses projets, les privés marqués « Privé »

**La page d'un autre membre**
- Elle prend la même mise en page, avec « Projets · 3 » et le bouton « Suivre », qui devient « Tu
  suis Max ✓ »

**Les réglages**
- Les rubriques de R2 ne changent pas ; on y entre par la roue de « Moi » (et sur ordinateur par
  « Moi » aussi)
- La ligne « Modération » reste dans les réglages d'un administrateur sur téléphone
- « Se déconnecter » reste dans la rubrique « Compte »

### Venus des listes (choix de Louis, 30/10/2026)

Pris dans R3 parce qu'ils touchent la navigation (`design-a-reprendre.md`, « Venu de R2 ») :
- le « Retour » au même endroit sur toutes les pages poussées ;
- la colonne des rubriques sur ordinateur bornée à la largeur d'un formulaire (interrupteur et
  radio près de leur libellé) ;
- les états (lien refusé, « Connecte-toi d'abord ») alignés à gauche, dans `StateMessage` ;
- le mot « waiggle » sur l'accueil d'ordinateur, à côté du logo.

### Le parcours d'un membre

- Le parcours (`journey`) gagne : passer d'un onglet à l'autre, chercher un projet par un mot sans
  accent, ouvrir le résultat, suivre un auteur depuis Explorer, ouvrir ses réglages par la roue de
  « Moi »

---

## R4 — Le fil et les cartes

Scénario validé par Louis le 31/10/2026 vers 19 h 30, tel que proposé, avec ses trois choix : la
place de « Tu es à jour », le « × » gardé par le serveur, les deux points des listes (conversation
1 de R4).

R4 redessine le Fil (planches `R4-Fil`, `R4-Fil-Nuit`, `R4-Fil-Desktop`, `R4-Fil-Desktop-Nuit`,
`R4-Fil-AJour`, `R4-Fil-Premier`, `R4-Fil-Chargement`, `R4-Fil-Erreur` ; décisions B2 F-Fil1 à
F-Fil5, F-Fil9 à F-Fil12, F-Fil14, et le mouvement de B11) : la nouvelle carte, les dates
relatives dans toute l'appli, les nouveautés avec les visages des auteurs, « Tu es à jour », le
premier lancement avec « Proches à suivre », les colonnes sur ordinateur, et trois mouvements (la
carte qui devient la page, la lumière qui suit le défilement, l'inclinaison des cartes). Côté
API : le total des réactions dans le résumé d'un projet, la date de la dernière lecture du fil,
et les proches à suivre. Relectures : sécurité (les suggestions ne montrent rien de privé ni de
bloqué), juridique (la date de lecture et les suggestions écartées sont des données personnelles).

Hors de R4, et où ça va :
- le sélecteur « Tout · Famille · Amis du jeudi », « Tes ruches » dans la colonne de droite, et
  l'invitation à rejoindre une ruche au premier lancement : R10, qui crée les ruches ;
- l'étiquette de catégorie posée sur la photo (« Cuisine ») : R6, qui crée les catégories ;
- le repère « Mis à jour · v1.2 » sur la carte : R7 ;
- les réactions elles-mêmes (la capsule, « Waggle ! ») : R5a, sur la page projet. La carte ne
  montre que leur total.

### La carte du fil (F-Fil1, F-Fil2, planches `R4-Fil`, `R4-Fil-Desktop`)

**Ce qu'elle montre**
- Étant donné un nouveau projet dans le fil d'un membre
- Alors sa carte montre la photo du projet bord à bord, aux coins arrondis
- Et, posé en bas de la photo, un panneau de verre porte :
  - la photo et le nom de l'auteur, et à droite la date relative ;
  - le titre du projet et son accroche (deux lignes au plus) ;
  - « Tester ↗ » en miel si le projet a un lien de démo, puis la pastille de son statut ;
  - à droite, l'étincelle et le total de ses réactions (« ✦ 49 »), un nombre sans noms
- Et un projet sans photo garde la tuile à l'initiale d'aujourd'hui, à la même taille
- Et un projet sans réaction ne montre pas de total (pas de « ✦ 0 »)
- Et le lecteur d'écran lit « 49 réactions », pas le symbole

**Ce qu'on y touche**
- Quand il touche la carte (la photo, le titre, l'accroche)
- Alors la page du projet s'ouvre
- Quand il touche « Tester ↗ »
- Alors la démo s'ouvre par la page d'avertissement des liens externes, comme dans Explorer, et
  « Tester » est annoncé comme un site externe
- Quand il touche le nom ou la photo de l'auteur
- Alors la page de l'auteur s'ouvre

**Les notes des projets suivis**
- Une note garde sa carte d'aujourd'hui (« Note de Léa sur Carnet de cafés »), redessinée avec le
  même verre et la date relative

### Les dates relatives (F-Fil3), partout dans l'appli

- Étant donné une date affichée dans l'appli (fil, Explorer, page projet, notes, commentaires,
  Activité, modération)
- Alors elle se lit « à l'instant », « il y a 5 min », « il y a 2 h », « hier », puis le jour
  (« mardi ») jusqu'à 7 jours
- Et au-delà, la date courte (« 12 oct. »), avec l'année si ce n'est pas l'année en cours
  (« 12 oct. 2025 »)
- Et l'heure est celle de Paris, comme aujourd'hui, et la langue celle de l'appli (« 2 h ago »,
  « Tuesday », « Oct 12 »)
- Et sur le web, la page pré-rendue n'affiche la date relative qu'une fois le navigateur connu
  (pas d'écart signalé par React)
- Et la date complète reste lisible au survol sur ordinateur et par le lecteur d'écran

### Les nouveautés (F-Fil4, F-Fil14)

- Étant donné un membre qui lit son fil depuis un moment
- Quand de nouveaux éléments arrivent chez ceux qu'il suit
- Alors un bouton de verre apparaît en haut du fil, avec les photos de leurs auteurs (trois au
  plus) et un texte qui s'adapte : « 2 nouveaux projets », « 1 nouvelle note », ou
  « 3 nouveautés » quand il y a des deux
- Et sur ordinateur, ce bouton est à côté du titre « Fil »
- Quand il le touche
- Alors le fil remonte en haut et les nouvelles cartes tombent en place
- Et avec « Réduire les animations », elles apparaissent en fondu
- Et le lecteur d'écran annonce l'arrivée des nouveautés une fois, sans voler le focus

### « Tu es à jour » (F-Fil5, planche `R4-Fil-AJour`)

- Étant donné un membre qui a déjà ouvert son fil
- Quand il fait défiler les éléments arrivés depuis sa dernière visite et arrive au premier qu'il
  a déjà vu
- Alors la sphère de miel s'affiche, avec la mascotte endormie, « Tu es à jour », « Tu as tout vu
  depuis ta dernière visite », le bouton « Explorer d'autres projets » (vers l'onglet Explorer)
  (bouton secondaire) et « Les nouveautés s'afficheront en haut du fil. »
- Et s'il n'a jamais ouvert son fil, le texte dit seulement « Tu as tout vu. »
- Et les éléments plus anciens suivent dessous, comme aujourd'hui, par pages
- Et si rien n'est arrivé depuis sa dernière visite, la sphère est en haut du fil
- Et si le fil se termine sans élément déjà vu, la sphère est à la fin
- Et l'appli retient seulement la date de la dernière lecture du fil, jamais ce qu'il a lu une par
  une : la date avance quand il ouvre le fil
- Et le miel de la sphère ondule doucement ; avec « Réduire les animations », il reste immobile

### Le premier lancement et « Proches à suivre » (F-Fil9, F-Fil10, planche `R4-Fil-Premier`)

**Un membre qui ne suit personne**
- Étant donné un membre qui ne suit encore personne
- Alors le fil montre la mascotte, « Bonjour Inès ! », « Ton fil t'attend » et « Suis des proches
  pour voir leurs projets ici. »
- Et dessous, « Proches à suivre » : jusqu'à cinq membres qui ont publié récemment, chacun avec sa
  photo, son nom, son dernier projet public (vignette et titre) et « Suivre » sur la ligne
- Et la légende dit « Des membres qui ont publié récemment » ; aucune ligne ne dit qui le suit
  ni combien d'abonnés il a
- Et le nom ou la photo ouvre la page du membre, la vignette ouvre le projet
- Et sous la liste, un encart « Ou publie ton premier projet. Une idée, un essai, ça compte. » avec
  le bouton « Publier »

**Suivre depuis la liste**
- Quand il touche « Suivre » sur une ligne
- Alors il suit ce membre, le bouton dit « Tu suis » avec sa coche, et la ligne reste à sa place
- Et dès qu'il suit quelqu'un, le fil de cette personne remplace l'accueil au prochain passage

**Écarter une suggestion**
- Quand il touche « × » sur une ligne (nommé « Ne plus suggérer Léa »)
- Alors la ligne disparaît, le focus passe à la ligne suivante, et un autre membre prend sa place
  s'il y en a
- Et un message « Tu ne verras plus Léa ici. » propose « Annuler » pendant 5 secondes, qui remet
  la ligne (choix de Louis, 31/10/2026)
- Et passé ce délai, ce membre ne lui est plus suggéré, sur aucun appareil ; Léa n'en sait rien
- Et deux tapes rapides n'écartent jamais la ligne qui monte sous le doigt

**Qui est suggéré**
- Seulement des membres qui ont au moins un projet public, du plus récent au plus ancien
- Jamais lui-même, ni un membre qu'il suit déjà, ni un membre qu'il a bloqué ou qui l'a bloqué
- Un membre suspendu reste suggéré, comme il reste dans Explorer : la suspension ne se devine
  nulle part (choix de Louis, 31/10/2026)
- Le dernier projet montré est toujours public ; jamais un brouillon ni un projet retiré

### Le Fil sur ordinateur (F-Fil11, F-Fil12, F-Fil14, planche `R4-Fil-Desktop`)

- Étant donné un membre sur un écran large
- Alors le Fil a pour titre « Fil », avec le bouton des nouveautés à côté
- Et les cartes vont sur deux colonnes, et une colonne à droite porte « Proches à suivre » (trois
  membres, avec « Suivre ») et « Ils cherchent des testeurs » (vignette, titre, auteur et
  « Tester »)
- Et sur un écran moyen, les cartes vont sur une colonne et la colonne de droite reste ; sur
  téléphone, une seule colonne, sans colonne de droite
- Et la colonne de droite reste visible quand le fil est vide ou au premier lancement

### Le chargement et l'erreur (planches `R4-Fil-Chargement`, `R4-Fil-Erreur`)

- Pendant le chargement, le fil montre des formes de verre pleines à la place des cartes (l'abeille
  reste pour le lancement de l'appli)
- Si le fil ne se charge pas, la mascotte, un message et « Réessayer », aligné à gauche comme les
  autres états (`StateMessage`)

### Le mouvement (B11)

**La carte qui devient la page**
- Quand il touche une carte
- Alors sa photo s'agrandit jusqu'à devenir le haut de la page du projet, et le reste de la page
  arrive dessous
- Et au retour, la page se replie dans sa carte
- Et avec « Réduire les animations », la page apparaît en fondu

**La lumière au défilement** (M6)
- Pendant qu'il fait défiler le fil, la lumière d'ambiance prend la couleur de la photo de la carte
  au centre de l'écran, en fondu d'une carte à l'autre
- Sur téléphone, la version allégée de R1 (la couleur et le fondu, sans reflets)
- Avec « Réduire les animations », la couleur change toujours, mais sans mouvement de la lumière
- L'effet s'arrête quand l'appli passe en arrière-plan

**L'inclinaison des cartes** (ordinateur)
- Quand la souris passe sur une carte, la carte s'incline un peu vers elle et la lumière de son
  verre suit le pointeur ; elle se remet à plat quand la souris part
- Rien au toucher ni au clavier ; rien avec « Réduire les animations »

### Venus des listes

Pris dans R4 (choix de Louis, 31/10/2026), parce qu'ils touchent les écrans du fil :
- les teintes d'`InitialTile`, que « Proches à suivre » montre souvent ;
- l'écart entre un titre et son sous-titre, que le titre « Fil » reprend.

### Le parcours d'un membre

- Le parcours (`journey`) gagne : un nouveau membre voit « Ton fil t'attend », suit un proche
  depuis « Proches à suivre », retrouve son projet dans le fil avec sa date relative et son total
  de réactions, touche « Tester », puis revient et voit « Tu es à jour »

## R5a — La page projet

Scénario validé par Louis le 1/11/2026 vers 23 h, tel que proposé, avec ses sept choix
(conversation 1 de R5a).

R5a redessine la page d'un projet (planches `R5a-Projet`, `R5a-Projet-Suite`, `R5a-Projet-Nuit`,
`R5a-Projet-Desktop`, `R5a-Auteur`, `R5a-Eventail`, `R5a-Partager`, `R5a-Portail`,
`R5a-Portail-Nuit`, `R5a-Introuvable` ; décisions B3 F-Pr1, F-Pr2, F-Pr4 à F-Pr7, F-Pr9, F-Pr10,
F-Pr12, F-Pr13, B5 F-Out1, F-Out2, F-404, B6 l'éventail et F-Re1, F-Mod4 pour les prompts, et le
mouvement de B11) : la photo bord à bord et sa galerie, la capsule de réactions avec « Waggle ! »,
l'éventail et la goutte, partager, suivre l'auteur, « Le prompt de départ » avec « Copier » et ses
protections, la page de sortie avec le portail, la page introuvable, la vue de l'auteur, et la page
sur ordinateur. Côté API, peu de chose : les caractères invisibles retirés des prompts, et la page de
sortie qui sait de quel projet vient le lien. Relectures : sécurité (le repère des prompts, la page
de sortie, le lien partagé), juridique (les phrases de prudence, ce que dit le partage).

Hors de R5a, et où ça va :
- les commentaires (l'aperçu de 3 ou 5, la feuille, le menu « … » d'un commentaire, le badge
  Auteur, les réponses, les mentions) : R5b ;
- la catégorie à côté du statut, « Facile à refaire ? », « Commencé en », la description de chaque
  photo, la clé d'API repérée et le compteur du formulaire, « Supprimer » dans le menu « … » : R6 ;
- « v1.2 » sous le titre, « Publier une mise à jour », « Les mises à jour » à la place du journal,
  l'avant / après : R7 ;
- le motif de signalement « Lien, démo ou prompt dangereux » et « Signaler » dans une feuille : R9 ;
- un projet public ouvert par un visiteur : R12.

### La photo et la galerie (F-Pr6, F-Pr7, planches `R5a-Projet`, `R5a-Projet-Desktop`)

- Étant donné un membre qui ouvre un projet à trois photos, sur téléphone
- Alors la photo occupe le haut de l'écran bord à bord, et la feuille du projet la chevauche
- Et sur la photo, en verre : Retour à gauche, Partager et « … » à droite
- Et en bas de la photo, des points et « 1 sur 3 »
- Quand il fait glisser la photo
- Alors la suivante arrive, les points et « 2 sur 3 » suivent, et la lumière d'ambiance prend la
  couleur de cette photo, en fondu
- Et le lecteur d'écran annonce « Photo 2 sur 3 » et peut passer d'une photo à l'autre sans glisser
- Et sur ordinateur, des flèches de verre sur les côtés de la photo, et les flèches du clavier
- Et un projet à une seule photo n'a ni points ni « 1 sur 1 » ; un projet sans photo garde sa
  lumière miel d'aujourd'hui

### Sous le titre (F-Pr5) et l'auteur (F-Pr4)

- Sous le statut et le titre : « Publié le 3 oct. · Mis à jour hier » (dates de R4 : « hier »,
  « mardi », « 12 oct. ») ; « Mis à jour » seulement si le projet a changé après sa publication
- Puis la photo et le nom de l'auteur, son pseudo, et à droite un petit bouton « Suivre »
- Quand il touche « Suivre »
- Alors il suit l'auteur, et le bouton dit « Tu suis Papi Jean » (comme sur la page d'un membre)
- Et le grand bouton « Suivre ce projet », sous « Tester la démo », reste celui d'aujourd'hui
  (prévenu des notes), avec « 12 abonnés » à côté, un nombre sans noms
- Et sous « Tester la démo », le nom du site et « un site hors de Waiggle »
  (« decollage.lovable.app, un site hors de Waiggle »)

### Les réactions : la capsule, « Waggle ! », l'éventail et la goutte (F-Pr9, F-Re1, B6, planche `R5a-Eventail`)

**La capsule**
- Étant donné un membre sur la page d'un projet qui n'est pas le sien
- Alors une capsule de verre flotte en bas de l'écran, avec les cinq icônes et leur nombre :
  Bluffant, Inspirant, Utile, Drôle et **« Waggle ! »** (l'abeille), qui remplace « Bravo »
- Et sur ordinateur, la capsule est posée à cheval sur le bas de la photo
- Et ses propres réactions sont en miel plein
- Quand il touche une icône
- Alors sa réaction est posée : une goutte de miel tombe et s'écrase, le nombre roule, un anneau
  s'élargit et le bouton rebondit ; pour « Waggle ! », la petite abeille danse
- Quand il touche une réaction déjà posée
- Alors elle est retirée, le nombre redescend
- Et le lecteur d'écran lit chaque bouton en entier (« Waggle !, 21, ta réaction »)
- Et avec « Réduire les animations », la goutte et le rebond restent (petits mouvements, A11)
- Et « Bravo » devient « Waggle ! » partout où il s'affiche (notifications, e-mails), en français
  comme en anglais

**L'éventail**
- Quand il appuie longtemps sur la capsule (ou clic droit sur ordinateur)
- Alors l'éventail s'ouvre par-dessus la page floutée : chaque réaction avec son nom et son nombre,
  « Ta réaction » et un bouton « Retirer » sur les siennes
- Et en bas : « Tu peux en poser plusieurs, une de chaque. »
- Et la première fois seulement, une aide en haut : « Touche une réaction pour la poser. » en gras,
  puis « Un appui long sur la capsule ouvre cet éventail, avec le nom de chacune. » et « J'ai
  compris »
- Et pour un membre suspendu, l'éventail ne s'ouvre pas, et la capsule ne l'annonce pas
- Et l'éventail se ferme par un toucher à côté, Échap ou Retour, et rend le focus à la capsule

**L'auteur**
- Étant donné l'auteur sur la page de son projet (planche `R5a-Auteur`)
- Alors pas de capsule : un bloc « Les réactions à ton projet » donne chaque réaction avec son nom et
  son nombre, et « Des nombres seulement : personne ne voit qui a réagi. »
- Et ses boutons sont « Modifier » (et « 4 abonnés » à côté), le journal reste en dessous
- Et sur un projet privé, le bandeau « Privé : aucun autre membre ne le voit. Il te sert de
  brouillon : les commentaires et les réactions des autres membres sont gardés, mais aucun membre,
  toi compris, ne les voit tant qu'il reste privé. Ils reviendront s'il redevient public. »
  (texte corrigé en R5b), et « Créé le 12 oct. » au lieu de « Publié le »

### Partager (F-Pr1, F-Mb1, planche `R5a-Partager`)

- Quand il touche Partager sur la photo
- Alors une feuille montre la vignette, « Décollage! sur Waiggle » et l'adresse du projet
- Et le bandeau « Seuls les membres de Waiggle pourront l'ouvrir. »
- Et « Partager… », qui ouvre le menu de partage de l'appareil (s'il en a un), et « Copier le
  lien », qui dit « Lien copié »
- Et si le menu de l'appareil tombe en panne (pas une simple annulation) : « Impossible d'ouvrir le
  partage. Copie le lien à la place. »
- Et le lien ne contient que l'adresse du projet : rien sur le membre qui partage
- Étant donné l'auteur d'un projet privé : le bandeau dit « Ce projet est privé : le lien ne
  s'ouvrira que pour toi. », et « Copier le lien » dit « Lien copié : il ne s'ouvrira que pour
  toi. »
- Étant donné l'auteur d'un projet retiré par la modération : ni Partager ni « Copier le lien »
- Étant donné une personne connectée qui ouvre ce lien : le projet s'ouvre
- Étant donné une personne non connectée : elle se connecte, puis arrive sur le projet
- Et la page d'un membre a le même bouton Partager, avec la même feuille

### Le menu « … » et « Signaler » (F-Pr12)

- Le menu « … » de la photo propose « Copier le lien » et « Signaler ce projet » (pour l'auteur :
  « Copier le lien » et « Modifier »)
- Et un lien gris « Signaler ce projet » en bas de la page, qui ouvre le signalement d'aujourd'hui

### « Le prompt de départ » et ses protections (F-Pr2, F-Pr10, F-Mod4, planche `R5a-Projet-Suite`)

**La section**
- Étant donné un projet avec trois prompts
- Alors après la description, une section « Le prompt de départ » montre le premier, en police à
  chasse fixe, avec un bouton « Copier »
- Quand il touche « Copier »
- Alors le prompt est copié, le bouton dit « Copié » (lu « Prompt de départ copié ») et une bulle
  « Prompt copié » apparaît
- Et toujours, repère ou non : « Relis-le avant de t'en servir. Ne donne jamais à une IA ton mot
  de passe, une clé ou un code reçu. »
- Et les deux autres sont repliés sous « Les autres prompts · 2 », chacun avec son « Copier »
- Et un projet sans prompt n'a pas cette section

**Les caractères invisibles**
- Étant donné un prompt qui contient des caractères invisibles (espaces de largeur nulle, marques
  de sens d'écriture, caractères « tag »)
- Quand l'auteur l'enregistre
- Alors le serveur les retire
- Et un prompt plus ancien qui en contient encore est copié sans eux

**« À lire avant de l'utiliser »**
- Étant donné un prompt qui contient une commande (« curl », « sudo », « rm -rf », « | sh »,
  PowerShell…), un lien, un long bloc codé (base64) ou des informations à garder pour soi (mot de
  passe, clé, code, données bancaires…), même coupés par un caractère invisible
- Alors au-dessus du prompt, la pastille ambre « À lire avant de l'utiliser » et la raison (« Il
  contient un lien. », « Il contient une commande. », « Il parle d'informations à garder pour soi
  (mot de passe, clé, code, données bancaires…). »)
- Et ce repère prévient, il ne garantit rien : un prompt sans repère n'est pas dit « sûr »

### La page de sortie et le portail (F-Out1, F-Out2, M6, planches `R5a-Portail`, `R5a-Portail-Nuit`)

- Quand il touche « Tester la démo »
- Alors le portail s'ouvre : la page quittée se floute, des anneaux de lumière sont aspirés vers le
  centre et la lumière tourne
- Et la page dit « Tu quittes Waiggle pour », le nom du site en gras et en entier
  (« carnet-cafes.vercel.app »), puis l'adresse complète en petit
- Et « La démo de Carnet de cafés, ajoutée par Léa Moreau », avec sa photo, quand le lien vient d'un
  projet que le membre peut voir (lu par l'API, jamais tiré de l'adresse de la page)
- Et l'encadré « Ce site n'est pas sur Waiggle. Waiggle ne vérifie ni son contenu ni qui le gère.
  N'y saisis jamais ton mot de passe Waiggle, et n'y entre des informations personnelles que si tu
  sais à qui tu les confies. »
- Et en bas, sur la feuille claire, « Ouvrir le site ↗ » en miel et « Rester sur Waiggle »
- Et un Retour en haut ; « Rester sur Waiggle » et Retour ramènent à la page quittée
- Et avec « Réduire les animations », le portail apparaît en fondu
- Et un lien venu d'ailleurs (description, outil) garde la même page, sans la ligne « La démo de »

### La page introuvable (F-404, planche `R5a-Introuvable`)

- Étant donné un projet supprimé, retiré, privé d'un autre membre ou d'un membre bloqué, ou une
  adresse fausse
- Alors la même page pour tous : des alvéoles de verre, la mascotte à la loupe, « Ce projet est
  introuvable », « Il a peut-être été supprimé, il n'est pas visible pour toi, ou le lien est
  incorrect. »
- Et un Retour en haut, et « Retour au fil » en bas
- Et rien ne permet de distinguer un projet caché d'un projet qui n'existe pas

### La page sur ordinateur (F-Pr13, planche `R5a-Projet-Desktop`)

- « Retour au fil » en haut à gauche, Partager et « … » en haut à droite
- À gauche, la galerie aux coins arrondis et la capsule ; à droite, le statut, le titre, la date,
  l'auteur, l'accroche, « Tester la démo » et « Suivre ce projet » côte à côte, puis « La recette »
  (les outils, et le temps passé jusqu'à R6)
- Sous la ligne : à gauche la description, « Le prompt de départ », le journal et « Signaler ce
  projet » ; à droite les commentaires d'aujourd'hui (redessinés en R5b)

### Le parcours d'un membre

- Le parcours (`journey`) gagne : un membre ouvre le projet d'un proche, passe à la 2e photo, pose
  « Waggle ! » par la capsule, copie le prompt de départ (« Prompt copié »), suit l'auteur depuis la
  page, touche « Tester la démo », lit « La démo de … par … » sur la page de sortie et revient par
  « Rester sur Waiggle »

### Les choix de Louis (1/11/2026)

1. **Venus des listes**, parce qu'ils touchent la page projet : (a) le projet à 768 px, la mise en page de téléphone étirée et « Tester
   la démo » de 720 px (la tablette de 768 à 1024 px) ; (b) l'ordre de Tab sur ordinateur : la
   colonne de droite après tout le contenu.
2. **Partager un profil** (F-Mb1) dans R5a : oui, même bouton et même feuille.
3. **Les commentaires sur ordinateur** passent dès R5a dans la colonne de droite, tels quels.
4. **Le temps passé** reste dans « La recette » jusqu'à R6.
5. **« Waggle ! »** : seul le nom affiché et l'icône changent ; le nom interne `bravo` reste (pas de
   migration).
6. **L'aide de l'éventail** : retenue sur l'appareil (une fois par appareil, pas par compte).
7. **Partager** : une feuille de Waiggle (avec le bandeau), puis le menu de l'appareil ; pas le menu
   de l'appareil directement, qui ne peut pas montrer le bandeau.

---

## RF — La fluidité (entre R5a et R5b)

Statut : **validé par Louis** le 2/11/2026, tel quel (liste T1 à T13 comprise).

Demandée par Louis le 2/11/2026 après R5a, depuis son expérience sur ordinateur : naviguer dans
Waiggle doit donner une impression de continuité, sans coupure entre deux pages, et les textes ne
disent plus ce que l'écran montre déjà. Aucun contrat d'API ne change ; aucune règle métier non
plus.

Ce qui existe aujourd'hui : chaque écran pose sa propre lumière d'ambiance (`ui/Screen.tsx`), qui
repart de zéro à chaque page ; la barre du haut (`navigation/TopNav.tsx`, tablette et ordinateur
seulement) défile avec la page ; sur le web, une page remplace l'autre d'un coup. Sur téléphone, il
n'y a pas de barre du haut : la barre d'onglets du bas est déjà fixe.

**La lumière continue d'une page à l'autre**
- Étant donné un membre qui passe du Fil à Explorer, puis à la page d'un projet
- Alors la lumière d'ambiance ne s'éteint pas et ne repart pas de zéro : c'est la même lumière,
  posée une seule fois derrière toutes les pages, qui continue de couler
- Et quand la nouvelle page a une autre source (la photo du projet), la lumière glisse vers ses
  couleurs, en une fraction de seconde, au lieu de changer d'un coup
- Et au retour, elle glisse vers les couleurs de la page retrouvée
- Et sur le miel vif (connexion, inscription), le miel remplace toujours la lumière, comme avant
- Et avec « Réduire les animations », la lumière garde ses couleurs mais reste immobile ; le
  changement de couleur devient un simple fondu (WCAG 2.2.2)
- Et sur téléphone, c'est la même règle, avec la lumière allégée

**La barre du haut reste en place (tablette et ordinateur)**
- Étant donné un membre sur ordinateur qui fait défiler une longue page (le Fil, un projet)
- Alors la barre du haut (logo, Fil · Explorer · Ruches, recherche, cloche, Moi, Publier) reste
  fixée en haut de la fenêtre
- Et le contenu passe dessous, flouté par son verre ; rien n'est caché derrière elle (la page
  réserve sa hauteur, et un champ qui reçoit le focus ou un lien vers un endroit de la page
  s'arrête sous elle)
- Et d'une page à l'autre, la barre ne bouge pas : seule la goutte du lien actif glisse
- Et le bandeau d'un compte suspendu reste sous la barre, fixé avec elle
- Sur téléphone, rien ne change : pas de barre du haut, la barre d'onglets du bas est déjà fixe
  (une barre du haut fixe mangerait la hauteur d'un petit écran)

**Les pages apparaissent en fondu**
- Étant donné un membre qui touche un lien dans l'appli web (ordinateur, tablette ou téléphone)
- Alors le contenu de la page quittée s'efface et celui de la nouvelle apparaît en fondu, en 150 à
  200 ms, au lieu de la coupure d'aujourd'hui
- Et la barre du haut et la lumière, qui ne changent pas, ne clignotent pas : seul le contenu
  change
- Et la page d'un projet ouverte depuis une carte garde son passage d'R4 (la photo de la carte
  grandit jusqu'à la page) ; le fondu ne s'y ajoute pas
- Et une page ouverte directement (lien reçu, rechargement) s'affiche tout de suite : le HTML
  pré-rendu n'est jamais invisible, pour une connexion lente comme pour un moteur de recherche
- Et avec « Réduire les animations », le fondu reste (un fondu n'est pas un déplacement)
- Et dans l'appli de téléphone (iOS, Android), la pile garde son glissement natif, attendu sur ces
  appareils
- Et le focus du clavier et du lecteur d'écran arrive sur la nouvelle page comme avant

**Les textes ne répètent plus ce qui se voit**
- Étant donné un état vide, une fin de liste ou une confirmation
- Alors une phrase qui redit le titre, ou ce que l'écran montre déjà, disparaît ; la phrase qui
  apprend quelque chose (quoi faire, ce qui va se passer, qui voit quoi) reste
- Et une phrase exigée par une relecture juridique ou d'accessibilité reste, même si elle semble
  évidente (par exemple « Si un compte existe pour cette adresse… »)
- Et les textes retirés le sont en français et en anglais, avec les tests et les captures qui les
  citent

La liste, phrase par phrase, à valider par Louis (✂ retirer, ✎ raccourcir, ✓ garder) :

| # | Où | Aujourd'hui | Proposé |
| --- | --- | --- | --- |
| T1 | Fil, sphère « à jour » | « Tu es à jour » / « Tu as tout vu depuis ta dernière visite. » (« Tu as tout vu. » au premier passage) | ✂ la deuxième phrase, dans les deux cas |
| T2 | Fil, même sphère | « Les nouveautés s'afficheront en haut du fil. » | ✓ garder (dit où regarder) |
| T3 | Fil, bas de la liste | « Tu es à jour » | ✂ retirer : la sphère le dit déjà plus haut ; la liste finit, sans phrase |
| T4 | Bas des commentaires, des notifications, des membres bloqués, de la modération | « C'est tout » | ✂ retirer : la fin de la liste se voit |
| T5 | Page d'un outil, vide | « Encore aucun projet ici » / « Aucun projet public fait avec cet outil pour l'instant. Le tien sera peut-être le premier. » | ✎ « Le tien sera peut-être le premier. » seul sous le titre |
| T6 | Page d'un outil, sous-titre | « Les projets publics faits avec cet outil, du plus récent au plus ancien. » | ✎ « Les projets publics faits avec cet outil. » |
| T7 | Tous les outils, sous-titre | « Les outils des projets publics, par ordre alphabétique. » | ✎ « Les outils des projets publics. » |
| T8 | Ma page, sans projet | « Tu n'as encore rien publié. Ton premier projet apparaîtra ici. » | ✎ « Tu n'as encore rien publié. » |
| T9 | Formulaire de projet, aperçu | « Aperçu dans le fil » / « Il suit ce que tu écris. » | ✂ la deuxième phrase |
| T10 | Supprimer son compte, sous-titre | « Voici ce qui disparaît avec lui. » (suivi de la liste) | ✂ retirer : la liste suit, avec son titre |
| T11 | Journal vide (auteur) | « Pas encore de note. Raconte où en est ton projet : tes abonnés la verront dans leur fil. », puis l'aide du champ « … Tes abonnés la verront dans leur fil. » | ✎ l'état vide garde « Pas encore de note. » ; l'aide du champ garde le reste |
| T12 | Fil « Découvrir », légende | « Les derniers projets publiés par les membres. » | ✓ garder (dit l'ordre et la source, que l'onglet ne dit pas) |
| T13 | Notifications, vide | « Pas encore de notification » / « Quand un membre réagira à tes projets… tu le liras ici. » | ✓ garder (dit ce qui arrivera) |

La liste complète vient au plan : un passage sur toutes les pages (captures de téléphone et
d'ordinateur, jour) relève chaque état vide, fin de liste et confirmation ; les phrases trouvées en
plus suivent la même règle et reviennent à Louis avant le code.

**Repris des listes « À reprendre »**
- Le bouton des nouveautés du Fil, aujourd'hui hors de vue dès qu'on descend : sur ordinateur, il
  reste visible sous la barre fixe, et le toucher remonte en haut du fil

---

## R5b — Les commentaires

Statut : **validé par Louis** le 4/11/2026, tel quel, avec les six choix proposés (conversation 1
de R5b).

R5b redessine les commentaires de la page d'un projet (planches `R5b-Commentaires`,
`R5b-Repondre`, `R5b-Menu-Etats`, et le bas de `R5a-Projet-Nuit` et `R5a-Projet-Desktop` ;
décisions B6 « Les commentaires », F-Pr11 et F-Co8) : l'aperçu sur la page, la feuille des
commentaires, le menu « … » de chaque commentaire, le badge Auteur, son commentaire sur fond gris,
le trait vers les réponses, « Répondre » sous chacun, le bandeau « Réponse à X », les mentions en
pastille et leurs suggestions, le compteur près de la limite, et les états (masqué, supprimé,
retiré, bloqué). Les règles d'aujourd'hui ne changent pas : qui voit quoi, qui modifie, supprime,
masque ou signale, les fils sur un seul niveau, 1 000 caractères, 5 mentions au plus, les quotas.

Côté API, deux ajouts : le nom des membres mentionnés (la pastille l'affiche), et des suggestions
de mention qui cherchent aussi dans les noms, sans tenir compte des accents.

Hors de R5b, et où ça va :
- « Voir en contexte » depuis une notification (ouvrir la feuille sur le commentaire visé) : R8 ;
- le motif « Lien, démo ou prompt dangereux » et « Signaler » dans une feuille en deux étapes : R9 ;
- les commentaires d'un projet public vus par un visiteur (une phrase à la place) : R12.

### L'aperçu sur la page (F-Pr11, planches `R5a-Projet-Nuit`, `R5a-Projet-Desktop`)

- Étant donné un membre sur la page d'un projet qui a 6 commentaires, sur téléphone
- Alors sous les mises à jour, le titre « Commentaires 6 » (le nombre en gris, comme « Les autres
  prompts · 2 »)
- Et les 3 premiers commentaires, dans l'ordre de la feuille (les fils les plus récents d'abord,
  chacun suivi de ses réponses), sans « Répondre » ni menu « … » ; seulement des commentaires
  visibles de tous (un masqué, un retiré ou un emplacement reste dans la feuille, pas dans l'aperçu)
- Et le bouton « Voir les 6 commentaires », qui ouvre la feuille
- Et toucher un commentaire de l'aperçu ouvre aussi la feuille
- Et sur ordinateur, dans la colonne de droite : 5 commentaires au plus, « Voir les 6
  commentaires », puis le champ « Écrire un commentaire » et « Envoyer », avec l'aide d'aujourd'hui
  dessous (qui lira le commentaire)
- Et un projet sans commentaire montre « Commentaires », « Aucun commentaire pour l'instant. » et
  le bouton « Écrire un commentaire », qui ouvre la feuille, le champ prêt à écrire (sur
  ordinateur, le champ de la colonne suffit)
- Et sur son projet privé, l'auteur lit à la place de « Aucun commentaire pour l'instant. » :
  « Aucun commentaire à lire pour l'instant. Ceux que d'autres membres auraient laissés sont gardés :
  aucun membre, toi compris, ne les lit tant que le projet reste privé. » ; la bannière du projet privé ne lui dit plus qu'il les voit (décision D4,
  relecture du plan)
- Et un projet qui a 3 commentaires ou moins (5 sur ordinateur) n'a pas de « Voir les… » sur
  téléphone : le bouton devient « Commenter », qui ouvre la feuille

### La feuille des commentaires (planche `R5b-Commentaires`)

- Quand il touche « Voir les 6 commentaires »
- Alors une grande feuille monte par-dessus la page floutée : une poignée, « Commentaires 6 » et un
  bouton Fermer
- Et les fils, les plus récents d'abord ; sous chaque racine, ses réponses, reliées par un trait
  arrondi qui part de la racine
- Et chaque commentaire : la photo et le nom de son auteur, la date relative (« il y a 3 h »,
  « hier », « lundi »), « modifié » s'il l'a été, le texte, « Répondre » dessous, et le menu « … » à
  droite
- Et le badge « Auteur » à côté du nom de l'auteur du projet
- Et ses propres commentaires sur un fond gris arrondi
- Et en bas, fixé, le champ compact : sa photo, « Écrire un commentaire », et le bouton d'envoi
  (une flèche) grisé tant que le champ est vide ; dessous, l'aide d'aujourd'hui, qui dit qui lira :
  « Tous les membres connectés liront ton commentaire. », ou celle d'une réponse, d'une
  modification, d'un commentaire masqué ou d'un projet privé (les six aides d'aujourd'hui gardées)
- Et au-delà de 20 fils, « Afficher la suite » au bout de la liste
- Et la feuille se ferme par Fermer, en la glissant vers le bas, par Échap ou Retour, et rend le
  focus au bouton qui l'a ouverte
- Et un texte commencé et pas envoyé est gardé si la feuille se ferme, et retrouvé à sa
  réouverture (tant qu'on reste sur la page)
- Et avec « Réduire les animations », la feuille apparaît en fondu au lieu de monter
- Et sur ordinateur, « Voir les 6 commentaires » déroule toute la liste dans la colonne de droite,
  sans feuille (choix 1)

### Écrire et envoyer

- Quand il écrit, puis touche la flèche
- Alors son commentaire apparaît en tête de la liste, sur fond gris, et le champ se vide
- Et le nombre du titre monte, dans la feuille comme sur la page
- Et à partir de 900 caractères, un compteur « 962 / 1000 » apparaît sous le champ ; au-delà de
  1 000, il passe en rouge et l'envoi est refusé avec la raison
- Et le champ grandit avec son texte jusqu'à 5 lignes, puis défile
- Et une erreur (réseau, quota) s'affiche au-dessus du champ, le texte est gardé, et « Réessayer »
  renvoie

### Répondre (planche `R5b-Repondre`)

- Quand il touche « Répondre » sous le commentaire de Léa Moreau
- Alors le commentaire de Léa est surligné en miel pâle, et au-dessus du champ un bandeau
  « Réponse à **Léa Moreau** » avec une croix qui annule
- Et le champ reçoit le focus, le clavier s'ouvre
- Et sa réponse s'ajoute au bout du fil de Léa
- Et « Répondre » sous une réponse (celle de Papi Jean, dans le fil de Léa) répond dans le même fil,
  et le champ commence par la mention de Papi Jean, pour qu'on sache à qui il répond
- Et sur son propre commentaire, « Répondre » répond dans le fil, sans mention
- Et sur un commentaire masqué, supprimé, retiré ou d'un membre bloqué, pas de « Répondre »
  (comme aujourd'hui)

### Les mentions (F-Co8, planche `R5b-Repondre`)

**Les suggestions**
- Quand il tape « @Lé » dans le champ
- Alors au-dessus du champ, « Mentionner quelqu'un » propose 5 membres au plus : Léa Moreau et Hugo
  Lefèvre, chacun avec sa photo, son nom, son pseudo dessous, et les lettres tapées en gras
- Et la recherche ignore les accents et les majuscules, et trouve le début du nom, d'un mot du nom
  ou du pseudo (« @le » trouve aussi Léa et Lefèvre) ; un mot commence après une espace, un tiret ou
  une apostrophe (« @pie » trouve Jean-Pierre ; décision D2)
- Et les proches d'abord (l'auteur du projet, ceux qui l'ont commenté, ceux qu'il suit), comme
  aujourd'hui
- Et les flèches du clavier passent d'une suggestion à l'autre, Entrée choisit, Échap ferme la
  liste sans fermer la feuille
- Quand il choisit Léa
- Alors « @lea_moreau » est écrit dans le champ, suivi d'une espace

**La pastille**
- Étant donné un commentaire publié qui mentionne Léa
- Alors la mention s'affiche en pastille miel avec son nom, « @Léa Moreau »
- Et le nom suit la personne : si elle change de nom, la pastille aussi
- Et toucher la pastille ouvre la page de Léa ; le lecteur d'écran lit « Léa Moreau, ouvre son
  profil » (sans pseudo : le pseudo écrit peut être devenu celui d'un autre ; décision D3)
- Et un pseudo qui ne désigne personne (ou un membre bloqué, dans un sens ou dans l'autre) reste du
  texte simple, comme aujourd'hui

### Le menu « … » (planches `R5b-Commentaires`, `R5b-Menu-Etats`)

- Sur son propre commentaire : « Modifier » et « Supprimer » (en rouge)
- Sur le commentaire d'un autre, sur son propre projet : « Masquer » et « Signaler »
- Sur le commentaire d'un autre, ailleurs : « Signaler »
- Et le lecteur d'écran lit le bouton « Actions du commentaire de Léa Moreau »
- Et le menu se ferme par un toucher à côté, Échap ou Retour, et rend le focus à « … »

**Modifier**
- Quand il touche « Modifier »
- Alors le texte passe dans le champ du bas, avec un bandeau « Modifier ton commentaire » et une
  croix qui annule, et le commentaire est surligné
- Et l'envoi remplace le texte ; « modifié » apparaît à côté de la date

**Supprimer**
- Quand il touche « Supprimer »
- Alors la fenêtre de confirmation d'aujourd'hui s'ouvre (« Supprimer ce commentaire ? ») ;
  confirmer le supprime, et le nombre du titre descend
- Et une racine qui a des réponses devient « Commentaire supprimé », comme aujourd'hui

**Masquer et démasquer** (pour l'auteur du projet)
- Quand l'auteur du projet touche « Masquer » sur le commentaire de Hugo
- Alors le commentaire reste à sa place pour lui, en gris, avec la pastille « Masqué par toi »,
  « Il ne reste visible que de toi et de la personne qui l'a écrit. » et le lien « Démasquer »
- Et Hugo, lui, voit encore son commentaire, avec « Masqué par l'auteur du projet » et « Il ne reste
  visible que de toi et de l'auteur du projet. »
- Et les autres membres voient à sa place « Commentaire masqué », s'il a des réponses (comme
  aujourd'hui)

**Signaler**
- Quand il touche « Signaler »
- Alors le signalement d'aujourd'hui s'ouvre sur ce commentaire

### Les états (planche `R5b-Menu-Etats`)

- Un commentaire supprimé qui a des réponses : une icône de bulle et « Commentaire supprimé »
- Retiré par la modération : une icône de bouclier et « Contenu retiré par la modération » (et pour
  son auteur, l'encadré de retrait d'aujourd'hui)
- D'un membre qu'il a bloqué : une icône d'interdiction et « Commentaire d'un membre que tu as
  bloqué »
- D'un membre qui l'a bloqué : « Commentaire indisponible »
- Et ces lignes n'ont ni nom, ni date, ni « Répondre », ni menu ; leurs réponses restent dessous,
  avec le trait
- Et un commentaire long se replie après 10 lignes, avec « Lire la suite » (repris des listes)

### Les gardes reprises

- Un double toucher sur l'envoi n'envoie qu'un commentaire ; sur « Supprimer », une seule
  suppression
- Pendant un envoi, la feuille ne se ferme pas d'un glissement accidentel
- Un membre suspendu lit les commentaires, mais n'a ni champ ni « Répondre » ; le bandeau de
  suspension le dit (comme aujourd'hui)
- Et sous l'aperçu, dès un commentaire, il a « Voir les N commentaires », qui ouvre la feuille en
  lecture seule, jamais « Commenter » ; sans commentaire, le titre et « Aucun commentaire pour
  l'instant. », sans bouton
- Le focus du clavier ne se perd jamais : après un envoi, il reste dans le champ ; après une
  suppression, il va au commentaire voisin ; à la fermeture d'un bandeau, dans le champ
- Après un envoi, « Commentaire publié. » est seulement lu par les lecteurs d'écran ; après une
  suppression, « Ton commentaire a été supprimé. » aussi : aucun encadré, le commentaire qui apparaît
  ou disparaît le montre déjà
- Les textes suivent la taille de texte de l'appareil ; à 200 % et 320 px, « Commentaires 6 » ne se
  coupe pas au milieu d'un mot (repris des listes)

### Le parcours d'un membre

- Le parcours (`journey`) passe par la feuille : Sam ouvre « Voir les … commentaires », commente en
  mentionnant l'auteur par la suggestion, Léa répond par « Répondre », puis masque le commentaire de
  Sam par le menu « … » ; le reste du parcours (signalement, blocage) passe aussi par le menu

### Repris des listes « À reprendre »

- « Commentaires (7) » coupé au milieu du mot à 200 % de texte et 320 px
- Replier un commentaire long après une dizaine de lignes (« Lire la suite »)
- Les états `errorAction` de `CommentCard` au catalogue
- Sur téléphone, le focus du lecteur d'écran qui ne revient pas à « … » quand le menu se ferme
  (pour le menu d'un commentaire)

### Les choix de Louis (4/11/2026)

1. **Sur ordinateur, « Voir les 6 commentaires »** : la liste se déroule dans la colonne de droite,
   où le champ est déjà ; pas de feuille par-dessus la page.
2. **L'aperçu** : les 3 (ou 5) premières lignes de la feuille, réponses comprises.
3. **Répondre à une réponse** : le champ commence par la mention de la personne.
4. **Le compteur** : à partir de 900 caractères.
5. **Modifier** : dans le champ du bas, avec un bandeau, comme Répondre.
6. **« Lire la suite »** après 10 lignes : dans R5b.

Après la relecture du plan (sécurité, juridique, interface ; Louis, 4/11/2026 vers 23 h 55) :

7. **D1, glisser la feuille** : toutes les feuilles se ferment en les glissant vers le bas, sauf
   pendant un envoi.
8. **D2, les mots du nom** : un mot commence après une espace, un tiret ou une apostrophe.
9. **D3, la pastille lue** : le nom seul, « Léa Moreau, ouvre son profil ».
10. **D4, le projet privé** : la bannière et l'état vide corrigés dans R5b (l'auteur d'un projet
    privé ne lit pas les commentaires des autres).

Pendant l'assemblage (Louis, 6/11/2026) :

11. **Après un envoi ou une suppression** : l'avis est seulement lu par les lecteurs d'écran, sans
    encadré.
12. **Le membre suspendu** : « Voir les N commentaires » dès un commentaire, sans bouton s'il n'y en
    a aucun.
13. **Le glisser de la feuille** : au toucher seulement ; à la souris, « Fermer », Échap et le voile.
14. **Un commentaire supprimé gardé pour ses réponses** n'a plus de date, comme le dit « ni nom, ni
    date ».

Après les relectures de la branche (Louis, 7/11/2026) :

15. **La feuille de jour** est crème et opaque, comme la planche, sur toutes les feuilles ; la nuit ne
    change pas.
16. **Un emplacement n'a plus de date, dans l'API non plus** : `createdAt` vaut `null` pour un
    commentaire supprimé, masqué, retiré, bloqué ou indisponible.
17. **Répondre depuis la colonne** : le bandeau rappelle un extrait d'une ligne, sur ordinateur
    seulement, puisque la carte visée peut être hors de l'écran.
18. **La densité** : les écarts se réduisent pour montrer 4 commentaires par écran à 390 × 844, zones
    à toucher de 44 points gardées.
19. **Les fenêtres basses** : la légende se réduit à la phrase qui dit qui lira.
20. **La photo en mode réponse** : gardée dès 360 px, retirée en dessous, où le champ serait trop
    étroit.
21. **Gardés** : le texte sous le nom et plus de trait entre les fils ; « Envoyer » de la colonne en
    blanc ; le glisser limité à la tête de la feuille ; sur ordinateur, à 5 commentaires ou moins, la
    liste complète plutôt que l'aperçu.
22. **Les textes vrais** : un compteur à zéro n'est pas « aucun » pour qui lit un commentaire non
    compté ; un projet retiré n'a ni champ ni audience (« Aucun commentaire à lire pendant le retrait
    du projet… ») ; un suspendu lit dans la feuille pourquoi il n'y a pas de champ ; sur un projet
    privé, un emplacement dit « Commentaire gardé tant que le projet est privé » plutôt que
    « masqué » ; le réglage de recherche dit qu'on te trouve aussi après « @ ».

- Et les textes de masquage disent qui voit encore le commentaire, et les aides sous le champ
  restent celles d'aujourd'hui (relecture juridique).

---

## R6a — La feuille de publication

Statut : **validé par Louis** le 8/11/2026, tel quel, avec les huit choix proposés (conversation 1
de R6a).

R6 est coupée en deux (Louis, 8/11/2026), comme R5 : **R6a**, la feuille de publication et la
modification ; **R6b**, les outils et les catégories (le catalogue). R6a redessine la publication
et la modification d'un projet (planches `R6-Publier`, `R6-Publier-Suite`, `R6-Publier-Outils`,
`R6-Publier-Desktop`, `R6-Modifier`, `R6-Supprimer`, `R6-Danse` ; décisions B4 « Publier et
modifier », F-Pr14 et « Les catégories ») : une feuille qui monte du bas sur téléphone, une
fenêtre par-dessus le fil sur ordinateur, les tuiles des photos et leur description, les
catégories, « Facile à refaire ? » et « Commencé en » à la place du temps passé, le compteur et la
clé d'API repérée dans le prompt, « Lien valide », l'aperçu de la carte, « Enregistrer » grisé, la
suppression depuis le formulaire, et la danse de publication.

Les règles d'aujourd'hui ne changent pas, sauf celles que cette section nomme : qui modifie et
supprime, les limites des textes (titre 80, pitch 140, description 10 000, 15 outils, 5 prompts de
4 000 caractères), les photos (6 au plus, JPEG, PNG ou WebP de 5 Mo, ré-encodées sans
métadonnées), le lien de démo (`https://` et public, **jamais ouvert par le serveur** : décision
de Louis du 8/11/2026), les quotas, et ce que voit un membre suspendu.

Côté API : deux catégories (une principale, une seconde facultative), « Facile à refaire ? »,
« Commencé en », la description de chaque photo ; le temps passé disparaît.

Hors de R6a, et où ça va :
- le catalogue normé des outils, leurs logos et leurs familles, l'outil « Autre », la page d'un
  outil redessinée (filtres par statut et par catégorie, « Afficher la suite »), les catégories en
  filtre dans Explorer et dans la recherche, le récap du lundi des « Autre » aux administrateurs,
  et les restes de R5b (« fais tout », 8/11/2026) : **R6b**. En R6a, « Outils » veut dire les
  étiquettes libres d'aujourd'hui ;
- « Une ruche » dans « Qui peut le voir ? » : R10 ; « Public, trouvable sur Google » : R12
  (décision de Louis du 8/11/2026 : R6a ne montre que les deux choix qui marchent) ;
- « Ce qui a changé », la version, l'avant / après : R7 ;
- les badges par catégorie (« Explorateur du jardin ») : après la refonte ;
- le motif de signalement « Lien, démo ou prompt dangereux » : R9.

### Ouvrir la feuille (F-Pub1, planches `R6-Publier`, `R6-Publier-Desktop`)

- Étant donné un membre sur téléphone, sur n'importe quel onglet
- Quand il touche « + » au milieu de la barre
- Alors une grande feuille monte du bas par-dessus l'écran flouté : une poignée, « Annuler » à
  gauche, « Nouveau projet » au milieu, « Publier » à droite
- Et sur ordinateur, « Publier » de la barre du haut ouvre une fenêtre au milieu, par-dessus le fil
  flouté : « Nouveau projet », « Montre à tes proches ce que tu construis. Tu pourras tout modifier
  ensuite. », le formulaire à gauche et l'aperçu à droite
- Et ouvrir directement l'adresse de publication (un lien, un rechargement) ouvre la même feuille
  par-dessus le fil
- Et la feuille se ferme par « Annuler », en la glissant vers le bas (au toucher), par Échap ou
  Retour, et rend le focus au bouton qui l'a ouverte
- Et si quelque chose a été écrit ou choisi, fermer demande d'abord « Abandonner ce projet ? »,
  « Rien n'a encore été envoyé : ce que tu as écrit et les photos choisies seront perdus. »
  (« Continuer » / « Abandonner »), et rien n'est perdu sans cette réponse (choix 1)
- Et avec « Réduire les animations », la feuille apparaît en fondu au lieu de monter
- Et un membre suspendu n'a ni « + » ni « Publier » (comme aujourd'hui) ; s'il ouvre l'adresse, il
  lit pourquoi il ne peut pas publier, sans jamais voir le formulaire d'abord (repris des listes)

### Les photos (F-Pub2 à F-Pub5, planches `R6-Publier`, `R6-Publier-Desktop`)

- Étant donné la feuille ouverte
- Alors en tête, « Photos 0 / 6 » et une tuile « + Ajouter » en pointillés
- Quand il touche « + Ajouter »
- Alors il choisit plusieurs photos d'un coup, jusqu'à compléter les 6
- Et chaque photo devient une tuile : une poignée en haut à gauche pour la déplacer, une croix en
  haut à droite pour la retirer (« Retirer la photo 2 »), et le badge « Couverture » sur la première
- Et sous les tuiles : « JPEG, PNG ou WebP, 5 Mo au plus. » et « La première sert de couverture :
  fais glisser une photo pour changer l'ordre. »
- Et une photo en cours d'envoi montre sa progression ; une photo refusée (trop lourde, mauvais
  format, 6 déjà) dit pourquoi sous sa tuile, et les autres continuent
- Et il change l'ordre en faisant glisser une tuile ; un lecteur d'écran ou un clavier le fait par
  les actions de la tuile (« Mettre en couverture », « Avancer », « Reculer »), sans glisser
- Et sur ordinateur, une zone en pointillés : « Glisse tes images ici, ou choisis-les » ; déposer
  des fichiers les ajoute comme le bouton
- Et la couverture verticale du téléphone reste possible : « Couverture verticale, facultative »
  (comme aujourd'hui)

**La description de chaque photo** (nouveau) :
- Quand il touche une tuile, elle s'entoure de miel
- Alors dessous, « Description de la photo 1, facultative », et l'aide « Lue à voix haute par les
  lecteurs d'écran, pour chaque personne qui voit le projet. Ne nomme personne sans son accord. »
  (texte du juridique)
- Et 250 caractères au plus, sans caractères invisibles
- Et sur la page du projet, un lecteur d'écran lit cette description à la place de « Photo 1 sur 3 »
  quand elle existe

### Le titre, l'accroche, la description et le lien (F-Pub8)

- Le titre (« Titre », compteur « 18 / 80 »), « En une phrase » (compteur « 65 / 140 ») et la
  description (« Mise en forme Markdown : **gras**, *italique*, listes, [liens](https://…). ») gardent
  leurs règles
- Le lien : « Lien de la démo, facultatif »
- Quand il a tapé une adresse https publique
- Alors une coche se dessine, avec « Lien valide », et dessous « Waiggle n'ouvre pas ce site et ne
  vérifie pas son contenu. » (texte du juridique)
- Et « valide » veut dire la forme seulement : https, et une adresse publique ; ni l'appli ni le
  serveur n'ouvrent le site (décision de Louis du 8/11/2026)
- Et une adresse refusée dit pourquoi, comme aujourd'hui, sans coche

### Où en est le projet (F-Mod6)

- « Où en est le projet ? » : Idée, En construction, Testable, Terminé, En pause, Idée par défaut
- Et les pastilles passent à la ligne aux grandes tailles de texte, sans être coupées

### Catégorie et outils (planche `R6-Publier-Outils`, décisions « Les catégories »)

- Étant donné la feuille, sous le statut, la ligne « Catégorie » et la ligne « Outils »
- Quand il touche « Catégorie »
- Alors une seconde feuille monte : « Catégorie et outils », « OK » à droite
- Et « Catégorie » : « Une principale, et une seconde si tu veux. », puis seize pastilles avec leur
  icône : Maison et jardin, Cuisine, Famille et enfants, Apprendre, Jeux, Art et dessin, Musique,
  Photo et vidéo, Santé et sport, Voyages, Argent et budget, Travail, Code et outils, Animaux,
  Sciences et espace, et Autre
- Quand il touche « Sciences et espace », puis « Apprendre »
- Alors « Sciences et espace » passe en miel avec un « 1 », « Apprendre » en miel pâle avec un « 2 »
- Et un lecteur d'écran lit « Sciences et espace, catégorie principale » et « Apprendre,
  catégorie seconde »
- Et toucher une catégorie choisie la retire ; si c'est la principale, la seconde prend sa place
- Et avec deux catégories choisies, toucher une troisième remplace la seconde (choix 2)
- Et « Autre » ne demande aucun texte
- Et dessous, « Outils 2 / 15 » : les outils choisis en pastilles avec une croix, et un champ de
  recherche ; il propose les outils déjà utilisés par les membres, avec leur nombre de projets
  (« Claude · 41 projets ») ; un nom absent s'ajoute tel quel (« Ajouter « Teachable Machine » »),
  comme aujourd'hui
- Et « OK » referme la seconde feuille ; dans le formulaire, « Catégorie » montre la principale,
  « Seconde, facultative » la seconde, et « Outils » ses pastilles et « Ajouter »
- Et la catégorie principale est obligatoire pour publier ; sans elle, « Publier » dit « Choisis
  une catégorie » sous la ligne « Catégorie » et y met le focus

### « Commencé en » et « Facile à refaire ? » (F-Pr14, F-Mod5)

- « Commencé en » : un mois et une année, facultatif (« mars 2026 ») ; pas après le mois en cours,
  pas avant janvier 2000
- « Facile à refaire ? » : trois pastilles, facultatives : « À la portée de tous » (pastille
  verte), « Il faut s'accrocher » (jaune), « Pour les initiés » (rouge) ; la couleur n'est jamais
  seule, le texte dit tout
- Et le temps passé disparaît partout : du formulaire, de « La recette », de l'API ; les valeurs
  déjà enregistrées sont effacées (décision F-Pr14) en R6b, pas en R6a, pour qu'un retour à la
  version d'avant reste possible (relecture du plan, sec-A6, décision de Louis du 8/11/2026)
- Et sur la page du projet, « La recette » montre « Commencé en mars 2026 » et « Facile à refaire :
  Il faut s'accrocher » quand l'auteur les a donnés

### Le prompt de départ (F-Mod4, planche `R6-Publier-Suite`)

- « Le prompt de départ », avec son compteur toujours visible (« 148 / 4 000 ») et l'aide « Retire
  ce qui est personnel : noms, adresses, mots de passe. »
- Quand il colle un texte qui contient des caractères invisibles
- Alors ils sont retirés, et la ligne « 2 caractères invisibles ont été retirés. » le dit
- Quand il colle un prompt qui contient une clé d'API (une forme connue : `sk-…`, `sk-ant-…`,
  `AKIA…`, `ghp_…`, `github_pat_…`, `xoxb-…`, `AIza…`, un jeton `Bearer`…)
- Alors un encadré sous le champ montre la clé masquée, « Clé : sk-proj…a91f », et dit « Une clé
  d'API est collée ici. Les membres qui liront ce prompt pourraient s'en servir à tes frais. », avec
  le bouton « Retirer la clé » (relecture du plan, ui-I9 : le champ ne surligne pas une partie de
  son texte)
- Et « Retirer la clé » la remplace par « [clé retirée] »
- Et en modification, pour une clé déjà enregistrée, l'encadré ajoute : « Si elle a déjà été
  visible, la retirer ne suffit pas : désactive-la chez son fournisseur. »
- Et il peut publier quand même : l'encadré prévient, il ne bloque pas (choix 3) ; à la lecture,
  le repère « À lire avant de l'utiliser » de R5a reconnaît aussi ces formes de clé
- Et la clé n'est jamais envoyée ailleurs ni gardée à part : le repérage se fait sur l'appareil, à
  l'écriture comme à la lecture
- Et « Les autres prompts » (4 de plus au plus) restent dans une partie repliable, avec les mêmes
  protections

### Qui peut le voir (F-Pub6, planche `R6-Modifier`)

- « Qui peut le voir ? », deux choix (décision de Louis du 8/11/2026) :
  - « Membres de Waiggle », « Toute personne qui a un compte. » (par défaut) ;
  - « Privé », « Un brouillon : aucun autre membre ne le voit. » (texte du juridique)
- Et une phrase en bas du formulaire dit qui le verra : « Les membres de Waiggle verront ce projet,
  et tes abonnés le trouveront dans leur fil. » ; en privé, pour un nouveau projet, « Aucun autre
  membre ne le verra. Tu pourras le montrer aux membres quand tu voudras. », et en modification ce
  que dit aujourd'hui l'aide « Privé » (personne d'autre ne le voit ; commentaires et réactions
  gardés, lus par personne tant qu'il reste privé ; ils reviendront s'il redevient visible des
  membres)
- Et « Public » n'est plus le nom de la visibilité des membres : le mot est gardé pour R12, « Public
  sur le web » (liste de conformité)

### L'aperçu de la carte (F-Pub7, planche `R6-Publier-Desktop`)

- Sur ordinateur, à droite, « Aperçu dans le fil », « Il suit ce que tu écris. »
- Et la carte du fil telle qu'elle sera : la vraie photo de profil de l'auteur, « à l'instant », la
  catégorie, le titre, l'accroche, le statut, « Tester » s'il y a un lien
- Et posée sur une scène sombre éclairée par la première photo : « La lumière autour de la carte
  vient de ta première photo. Change-la, elle change aussi. »
- Et sur téléphone, pas d'aperçu : la feuille garde la place pour écrire (choix 4)

### La catégorie sur les cartes et la page (décision « Catégorie sur la carte du fil »)

- Sur la carte du fil et d'Explorer : la catégorie principale, en étiquette de verre en haut à
  gauche de la photo, avec son icône ; sans photo, au-dessus du titre
- Sur la page du projet : la catégorie à côté du statut, la seconde après un point
  (« Sciences et espace · Apprendre »)
- Et un projet publié avant R6a n'a pas de catégorie : aucune étiquette (décision de Louis du
  8/11/2026)

### Publier et la danse (planche `R6-Danse`)

- Quand il touche « Publier » avec un projet visible des membres
- Alors le bouton reste occupé pendant l'envoi ; une seconde tape n'envoie rien
- Et la feuille se ferme, et le fil montre la danse : l'abeille du logo dessine son huit avec une
  traînée de miel, puis file vers la nouvelle carte, qui tombe en place en tête du fil
- Et un avis « Projet publié », avec la mascotte, lu aussi par les lecteurs d'écran
- Et avec « Réduire les animations », la carte apparaît en fondu, l'abeille ne vole pas
- Et un projet privé ne danse pas : la feuille se ferme sur la page du projet, avec « Brouillon
  enregistré. Aucun autre membre ne le voit. » (choix 5, texte du juridique)
- Et une erreur (réseau, quota) s'affiche en haut du formulaire, tout est gardé, « Publier » renvoie
- Et si une photo échoue après la création du projet : ni danse ni « Projet publié » ; la feuille
  de modification s'ouvre et dit quelles photos ajouter à nouveau, la description tapée gardée
  (relecture du plan, jur-J11)
- Et ses propres projets visibles des membres entrent dans son propre fil, à leur date, sans
  jamais compter dans les nouveautés (décision de Louis du 8/11/2026)

### Modifier (F-Mod1, planche `R6-Modifier`)

- Étant donné l'auteur sur la page de son projet
- Quand il touche « Modifier »
- Alors la même feuille (la même fenêtre sur ordinateur) : « Annuler », « Modifier le projet »,
  « Enregistrer »
- Et « Enregistrer » est grisé tant que rien n'a changé, avec « Rien à enregistrer pour
  l'instant. » sous l'en-tête ; il redevient actif dès un changement, et grisé si le changement est
  défait
- Et les photos, comme aujourd'hui, s'enregistrent tout de suite (ajout, retrait, ordre,
  description) ; « Enregistrer » vaut pour le reste (choix 6) ; sous « Photos », « Les photos
  s'enregistrent tout de suite. »
- Et abandonner les changements dit « Tes changements seront perdus. Les photos, elles, sont déjà
  enregistrées : elles restent comme tu les as laissées. »
- Et un projet sans catégorie (publié avant R6a) : la ligne « Catégorie » dit « Choisis une
  catégorie », et « Enregistrer » attend qu'elle soit choisie (décision de Louis du 8/11/2026) ;
  seul le passage en « Privé » n'en demande pas (relecture du plan, jur-J8, décision de Louis du
  8/11/2026 : restreindre l'audience ne demande jamais une donnée nouvelle)
- Et après « Enregistrer », la feuille se ferme sur la page, avec « Modifications enregistrées. »
- Et seul l'auteur modifie ; un autre membre qui ouvre l'adresse lit le refus d'aujourd'hui

### Supprimer (F-Mod2, F-Mod3, planche `R6-Supprimer`)

- En bas de la feuille de modification, une zone rouge : « Supprimer ce projet », et dessous
  « Aucun autre membre ne peut modifier ni supprimer ce projet. » (texte du juridique)
- Et dans le menu « … » de la page, pour l'auteur, « Supprimer » ; le gros bouton rouge de la page
  disparaît ; « Supprimer » reste au menu pour tout auteur, même d'un projet retiré ou pendant une
  suspension (sans « Modifier »)
- Quand il touche « Supprimer ce projet »
- Alors une fenêtre : la vignette du projet avec un badge de corbeille, « Supprimer « Le ciel de ce
  soir » ? », « Le projet, sa description, ses photos, ses prompts et ses notes disparaissent
  tout de suite, avec les commentaires et les réactions des autres membres. Impossible de revenir en
  arrière. » (texte du juridique ; R7 dira « mises à jour »), « Annuler » et « Supprimer »
- Et pour un projet retiré par la modération, la fenêtre ajoute que la décision de la modération et
  la copie du signalement restent gardées un an
- Et pendant la suppression, « Supprimer » reste occupé et la fenêtre ne se ferme pas ; une seconde
  tape n'envoie rien
- Et après, il arrive sur « Mes projets », avec « Projet supprimé. » (choix 7)
- Et Échap ou « Annuler » ferme la fenêtre et rend le focus à « Supprimer ce projet »

### Le parcours d'un membre

- Le parcours (`journey`) publie par la feuille : Léa ajoute trois photos d'un coup, décrit la
  première, choisit « Sciences et espace » puis « Apprendre », « Il faut s'accrocher », publie et
  voit sa carte en tête du fil ; puis elle modifie (« Enregistrer » grisé, puis actif), passe le
  projet en privé, et le supprime depuis la feuille
- Et Sam, suspendu, ouvre l'adresse de publication et lit pourquoi il ne peut pas publier

### Repris des listes « À reprendre »

- `ProjectFormScreen` montre le formulaire avant d'avoir lu le profil, puis l'écran du suspendu (un
  texte tapé se perd si le profil est lent) : le formulaire attend le profil (relecture de
  l'interface de 7c)
- Le mot « Public » pour « visible des membres connectés », à revoir face à « Public sur le web »
  (liste de conformité, R12) : il devient « Membres de Waiggle »

### Les choix de Louis (8/11/2026, validés tels quels)

1. **Fermer avec des changements** : « Abandonner ce projet ? » (« Continuer » / « Abandonner »),
   en publication comme en modification (« Abandonner les changements ? »).
2. **Une troisième catégorie** remplace la seconde, plutôt qu'un refus.
3. **La clé d'API** prévient sans bloquer la publication ; l'API ne la refuse pas.
4. **L'aperçu de la carte** : sur ordinateur seulement.
5. **Un projet privé** ne danse pas : la feuille se ferme sur sa page, « Brouillon enregistré. Aucun
   autre membre ne le voit. »
6. **Les photos en modification** s'enregistrent tout de suite, comme aujourd'hui ; « Enregistrer »
   vaut pour le reste.
7. **Après une suppression** : « Mes projets », avec « Projet supprimé. »
8. **La description d'une photo** : 250 caractères ; « Commencé en » : de janvier 2000 au mois en
   cours.

### Les décisions de Louis (8/11/2026)

- R6 coupée en R6a (la feuille de publication) et R6b (les outils et les catégories) ; les restes
  de R5b vont en R6b.
- « Qui peut le voir ? » : « Membres de Waiggle » et « Privé » seulement.
- « Lien valide » : la forme seulement ; le serveur n'ouvre jamais le lien.
- Les projets publiés avant R6a restent sans catégorie jusqu'à leur prochaine modification ;
  passer en « Privé » n'en demande pas (relecture du plan, jur-J8).
- Ses propres projets visibles des membres entrent dans son fil, à leur date, et ne comptent
  jamais dans les nouveautés.
- Relecture du plan : les textes du juridique remplacent ceux des planches (abandon, suppression,
  « Privé », clé d'API, description d'une photo) ; la colonne du temps passé s'efface en R6b.

---

## R6b — Les outils et les catégories

Statut : **validé d'avance par Louis** le 9/11/2026 vers 7 h 15 (délégation de la nuit : le
scénario suit ses quatre choix et les décisions déjà prises ; les choix que la session a faits
seule sont listés à la fin, pour son bilan).

R6b remplace les étiquettes libres des outils par un **catalogue normé** (planches `R3-Outils`,
`R6-Publier-Outils`, `R6-Outil`, `R6-Outil-Desktop`, `R6-Email-Autre` ; décisions F-Nav5, F-Et1 à
F-Et3 et « Les catégories »), avec un choix « Autre » relu par les
administrateurs ; elle redessine la page d'un outil, fait des catégories un filtre dans Explorer et
dans la recherche, donne aux administrateurs de quoi ranger les « Autre » et créer une catégorie,
efface la colonne du temps passé, et reprend les restes de R5b.

Les règles d'aujourd'hui ne changent pas, sauf celles que cette section nomme : 15 outils par
projet, 10 outils favoris par profil, un nom d'outil de 40 caractères au plus, ce que voit chacun
(un projet privé d'un autre membre, retiré, ou d'un membre bloqué n'est compté ni montré nulle
part), et les adresses des pages d'outils (`/tags/<nom>`), qui restent valables.

Hors de R6b, et où ça va :
- les vrais logos des outils : une PR à part, après la vérification du juridique (décision de
  Louis du 9/11/2026 : des lettres d'abord) ;
- prévenir l'auteur quand un administrateur range son projet ou rattache son outil : R8 (les
  notifications) ;
- renommer ou supprimer une catégorie, les badges par catégorie : après la refonte ;
- la mosaïque de tuiles sur la page d'un membre et dans « Récents » (F-Et5) : R10, avec les Ruches ;
- effacer les anciennes colonnes de texte des outils (projets et profils) : R7, une fois le
  retour en arrière vers R6a devenu inutile.

### Le catalogue

- Un outil du catalogue a un nom (« Claude »), une famille, une courte description en français et
  en anglais, et souvent l'adresse de son site
- Les familles : Assistants IA, Création (image, son, vidéo), Sans code, Développement,
  Automatisation, Maison connectée, Matériel et objets
- Son image est une **lettre** : l'initiale de son nom sur un carré de couleur, comme sur la
  planche `R6-Outil` (décision de Louis du 9/11/2026)
- Il peut avoir d'autres noms, ses **alias** (« Chat GPT » pour « ChatGPT ») : un alias tapé trouve
  l'outil
- Au lancement, le catalogue compte environ 120 outils connus (IA, développement, sans code,
  maison connectée, objets)

### Choisir ses outils (planche `R6-Publier-Outils`)

- Étant donné la feuille « Catégorie et outils » d'un projet, ou « Outils favoris » de son profil
- Quand il tape « clau » dans le champ des outils
- Alors les outils du catalogue dont le nom ou un alias contient ces lettres lui sont proposés,
  ceux qui commencent par elles d'abord, chacun avec sa lettre, sa famille et son nombre de projets
  (« Claude · Assistant IA · 41 projets ») ; les accents et les majuscules ne comptent pas
- Quand il touche « Claude »
- Alors Claude devient une pastille avec une croix, et le compteur dit « Outils 1 / 15 »
- Étant donné qu'il tape « Teachable Machine », absent du catalogue
- Alors la dernière proposition dit « Ajouter « Teachable Machine » comme autre outil »
- Quand il la touche
- Alors une pastille « Teachable Machine » s'ajoute, marquée « Autre », et une ligne dit « Les
  autres outils sont relus par les administrateurs : ils peuvent les ajouter au catalogue, ou les
  rattacher à un outil qui y est déjà. »
- Et pour un projet privé, la ligne dit « Projet privé : ce nom n'est montré à personne et n'est
  pas relu. S'il entre au catalogue grâce à un autre projet, le tien suivra. »
- Et tant que le catalogue n'est pas chargé (ou en panne), la ligne dit seulement « Ajouter
  « Teachable Machine » », sans marque « Autre »
- Et sur son projet, un « Autre » garde le nom tel que ce membre l'a tapé
- Et un nom qui correspond à un outil du catalogue ou à un alias (« chat gpt ») ne crée jamais un
  « Autre » : c'est l'outil du catalogue qui est choisi
- Et deux membres qui tapent le même autre outil, aux accents et majuscules près, ajoutent le même
  « Autre »
- Et le profil n'a plus de champ de texte séparé par des virgules : ses outils favoris se
  choisissent de la même façon, 10 au plus (décision de Louis du 9/11/2026)

### Où les outils s'affichent

- Sur la page d'un projet, la page d'un membre et dans ses outils favoris : un outil du catalogue
  est une étiquette qui mène à sa page ; un « Autre » est écrit en texte simple, sans lien, tant
  qu'il n'est pas entré au catalogue
- Un lecteur d'écran lit « Teachable Machine, autre outil, pas encore dans le catalogue »

### Tous les outils (planche `R3-Outils`)

- Étant donné Explorer, « Tous les outils »
- Alors la page « Outils » dit « Le catalogue des outils d'IA, de développement et de projets
  numériques, et les projets des membres qui s'en servent. » (jur-T12), puis un champ « Chercher un outil » et des pastilles de familles (Tous, et
  chaque famille)
- Et « Les plus utilisés » : les dix outils qui comptent le plus de projets, avec leur lettre, leur
  famille et « 41 projets »
- Et « De A à Z » : tout le catalogue, par ordre alphabétique ; un outil sans projet dit « Aucun
  projet pour l'instant »
- Et le champ et les pastilles filtrent les deux listes ; sans résultat, « Aucun outil ne
  correspond. »
- Et « Pas encore dans le catalogue » : les autres outils des projets qu'il peut voir, en texte
  simple, avec « Des outils ajoutés par les membres avec « Autre ». Les administrateurs les relisent
  et peuvent les ajouter au catalogue. » ; jamais un « Autre » cité seulement par des projets privés
  ou retirés, ni un « Autre » écarté
- Et le nombre de projets d'un outil ne compte que ceux que ce membre peut voir

### La page d'un outil (F-Et1 à F-Et3, planches `R6-Outil`, `R6-Outil-Desktop`)

- Étant donné un membre qui ouvre la page de Lovable
- Alors il voit le nom en très grand (« Lovable »), sa lettre, « 34 projets » et sa famille (« Sans
  code »), sa description dans sa langue, et l'adresse de son site (« lovable.dev ↗ »), qui passe
  par la page « Tu quittes Waiggle »
- Et dessous, les pastilles « Tous », « Testables », « Terminés », et le choix de la catégorie :
  sur téléphone, un bouton « Toutes les catégories » qui ouvre une feuille ; sur ordinateur, une
  rangée de pastilles « Toutes », puis chaque catégorie de ses projets, avec son icône
- Et les projets en mosaïque de tuiles (photo, titre, auteur), du plus récent au plus ancien : deux
  colonnes sur téléphone, quatre sur ordinateur
- Quand il touche « Testables », puis « Cuisine »
- Alors seuls les projets testables classés « Cuisine » (en principale ou en seconde) restent
- Et l'adresse de la page garde les filtres (`/tags/lovable?status=testable&category=cooking` :
  paramètres d'adresse en anglais, règle du design)
- Et sous la description : « Description écrite par Waiggle, sans lien avec l'éditeur de l'outil. »
- Et choisir une catégorie dans la feuille l'applique tout de suite, ferme la feuille et rend le
  focus au bouton ; la feuille n'a que « Fermer » ; le Retour du navigateur quitte la page
- Et sans projet pour ces filtres : « Aucun projet ici pour l'instant. » avec « Voir tous les
  projets », qui retire les filtres
- Et au-delà de 50 projets, « Afficher la suite » ajoute les 50 suivants
- Et la feuille des catégories ne propose que les catégories de ses projets, chacune avec son
  nombre
- Et un outil sans projet garde « Encore aucun projet ici » et « Publier »
- Et l'adresse d'une ancienne étiquette rattachée au catalogue (`/tags/chat-gpt`) mène à la page de
  l'outil (`/tags/chatgpt`) ; celle d'un « Autre » ou d'un nom inconnu mène à « Outil introuvable »
- Et un administrateur voit en plus « Modifier » (le nom, la famille, les descriptions, le site)

### Les catégories en filtre (décision « Les catégories »)

**Explorer**
- Étant donné Explorer, au-dessus de « Récents »
- Alors une rangée de pastilles : « Toutes », puis chaque catégorie qui a au moins un projet qu'il
  peut voir, avec son icône, dans l'ordre de la feuille de publication
- Quand il touche « Animaux »
- Alors « Récents » ne montre que les projets classés « Animaux » (en principale ou en seconde),
  page après page
- Et l'adresse garde le filtre (`/explore?category=animals`)
- Et sans projet : « Aucun projet dans « Animaux » pour l'instant. »

**La page d'un projet**
- Quand il touche la catégorie à côté du statut
- Alors Explorer s'ouvre, filtré sur cette catégorie

**La recherche**
- Étant donné des résultats de recherche, onglet « Tout » ou « Projets »
- Alors un bouton « Toutes les catégories » ouvre la feuille des catégories
- Quand il choisit « Cuisine »
- Alors le groupe Projets ne garde que les projets classés « Cuisine », et le bouton dit « Cuisine »
- Et l'adresse garde le filtre (`/search?q=carn&category=cooking`)
- Et les projets d'avant R6a, sans catégorie, ne sortent que sans filtre

### Le récap des « Autre » aux administrateurs (planche `R6-Email-Autre`)

- Étant donné un lundi à 8 h (heure de Paris)
- Quand des membres ont choisi « Autre » dans les sept derniers jours, pour un outil (d'un projet
  ou de leurs outils favoris) ou pour une catégorie
- Alors chaque administrateur en fonction, à l'adresse vérifiée et non suspendu, reçoit dans sa
  langue « Les « Autre » de la semaine sur Waiggle »
- Et l'e-mail ne donne **que des nombres et des liens** (« 3 autres outils à vérifier », « 2 projets
  à ranger dans une catégorie », « Et 4 autres en attente depuis plus d'une semaine. »), avec « Voir
  les outils » et « Voir les projets à ranger » : ni nom d'outil, ni titre, ni auteur, ni accroche
  (relecture juridique jur-T1, comme l'alerte de modération de 7a ; la planche montrait des listes)
- Et seuls comptent les projets que les membres peuvent voir et les profils des comptes vérifiés :
  jamais un projet privé, retiré, ni d'un compte supprimé
- Et sans aucun « Autre » dans la semaine, rien n'est envoyé ; un même lundi, jamais deux fois
- Et l'e-mail a sa version texte, et aucune image distante

### Ranger les « Autre » (pages de Modération, réservées aux administrateurs)

**Les outils** (`/moderation/tools`, lien « Voir les outils » de l'e-mail ; « Outils » et
« Catégories » s'ouvrent depuis la Modération, sous ses onglets)
- Étant donné un administrateur sur « Outils » de la Modération, onglet « À vérifier »
- Alors il voit chaque autre outil cité par au moins un projet visible des membres ou par les outils
  favoris d'un membre, du plus récent au plus ancien, avec ces projets (titre, auteur), ces membres
  (nom, pseudo) et leurs nombres ; jamais un projet privé ou retiré, ni le profil d'un compte
  supprimé ou non vérifié (décision de Louis du 9/11/2026 au soir : un « Autre » du profil est relu
  comme celui d'un projet)
- Quand il touche « Ajouter au catalogue »
- Alors un formulaire, prérempli du nom, demande la famille, la description en français et en
  anglais (160 caractères chacune) et le site (facultatif, `https://`)
- Et une fois ajouté, l'outil a sa page, devient une étiquette partout, et quitte « À vérifier »
- Et le formulaire guide : « Une phrase neutre : ce que fait l'outil. Ni prix, ni superlatif, ni
  promesse, ni avis. » et « L'adresse du site officiel, sans lien d'affiliation ni paramètre de
  suivi. » (une adresse avec `?` ou `#` est refusée)
- Quand il touche plutôt « Rattacher à un outil » et choisit « Make » dans le catalogue
- Alors une fenêtre demande « Rattacher « Make.com » à Make ? », dit combien de projets et de
  profils changeront, projets privés compris, que le nom deviendra un autre nom de Make, et que
  cela ne s'annule pas dans l'appli
- Quand il confirme
- Alors chaque projet et chaque profil qui citaient cet autre outil citent l'outil du catalogue
  (sans doublon), et le nom tapé devient un alias de cet outil
- Quand il touche plutôt « Laisser hors du catalogue » (un nom injurieux, ou qui n'est pas un outil)
- Alors l'autre outil quitte « À vérifier », la liste « Pas encore dans le catalogue » et le récap ;
  il reste en texte simple sur les projets et les profils qui le citent (un contenu à signaler passe par
  « Signaler »)
- Et une carte décidée reste à sa place, son résultat à la place de ses boutons
- Et l'onglet « Catalogue » cherche un outil, le modifie, ou en ajoute un nouveau
- Et chaque ajout, rattachement ou modification entre dans « Changements récents », en bas de la page (qui, quand, quoi)

**Les catégories** (`/moderation/categories`, lien « Voir les projets à ranger » de l'e-mail)
- Étant donné un administrateur sur « Catégories » de la Modération, onglet « À ranger »
- Alors il voit les projets visibles des membres classés « Autre », du plus ancien au plus récent ;
  jamais un projet que son auteur a remis en « Autre » après un rangement (le choix du membre
  l'emporte)
- Quand il touche « Ranger dans une catégorie » et choisit « Animaux »
- Alors « Autre » est remplacée par « Animaux » à sa place (principale ou seconde) ; si le projet
  avait déjà « Animaux », « Autre » est simplement retirée
- Et l'onglet « Catégories » liste les catégories avec leur nombre de projets, et « Nouvelle
  catégorie »
- Quand il crée « Jardinage » / « Gardening » avec une icône choisie dans une grille
- Alors elle apparaît partout (feuille de publication, filtres), juste avant « Autre » (décision de
  Louis du 9/11/2026 : tout dans l'appli)
- Et deux catégories ne peuvent pas porter le même nom
- Et chaque rangement ou création entre dans « Changements récents », en bas de la page

**Les gardes**
- Ces pages et leurs adresses répondent à tout autre visiteur comme une adresse qui n'existe pas,
  comme le reste de la Modération
- Un administrateur ne range pas son propre projet, comme il ne décide pas d'un signalement qui le
  concerne (7c)
- Sous la catégorie « Autre » de la feuille de publication (projet non privé) : « Les
  administrateurs pourront ranger ton projet dans une catégorie qui lui va. Tu pourras la modifier
  comme le reste du projet. »
- L'auteur d'un projet rangé le voit dans sa nouvelle catégorie ; il en sera prévenu en R8 ;
  l'export de ses données liste les changements de catégorie de ses projets, sans nommer
  l'administrateur
- « Changements récents » et les autres outils que plus rien ne cite s'effacent : le journal après
  un an, les autres outils orphelins chaque nuit ; un autre outil ne garde pas qui l'a tapé
- Un membre crée au plus 30 autres outils par jour

### La bascule des étiquettes existantes

- Le jour de la mise en ligne, chaque outil déjà cité par un projet ou un profil est rattaché à
  l'outil du catalogue qui porte ce nom ou cet alias, sans accents ni majuscules (décision de Louis
  du 9/11/2026)
- Les autres deviennent des « Autre », en texte simple, et entrent dans le premier récap (« en
  attente depuis plus d'une semaine »)
- Aucun projet ni profil ne perd un outil

### La colonne du temps passé

- La colonne du temps passé, plus lue ni écrite depuis R6a, est effacée (jur-P1)

### Repris des restes de R5b (« fais tout », Louis, 8/11/2026)

- À 320 px et 200 % de texte, une réponse garde au moins une vingtaine de caractères par ligne (le
  retrait des réponses se réduit)
- Une mention en tête d'un long commentaire replié a son anneau de focus entier
- Dans la feuille des commentaires sans champ, après « Réessayer » sur une liste vide, le focus va
  au titre de la feuille, pas à la page dessous
- À 844 × 200 % et à 320 × 508 avec un texte long, le champ d'un commentaire reste à l'écran ; sur
  le web, la page suit le clavier (`interactive-widget=resizes-content`, `visualViewport`), à
  essayer ensuite sur un vrai téléphone
- Pendant l'envoi d'un commentaire, le champ ne se fige plus d'une façon qui ferme le clavier sur
  iOS ; un second envoi reste impossible
- « d'Inès », et non « de Inès », partout où un nom suit « de »
- Sur la page de profil : un double appui à 60 ms n'enregistre qu'une fois ; une panne au
  chargement montre une erreur avec « Réessayer », pas des messages vides
- La page « Vérifie ta boîte mail » prend le fond crème des feuilles
- Les restes de R5a prévus en R5b, s'ils sont encore là : la marche de teinte en haut de la photo
  sous « Testable », une ligne de l'éventail teintée de miel, la recette sortie dans son propre
  composant, et « 0 abonné » calé avec « Tester la démo » sur la page d'un projet retiré à
  l'ordinateur

### Le parcours d'un membre

- Le parcours (`journey`) : Léa publie en choisissant « Claude » dans le catalogue et en ajoutant
  « Teachable Machine » comme autre outil ; elle ouvre la page de Claude, choisit « Testables »,
  puis filtre Explorer sur « Sciences et espace »
- Puis Louis, administrateur, ajoute « Teachable Machine » au catalogue, range un projet « Autre »
  dans « Animaux », et Léa voit Teachable Machine devenu une étiquette sur son projet

### Les choix de la session (nuit du 9/11/2026, délégation de Louis)

Pris par la session, à revoir par Louis au bilan :

1. **« 34 projets »**, et non « 34 projets publics » : depuis R6a, un projet « Membres de
   Waiggle » n'est pas public.
2. **Les familles** : sept, nommées plus haut.
3. **« Tous les outils »** montre tout le catalogue (« Les plus utilisés », puis « De A à Z »), et
   les autres outils en texte simple.
4. **Le récap** part le lundi à 8 h, une heure avant celui des membres, et seulement s'il a quelque
   chose à dire ; il ne porte que des nombres et des liens (la planche montre des listes et des
   vignettes) : rien d'un membre ne part dans une boîte mail (relecture juridique, jur-T1, option A).
5. **Ranger un projet** ne prévient pas son auteur avant R8 ; « Changements récents » le garde. Ces
   gestes ont leur propre journal, pas l'historique des signalements (fait pour les contenus signalés).
6. **Les anciennes colonnes** de texte des outils restent jusqu'en R7, pour qu'un retour à R6a
   reste possible ; `time_spent` est effacée.
7. **Une catégorie créée** se place juste avant « Autre » ; on ne la renomme ni ne la supprime en
   R6b.
8. **Le filtre par catégorie** de la recherche ne vise que le groupe Projets.
9. **Après la relecture du plan** (sécurité, juridique, interface ; tout retenu) : les textes du
   juridique pour l'aide des « Autre », le formulaire d'un outil, la confirmation de « Rattacher »
   et la catégorie « Autre » ; « Laisser hors du catalogue » ajouté ; un « Autre » garde sur un
   projet le nom tapé par son auteur ; les adresses en anglais (`?status=`, `?category=`,
   `/moderation/tools`).
10. **Les feuilles** : celle des catégories applique le choix tout de suite et n'a que « Fermer » ;
    celles de l'administration demandent « Abandonner les changements ? » si on les ferme
    modifiées (Échap, voile, « Annuler »), refusent de se fermer pendant l'écriture, et le Retour du
    navigateur quitte la page, comme pour les commentaires et le partage.

---

## R7a — Les mises à jour et les testeurs

Statut : **validé par Louis** le 10/11/2026 (« tout me va », « ok pour le découpage »). Ses choix
du 10/11 au matin : on crée les testeurs, qui s'inscrivent (« plus complets ») ; une mise à jour
a un titre facultatif ; la carte du projet remonte dans « Abonnements » ; les notes du Journal
déjà publiées sont effacées. R7 est coupée en deux : R7a ici, R7b (le coin des testeurs) juste
après.

R7a remplace la note du Journal par une **vraie mise à jour** (planches `R7-MAJ-Publier`,
`R7-MAJ-Projet`, `R7-MAJ-Fil`, `R7-MAJ-Desktop` ; décisions « Les versions et les mises à jour »,
F-Pr5, F-Pr7, et « Une mise à jour dans le fil ») : un titre et un numéro de version facultatifs,
« Ce qui a changé » en cinq lignes au plus dans trois familles, des photos avec un avant / après, la
frise des mises à jour, la carte qui remonte dans le fil avec « Mis à jour · v1.2 », et une
notification aux abonnés du projet et à ses **testeurs**, des membres qui s'inscrivent pour
aider l'auteur. Elle efface aussi les anciennes colonnes de texte des outils, gardées depuis R6b pour un retour en
arrière devenu inutile.

Les règles d'aujourd'hui ne changent pas, sauf celles que cette section nomme : seul l'auteur
publie ou supprime une mise à jour ; ce que voit chacun (un projet privé d'un autre membre, retiré,
ou d'un membre bloqué ne laisse voir aucune de ses mises à jour, nulle part) ; une mise à jour se
signale et se retire comme une note aujourd'hui.

Hors de R7a, et où ça va :
- choisir, pour l'e-mail, « Dans le récap » ou « Jamais » pour les mises à jour suivies (F-N2) :
  R8, avec les réglages par type ; en R7, elles suivent le réglage du récap ;
- les notifications sur le téléphone (push) : après la refonte ;
- modifier une mise à jour publiée : plus tard, si les membres le demandent (on la supprime et on
  la republie) ;
- les vidéos courtes : après la refonte (F-Pr7) ;
- signaler une seule photo d'une mise à jour : R9, avec les parties d'un contenu (7d) ;
- une mise à jour dans une ruche : R10 ;
- le coin des testeurs (la liste pour l'auteur, les appels à tester, les retours privés,
  « Réglé dans la v1.3 », le badge « Testeur ») : R7b, juste après ;
- une conversation de groupe entre les testeurs d'un projet : plus tard (Louis, 10/11/2026 : « ça
  me semble intéressant », à garder).

### Les testeurs (demande de Louis du 10/11/2026 : « plus complets »)

Un testeur n'est plus quelqu'un qui a seulement ouvert la démo : c'est un membre qui **s'inscrit**
auprès de l'auteur pour l'aider. En R7a, il reçoit les mises à jour du projet ; en R7b, il aura
sa place dans **le coin des testeurs**.

Amendé au commit du contrat (décisions de Louis du 10/11/2026, après la relecture juridique du
plan) : les textes ne supposent aucun genre, et ne donnent jamais un nombre de testeurs à un autre
que l'auteur.

**Rejoindre les testeurs**
- Étant donné Inès sur la page de Décollage !, un projet « Testable » de Papi Jean, avec une démo
- Alors sous « Tester la démo », à côté de « Suivre ce projet », un bouton « Rejoindre les
  testeurs » (pas en miel : « Tester la démo » l'est)
- Quand elle le touche
- Alors une feuille « Rejoindre les testeurs » explique : « Tu aides Papi Jean à améliorer
  « Décollage ! ». Tu recevras ses mises à jour, et bientôt ses appels à tester. Papi Jean verra ton
  nom dans sa liste de testeurs. », avec « Rejoindre les testeurs » et « Annuler »
- Quand elle confirme
- Alors une bulle dit « Tu fais partie des testeurs de « Décollage ! ». », et le bouton devient
  « Tu testes ce projet », qui reçoit le focus
- Et sur la page de sortie d'une démo venue d'un projet « Testable », un membre qui n'est pas
  testeur lit « Tu veux aider Papi Jean ? Rejoins les testeurs depuis la page du projet. », la
  seconde phrase étant un lien vers la page du projet ; ouvrir la démo ne rend jamais testeur tout
  seul
- Et un projet qui n'est pas « Testable » ne propose pas « Rejoindre les testeurs » ; ses testeurs
  gardent leur place quand le statut change, et gardent « Tu testes ce projet » pour pouvoir partir
- Et un compte suspendu ne voit pas « Rejoindre les testeurs » (il peut toujours quitter)
- Et l'auteur ne peut pas être testeur de son propre projet ; un membre bloqué par l'auteur, ou qui
  l'a bloqué, ne voit pas le bouton
- Et un projet compte 200 testeurs au plus ; au-delà, la feuille dit « Ce projet ne prend plus de
  nouveaux testeurs. »
- Et l'auteur voit « 12 testeurs » à côté de « 12 abonnés » sur la page de son projet (le nombre
  seul en R7a ; la liste en R7b) ; les autres membres ne voient ni le nombre ni les noms

**Quitter**
- Quand Inès touche « Tu testes ce projet »
- Alors une feuille « Tu testes ce projet » dit « Tu fais partie des testeurs de « Décollage ! ».
  Tu reçois ses mises à jour. » et propose « Quitter les testeurs » et « Fermer »
- Quand elle touche « Quitter les testeurs »
- Alors elle ne fait plus partie des testeurs, le bouton redevient « Rejoindre les testeurs », et
  une bulle dit « Tu ne fais plus partie des testeurs de « Décollage ! ». »
- Et quand elle cesse de suivre un projet qu'elle teste, une bulle dit « Tu fais toujours partie
  des testeurs : ses mises à jour continueront d'arriver. »
- Et un blocage, dans un sens ou dans l'autre, retire le testeur ; ses inscriptions ne reviennent
  pas au déblocage
- Et un projet supprimé emporte ses testeurs ; un projet retiré ou privé ne prévient plus ses
  testeurs ; un auteur suspendu ne publie plus, donc ne prévient plus (ses mises à jour d'avant
  restent dans Activité, comme dans la frise : la suspension ne se devine pas)

**Ce que reçoit un testeur**
- Les mises à jour du projet, dans Activité et dans le récap du lundi
- Et il en est prévenu une seule fois, même s'il suit aussi le projet

### Publier une mise à jour (planche `R7-MAJ-Publier`)

- Étant donné Papi Jean sur la page de son projet Décollage !
- Alors la section « Les mises à jour » a un bouton « Publier une mise à jour », et le menu « … »
  aussi
- Quand il le touche
- Alors une feuille « Nouvelle mise à jour » s'ouvre, avec « Annuler » à gauche et « Publier » à
  droite
- Et en haut, la vignette et le titre du projet, et « Dernière version : v1.2, il y a 3 semaines »
  (sans version : « Dernière mise à jour : il y a 3 semaines » ; sans mise à jour : « Première
  mise à jour »)
- Et un champ « Titre, facultatif » (« Par exemple : Le décompte de la fusée »), 60 caractères au
  plus
- Et « Ce qui a changé », avec le compteur « 1 / 5 » à droite, et une première ligne vide de la
  famille « Nouveau »
- Et chaque ligne porte sa famille, une pastille ronde avec son icône, et son nom au-dessus du
  texte : « Nouveau » (étincelle, ambre), « Réparé » (clé, vert), « Plus joli » (palette, encre
  discrète)
- Et chaque famille a son exemple dans le champ vide : « Par exemple : un mode nuit », « Par
  exemple : la lune ne disparaît plus à minuit », « Par exemple : des étoiles qui scintillent »
- Et une ligne fait 120 caractères au plus
- Quand il touche la pastille d'une ligne
- Alors un petit menu propose les trois familles ; la ligne prend celle qu'il choisit
- Quand il touche « Ajouter une ligne »
- Alors une ligne vide apparaît, de la famille « Nouveau », et le compteur dit « 2 / 5 »
- Et à cinq lignes, « Ajouter une ligne » disparaît
- Et chaque ligne a un bouton « Retirer cette ligne », sauf quand il n'en reste qu'une
- Et sous la liste, l'aide « Une ligne par changement, 5 au plus. Pas besoin de tout dire. »
- Et un champ d'une ligne « Numéro de version, facultatif », en Geist Mono, 20 caractères au plus
  (« v1.3 »)
- Et une partie « Photos » : « Ajouter » ouvre le choix d'images comme dans la feuille de
  publication, 4 photos au plus, ré-encodées sans métadonnées, chacune avec sa description
  facultative
- Et un projet garde 100 photos de mises à jour au plus (décision de Louis du 10/11/2026) ;
  au-delà, « Ce projet a atteint 100 photos de mises à jour. Supprime une ancienne mise à jour pour
  en ajouter. »
- Et dès deux photos, un interrupteur « Avant / après » : allumé, les deux premières portent les
  étiquettes « Avant » et « Après »
- Et en bas, « Tous les membres pourront la lire. Les abonnés et les testeurs de ce projet seront
  prévenus. » (pour un projet privé : « Ce projet est privé : aucun autre membre ne voit cette mise
  à jour, et personne n'est prévenu. S'il redevient visible des membres, tous la verront, et ses
  abonnés et testeurs pourront la retrouver dans Activité. » ; textes de la relecture juridique)

**Publier**
- Quand il touche « Publier » avec au moins une ligne écrite
- Alors la mise à jour est publiée, la feuille se ferme, une bulle dit « Mise à jour publiée. »
- Et sous le titre du projet : « Publié le 12 sept. · Mis à jour à l'instant · v1.3 »
- Et les lignes vides sont ignorées
- Quand il touche « Publier » sans aucune ligne écrite
- Alors « Publier » n'est jamais grisé : la première ligne dit « Écris au moins un changement
  avant de publier. » et reçoit le focus
- Et pendant l'envoi, « Publier » reste occupé et la feuille ne se ferme pas ; une seconde tape
  n'envoie rien
- Et en cas d'échec, « La mise à jour n'a pas pu être publiée. Réessaie. », rien n'est perdu
- Et au-delà de 10 mises à jour par jour (tous projets confondus), « Tu as publié 10 mises à jour
  aujourd'hui. La suivante pourra partir demain. »

**Quitter sans publier** (repris de la liste « À reprendre » : le brouillon d'une note perdu)
- Quand il touche « Annuler », Échap, le voile ou le Retour du navigateur, la feuille modifiée
- Alors une fenêtre « Abandonner cette mise à jour ? » propose « Continuer » et « Abandonner » ;
  « Abandonner » efface aussi les photos déjà envoyées
- Et la feuille sans changement (ou seulement préremplie par le statut) se ferme tout de suite

**Quand le statut change**
- Étant donné Papi Jean qui passe son projet en « Testable » dans « Modifier »
- Alors, comme aujourd'hui pour le Journal, la feuille « Nouvelle mise à jour » s'ouvre avec une
  ligne « Nouveau » préremplie « Le projet passe en « Testable ». » et l'aide « Ton projet est passé
  en « Testable » : annonce-le à tes abonnés et à tes testeurs, ou touche Annuler. »

### Les mises à jour sur la page projet

- Étant donné un projet qui a trois mises à jour
- Alors sous le titre : « Publié le 12 sept. · Mis à jour il y a 2 jours · v1.2 » ; « Mis à
  jour » suit la dernière mise à jour publiée, et non plus une modification du projet ; la version
  est celle de la dernière mise à jour qui en a une, en Geist Mono, discrète
- Et un projet sans mise à jour garde « Publié le 12 sept. », sans « Mis à jour »
- Et la section « Les mises à jour » remplace le Journal : la dernière mise à jour en entier (son
  titre, sa version, sa date, ses lignes avec leurs pastilles, ses photos), puis « Voir les
  3 mises à jour »
- Et un projet sans mise à jour ne montre pas la section aux autres membres ; son auteur y voit
  « Pas encore de mise à jour. Raconte ce qui change : tes abonnés et tes testeurs seront
  prévenus. » et « Publier une mise à jour »
- Et sur ordinateur, la corbeille de l'auteur est au bord droit de chaque mise à jour (repris de
  la liste « À reprendre » : à 1440 px, elle était à mi-carte)

### La frise (planches `R7-MAJ-Projet`, `R7-MAJ-Desktop`)

- Quand un membre touche « Voir les 3 mises à jour »
- Alors la page « Les mises à jour » s'ouvre : Retour avec le titre et l'auteur du projet, et
  « Suivre ce projet » en haut à droite
- Et le grand titre « Les mises à jour », avec le nombre (« 3 ») dans une pastille
- Et « Publié le 12 sept. · Mis à jour il y a 2 jours · v1.2 »
- Et en haut, l'avant / après de la dernière mise à jour qui en a un
- Et la frise, de la plus récente à la plus ancienne : un point miel pour la dernière, un rond
  vide pour les autres, reliés par un trait ; pour chacune, son titre (sinon sa version, sinon
  « Mise à jour »), sa version en Geist Mono, sa date relative à droite, ses lignes avec leurs
  pastilles, et ses photos en petites tuiles
- Et tout en bas, « Première version », à la date de publication du projet
- Et la frise montre 20 mises à jour, puis « Afficher la suite »
- Et sur ordinateur, l'avant / après à gauche et la frise à droite dans une carte, avec l'aide
  « Fais glisser la poignée, ou utilise les flèches du clavier, pour comparer. »
- Et l'auteur a une corbeille sur chaque mise à jour

### L'avant / après (F-Pr7)

- Étant donné une mise à jour avec l'avant / après
- Alors les deux photos sont superposées, l'« Avant » à gauche et l'« Après » à droite d'un trait
  blanc, avec les étiquettes « Avant » et « Après » en verre, et une poignée ronde au milieu
- Quand le membre fait glisser la poignée, ou touche l'image
- Alors le trait suit son doigt
- Et la poignée est un curseur pour les lecteurs d'écran (« Comparer avant et après », sa valeur
  en pour cent) ; les flèches du clavier la déplacent de 10 %, Début et Fin vont aux bords
- Et sa zone à toucher fait 44 points au moins
- Et chaque photo garde sa description pour les lecteurs d'écran
- Et rien ne bouge sans le membre, avec ou sans « Réduire les animations »
- Et les photos d'une mise à jour sans avant / après s'affichent dans un carrousel, comme celles de
  la galerie (amendé au commit du contrat : l'appli n'a pas encore de vue en grand des photos)

### Supprimer une mise à jour

- Quand l'auteur touche la corbeille d'une mise à jour
- Alors une fenêtre « Supprimer cette mise à jour ? », « Elle disparaîtra de la page du projet, du
  fil et des notifications, avec ses photos. », « Annuler » et « Supprimer »
- Et après, une bulle « Mise à jour supprimée. » ; « Mis à jour » et la version sous le titre
  suivent la mise à jour précédente, ou disparaissent
- Et pendant la suppression, « Supprimer » reste occupé et une seconde tape n'envoie rien

### Dans le fil (planche `R7-MAJ-Fil`)

- Étant donné Inès qui suit Décollage !, ou qui suit Papi Jean
- Quand Papi Jean publie une mise à jour
- Alors dans « Abonnements », la carte de Décollage ! remonte à la date de la mise à jour (le
  projet n'apparaît qu'une fois, à son événement le plus récent)
- Et elle porte « Mis à jour · v1.2 » à la place de la date de l'auteur (« Mis à jour » seul, sans
  version)
- Et la première ligne de « Ce qui a changé », avec sa pastille, remplace l'accroche, suivie de
  « et 2 autres changements » s'il y en a
- Et en bas de la carte, la date relative de la mise à jour
- Et la petite carte « Note de Léa sur Carnet de cafés » disparaît
- Et le bouton des nouveautés dit « 1 mise à jour », « 2 mises à jour », ou « 3 nouveautés » quand
  il y a aussi de nouveaux projets, avec les photos des auteurs
- Et dans « Découvrir », l'ordre reste celui de la publication ; la carte porte le repère « Mis à
  jour · v1.2 » si sa dernière mise à jour a moins de 30 jours, sans changer d'accroche
- Et pareil sur la page d'un outil, d'un membre, et dans les résultats de recherche

### Les notifications

- Étant donné Inès, abonnée ou testeuse de Décollage !
- Quand Papi Jean publie une mise à jour
- Alors la cloche s'allume, et Activité montre « Papi Jean a publié une mise à jour de
  « Décollage ! » · v1.2 », avec sa première ligne ; la toucher ouvre la frise
- Et seules les mises à jour publiées après l'abonnement ou l'inscription la font s'allumer
- Et Inès n'est prévenue qu'une fois par mise à jour, même abonnée et testeuse
- Et l'auteur n'est jamais prévenu de sa propre mise à jour
- Et personne n'est prévenu d'un projet privé, d'un projet qu'il ne peut pas voir, ni par un
  membre qu'il a bloqué ou qui l'a bloqué
- Et une mise à jour supprimée ou retirée disparaît d'Activité
- Et le récap du lundi ajoute « Les projets que tu suis ou que tu testes » : chaque projet mis à
  jour dans la semaine, son nombre de mises à jour et un lien, pour qui reçoit le récap ; jamais le
  texte d'une mise à jour

### La modération

- Une mise à jour se signale comme une note aujourd'hui (le menu de chaque mise à jour, pour un
  autre membre que l'auteur), et se retire en entier, ses photos avec elle
- Et les textes de la modération, des bandeaux et des notifications disent « mise à jour » là où
  ils disaient « note »
- Et la copie gardée d'un signalement porte le titre, la version et les lignes

### Ce qui disparaît

- **Les notes du Journal** : effacées le jour de la bascule (choix de Louis du 10/11/2026), avec
  leur place dans le fil et dans Activité ; les décisions de modération qui en parlent gardent
  leur copie
- **Les anciennes colonnes de texte des outils** (`project.tools`, `project.tool_slugs`,
  `profile.favorite_tools`) : effacées ; le catalogue de R6b est la seule source
- Les textes qui disaient « notes » disent « mises à jour » : la fenêtre de suppression d'un projet
  (« … ses photos, ses prompts et ses mises à jour disparaissent tout de suite … »), l'export des
  données, le blocage, la suspension, la description du fil

### Mes données

- L'export de ses données contient ses mises à jour (titre, version, lignes et familles, dates,
  descriptions des photos) et les projets dont on est testeur (titre, date d'inscription)
- La suppression du compte efface ses mises à jour, leurs photos et ses inscriptions de testeur

### Le parcours d'un membre

- Le parcours (`journey`) : Inès devient testeuse de Décollage ! ; Papi Jean publie « Le décompte de la fusée » (v1.2, une ligne « Nouveau », une
  « Réparé », deux photos en avant / après) ; Inès voit la cloche s'allumer, ouvre la frise,
  compare avant / après au clavier, puis quitte les testeurs

### Les choix de la session (10/11/2026), validés avec ce scénario

1. **Les testeurs** : on s'inscrit (projet « Testable » seulement, 200 au plus) ; l'auteur voit
   leur nombre en R7a, leur liste en R7b ; personne d'autre ne voit ni l'un ni l'autre. Les textes
   (« Rejoindre les testeurs », « Tu testes ce projet ») ne supposent aucun genre.
2. **Ce que reçoivent abonnés et testeurs** : Activité et le récap du lundi ; pas d'e-mail
   immédiat (R8 réglera chaque type).
3. **Le fil** : une mise à jour remonte la carte pour les abonnés du projet et de l'auteur, dans
   « Abonnements » ; « Découvrir » garde l'ordre de publication, avec un repère pendant 30 jours.
4. **« Mis à jour »** sous le titre suit la dernière mise à jour, plus une modification du projet.
5. **Limites** : titre 60, ligne 120, version 20 caractères ; 5 lignes ; 4 photos ; 10 mises à
   jour par jour et par membre (les notes : 30).
6. **On ne modifie pas** une mise à jour publiée ; on la supprime.
7. **Les photos d'une mise à jour** restent avec elle : elles n'entrent pas dans la galerie du
   projet.

---

## R7b — Le coin des testeurs

Statut : **validé par Louis** le 10/11/2026 (« tout me va », « ok pour le découpage »), à
reprendre au début de R7b. Amendé le 11/11/2026 après la relecture du plan (décisions de Louis :
ancien testeur en lecture seule, badge pour tous, la modération voit une capture signalée ; le nom
à la place de « Elle » ; le signalement dans un fil à deux). R7b suit R7a, qui crée les mises à jour et l'inscription des testeurs.

R7b donne aux testeurs inscrits en R7a **le coin des testeurs** du projet, un espace tenu par
l'auteur : les appels à tester, et un fil privé de retours entre chaque testeur et l'auteur, relié
aux mises à jour par « Réglé dans la v1.3 ».

Hors de R7b, et où ça va :
- **une conversation de groupe entre les testeurs d'un projet** : plus tard (Louis, 10/11/2026 :
  « ça me semble intéressant », à garder) ;
- des retours par e-mail, et prévenir par e-mail d'un nouveau message : R8, avec les réglages par
  type (en R7b, Activité et le récap du lundi) ;
- signaler une seule capture d'un retour : R9, avec les parties d'un contenu.

### Le coin des testeurs (une page du projet, `/projects/<id>/testers`)

- Étant donné Papi Jean, ou un testeur de Décollage !
- Quand il touche « Le coin des testeurs » (le bouton « Tu testes ce projet » le devient, et l'auteur le
  trouve sur la page du projet et dans le menu « … »)
- Alors la page s'ouvre avec Retour, le titre du projet, et deux onglets : « Appels » et
  « Retours »
- Et un autre membre, ou un visiteur, qui ouvre l'adresse voit la page introuvable
- Et l'auteur voit en haut « 12 testeurs » et la liste : photo, nom, date d'inscription, et pour
  chacun le menu « … » avec « Retirer des testeurs »
- Et un testeur voit « 12 testeurs », sans la liste : les testeurs ne se voient pas entre eux
- Et « Quitter les testeurs » passe dans le menu « … » du coin

### Les appels à tester (de l'auteur à tous ses testeurs)

- Étant donné Papi Jean dans l'onglet « Appels »
- Quand il touche « Lancer un appel »
- Alors une feuille « Nouvel appel » : un texte de 500 caractères au plus (« Par exemple : essayez
  le niveau 3 ce week-end, surtout sur téléphone »), et une photo facultative
- Quand il touche « Envoyer »
- Alors l'appel apparaît en tête de l'onglet, et chaque testeur est prévenu dans Activité
  (« Papi Jean lance un appel à tester Décollage ! »)
- Et les appels s'affichent du plus récent au plus ancien ; l'auteur peut supprimer chacun
- Et 5 appels par jour et par projet au plus

### Les retours (un fil privé entre chaque testeur et l'auteur)

- Étant donné Inès dans l'onglet « Retours »
- Alors elle voit son seul fil avec Papi Jean, et le bouton « Envoyer un retour »
- Quand elle le touche
- Alors une feuille « Ton retour » : « Ça a marché ? » (Oui · En partie · Non), « Sur quoi ? »
  (Téléphone · Ordinateur · Tablette, facultatif), un texte de 1 000 caractères au plus (« Ce qui a
  marché, ce qui a coincé, ce que tu as aimé »), et une capture d'écran facultative, ré-encodée
  sans métadonnées
- Et l'aide rappelle « Retire de ta capture ce qui est personnel, à toi ou à d’autres : noms,
  messages, adresses. » (amendé le 11/11/2026, relecture juridique J8)
- Quand elle touche « Envoyer »
- Alors le retour apparaît dans son fil, et Papi Jean est prévenu dans Activité
- Et seuls Inès et Papi Jean voient ce fil ; aucun autre testeur, aucun autre membre
- Étant donné Papi Jean dans l'onglet « Retours »
- Alors il voit un fil par testeur, le plus récent en tête, avec un point pour les retours non lus,
  et les filtres « À traiter » et « Réglés »
- Quand il ouvre le fil d'Inès et répond (1 000 caractères au plus)
- Alors Inès est prévenue dans Activité ; elle peut répondre à son tour
- Et chacun peut supprimer ses propres messages ; 30 messages par jour et par membre au plus, tous
  projets confondus
- Et un fil se lit comme une conversation : les messages de l'auteur à droite, ceux du testeur à
  gauche, la date relative sous chacun

### « Réglé dans la v1.3 » (le lien avec les mises à jour)

- Étant donné Papi Jean qui lit un retour d'Inès
- Quand il touche « Marquer comme réglé »
- Alors le retour passe dans « Réglés », et Inès lit « Réglé » sous son retour
- Et dans la feuille « Nouvelle mise à jour », quand le projet a des retours « À traiter », une
  partie « Retours réglés » les propose ; ceux qu'il coche passent dans « Réglés » à la
  publication, avec « Réglé dans la v1.3 » (ou « Réglé dans la mise à jour du 12 nov. »)
- Et chaque testeur dont un retour est réglé est prévenu : « Papi Jean a réglé ton retour dans la
  v1.3 de Décollage ! »

### Le badge « Testeur »

- Dans les commentaires de Décollage !, un testeur porte le badge « Testeur », à côté du nom, comme
  le badge « Auteur »
- Et tous les testeurs le portent, inscrits avant R7b compris, sans notification (Louis, 11/11/2026) ;
  la feuille d'inscription le dit désormais

### Retirer et quitter

- Quand Papi Jean retire Inès des testeurs (confirmation « Retirer Inès des testeurs ? Inès ne
  verra plus le coin des testeurs et ne pourra plus les rejoindre ; aucune notification ne part. Ses
  retours te restent lisibles. Impossible de revenir en arrière. »)
- Alors Inès n'est plus testeuse, sans en être prévenue, et « Rejoindre les testeurs » ne lui est plus
  proposé sur ce projet
- Quand Inès quitte les testeurs (depuis le menu « … » du coin, ou de la page du projet), après une
  confirmation qui dit que ses retours restent lisibles par Papi Jean
- Alors son fil de retours reste lisible par Papi Jean, et redevient le sien si elle se réinscrit
- Et une ancienne testeuse (partie, retirée, ou bloquée dans un sens ou dans l'autre) garde son fil
  en lecture seule : elle le relit, supprime ses messages et signale ceux de l'auteur ; ni appels, ni
  compositeur, ni « Envoyer un retour » (Louis, 11/11/2026)
- Et un projet supprimé emporte son coin des testeurs ; un projet retiré, privé, ou dont l'auteur
  est suspendu le ferme à tous, testeurs et anciens testeurs compris, sauf à l'auteur pour la
  lecture ; un testeur peut toujours en supprimer ses messages et quitter les testeurs depuis la
  page du projet

### Ce que reçoit un testeur, en plus des mises à jour

- Ses appels à tester, les réponses à ses retours, et « Réglé dans la v1.3 », dans Activité et dans
  le récap du lundi

### La modération

- Un appel, un retour ou une réponse se signalent comme un commentaire (menu « … » du message) et
  se retirent comme lui ; le nom de la personne qui signale n'est pas transmis, mais dans un fil à
  deux l'autre peut le deviner, et le texte du signalement le dit
- Et la modération voit le message signalé et sa capture tant que le signalement est ouvert,
  jamais le reste du fil (Louis, 11/11/2026)

### Mes données

- L'export de ses données contient ses appels, ses retours et ses réponses (textes, dates,
  captures)
- La suppression du compte les efface ; les fils de ses testeurs disparaissent avec son projet

### Le parcours d'un membre

- Le parcours (`journey`) : Inès, testeuse de Décollage !, envoie un retour (« En partie »,
  Téléphone, « le score repart à zéro au niveau 3 ») ; Papi Jean lance un appel, répond au retour,
  puis publie une mise à jour qui le règle ; Inès lit « Réglé dans la v1.3 » sous son retour, puis
  quitte les testeurs

### Les choix de la session (10/11/2026), validés avec ce scénario

1. L'auteur voit la liste de ses testeurs, les testeurs seulement leur nombre.
2. Un fil privé par testeur, pas de discussion de groupe (gardée pour plus tard).
3. Un membre retiré par l'auteur ne peut pas se réinscrire.
4. Badge « Testeur » dans les commentaires du projet.
