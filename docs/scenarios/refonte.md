# Phase 2 — La refonte « Miel 2 » : scénarios

Statut : R1 **validé par Louis** le 28/10/2026 ; R2 **validé** le 29/10/2026.

La refonte applique les maquettes et les décisions du 28/10/2026 (image de marque validée le
27/10, décisions pour la refonte, maquettes du 27 au 28/10), en douze tranches : R1 les
fondations, R2 le compte, R3 la navigation et Explorer, R4 le fil, R5a la page projet, R5b les
commentaires, R6 publier, R7 les mises à jour, R8 les notifications, R9 la modération, R10 les
Ruches, R11 la conformité, R12 les projets publics. Chaque tranche ajoute ici ses scénarios.
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
  brouillon : les commentaires et les réactions déjà reçus sont gardés, et toi seul les vois tant
  qu'il reste privé. », et « Créé le 12 oct. » au lieu de « Publié le »

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
  « Les commentaires des autres membres sont gardés, mais personne ne les lit tant que le projet
  reste privé. » ; la bannière du projet privé ne lui dit plus qu'il les voit (décision D4,
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
- Le focus du clavier ne se perd jamais : après un envoi, il reste dans le champ ; après une
  suppression, il va au commentaire voisin ; à la fermeture d'un bandeau, dans le champ
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
- Et les textes de masquage disent qui voit encore le commentaire, et les aides sous le champ
  restent celles d'aujourd'hui (relecture juridique).
