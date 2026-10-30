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
    suivre, pour t'inspirer. » (Louis, 31/10/2026) ;
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
  les mentions (Louis, 31/10/2026, après les relectures de sécurité et juridique : sinon
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
