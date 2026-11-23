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
  lecture ; un testeur peut toujours quitter les testeurs depuis la page du projet, et faire
  effacer ses messages d'un coin fermé en écrivant au contact : l'appli ne les lui montre plus
  (une page « Mes retours envoyés » viendra plus tard ; relecture juridique de R7b, 11/11/2026)

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

---

## R8 — Les notifications

Statut : **validé par Louis** le 12/11/2026 (conversation « plan » de R8), tel quel, avec les
sept choix de la session ; amendé le même jour après la relecture du plan (décisions de Louis :
titre et nom seuls dans le récap, « Se désabonner » vers « Dans le récap », jours de Paris, trois
textes du juridique). Décisions de Louis du 12/11 : « Dans le récap » par défaut pour tout ; le récap habillé reste dans R8 ; le
miel s'éteint à la visite suivante ; trois planches nouvelles avant le plan.

R8 redessine la page « Activité » (planches `R8-Activite`, `R8-Activite-Nuit`, `R8-Activite-Vide`,
`R8-Activite-Desktop` ; décisions B7, A2, A3, A16) et l'écran « Notifications » des réglages
(planche `R8-Reglages`, F-N2) : des sections par jour, des lignes sans cadre, le fond miel pour ce
qui est nouveau, « Voir en contexte » sur un commentaire, des réglages d'e-mail par type, et un
e-mail « tout de suite » pour chaque type qui le permet, et le récap habillé du dimanche (planche
`R8-Recap`, A5). Elle ajoute deux notifications que R6b avait laissées de côté : le projet rangé
par un administrateur et l'outil rattaché au catalogue.

Les règles d'aujourd'hui ne changent pas, sauf celles que cette section nomme : les notifications
se calculent au moment où on les lit (droits, blocages, projet privé, contenu retiré), elles
durent 90 jours, les réactions et les abonnés restent comptés sans noms (A2), et un e-mail ne
contient aucun lien ni domaine venu d'un membre.

Hors de R8, et où ça va :
- les notifications sur le téléphone (push) : après la refonte ; l'écran montre seulement leur
  place, « Bientôt » (A16) ;
- la ligne « Ruches » des réglages et la partie « Dans tes ruches » du récap : R10 ;
- répondre à un retour de testeur depuis sa messagerie (un e-mail qui revient dans le coin) : plus
  tard, s'il le faut (l'e-mail reçu devrait être vérifié, assaini, relié au bon fil) ;
- une notification « rétabli » quand la modération revient sur un retrait : R9, avec la
  modération ;
- supprimer une notification à la main : non (elle part d'elle-même au bout de 90 jours).

### La page « Activité » (planches `R8-Activite`, `R8-Activite-Nuit`, `R8-Activite-Desktop`)

- Étant donné Léa, connectée, avec trois nouveautés depuis sa dernière visite
- Quand elle touche la cloche (sa pastille dit « 3 »)
- Alors la page « Activité » s'ouvre par-dessus, sans barre d'onglets, avec Retour et la roue des
  réglages, qui mène à l'écran « Notifications »
- Et la liste est rangée en « Aujourd'hui », « Cette semaine » et « Plus tôt », du plus récent au
  plus ancien, en jours de Paris comme toutes les dates de l'appli (relecture du plan, Louis
  12/11/2026)
- Et chaque ligne, sans cadre, montre à gauche l'avatar de qui a agi (ou une icône quand on ne
  nomme personne : réactions, abonnés, mise à jour, modération), à droite la miniature du projet,
  les noms et titres en gras, et la date relative
- Et un commentaire, une réponse ou une mention montre son début dans une bulle ; des réactions,
  leurs icônes ; une mise à jour, sa version et sa première ligne (« et 2 autres changements »)
- Et les trois nouveautés ont un fond miel ; les autres, aucun fond
- Et la pastille de la cloche s'éteint dès l'ouverture
- Et sur ordinateur, la page garde la barre du haut ; à droite, « Ce que tu reçois par e-mail »
  résume ses réglages avec « Régler les notifications », et rappelle qu'on ne voit nulle part qui
  a réagi ou qui suit, seulement des nombres
- Et la nuit, les mêmes rôles de couleur (planche `R8-Activite-Nuit`)

**Le fond miel** (décision de Louis, 12/11/2026) : une ligne est en miel si elle est arrivée depuis la
visite précédente ; elle le reste pendant toute la visite, puis plus jamais. Sur ordinateur,
« Tout marquer comme lu » éteint tout de suite le miel de la page.

**Les modérations** (retrait, suspension, signalement traité) restent dans la même liste, avec une
icône rouge, et mènent à la raison et à la façon de contester, comme aujourd'hui.

### Où mène chaque ligne

| Ligne | Mène à |
| --- | --- |
| Commentaire, réponse, mention | la page du projet, feuille des commentaires ouverte sur ce commentaire (« Voir en contexte ») |
| Réactions, abonnés au projet | la page du projet |
| Mise à jour | la frise des mises à jour du projet |
| Appel à tester, retour, réponse, « Réglé » | le coin des testeurs, au bon onglet et au bon fil (comme en R7b) |
| Projet rangé | la page du projet |
| Outil rattaché | la page de l'outil |
| Nouveaux abonnés à son profil, suspension | rien : la ligne n'est pas un bouton |
| Modération (retrait, signalement traité) | comme aujourd'hui |

### « Voir en contexte » (renvoyé de R5b)

- Étant donné Léa, mentionnée par Papi Jean dans une réponse sur « Le ciel de ce soir »
- Quand elle touche la notification
- Alors la page du projet s'ouvre, la feuille des commentaires ouverte, le fil de la réponse
  déplié, et la feuille amène ce commentaire en vue
- Et le commentaire visé est éclairé de miel un court instant (sans mouvement si « Réduire les
  animations » est actif : la teinte reste, puis s'efface)
- Et le lecteur d'écran se pose sur ce commentaire
- Et l'adresse porte le commentaire visé (`/projects/<id>?comment=<id>`) : la recharger rouvre la
  feuille au même endroit ; fermer la feuille retire le paramètre
- Mais si le commentaire a disparu entre-temps (supprimé, masqué, retiré), la feuille s'ouvre en
  haut et dit « Ce commentaire n'est plus là. »
- Et un paramètre qui vise un commentaire d'un autre projet, ou que Léa ne peut pas voir, se
  comporte de même : rien n'en laisse deviner l'existence

### Deux notifications nouvelles (renvoyées de R6b)

- Étant donné Inès, autrice de « Quel papillon ? », rangé dans « Autre »
- Quand un administrateur le range dans « Animaux »
- Alors Inès lit dans Activité « L'équipe de {{appName}} a rangé « Quel papillon ? » dans
  Animaux », avec la miniature du projet ; la toucher ouvre le projet
- Étant donné Malik, qui a écrit l'outil « Glide » en « Autre » sur deux projets
- Quand un administrateur l'ajoute au catalogue, ou le rattache à un outil existant
- Alors Malik lit, une seule fois pour ses deux projets, « « Glide » fait maintenant partie des
  outils de {{appName}} » (ou « … s'affiche maintenant comme « Glide Apps » »), et la toucher ouvre
  la page de l'outil
- Et « Laisser hors du catalogue » ne prévient personne : rien ne change pour le projet
- Et un administrateur n'est jamais prévenu de ses propres gestes ; un projet privé, retiré ou
  supprimé depuis ne laisse plus la notification apparaître
- Et ces deux notifications ne partent jamais par e-mail : Activité seulement

### L'écran « Notifications » des réglages (planche `R8-Reglages`)

- Étant donné Léa dans Réglages → Notifications
- Alors l'écran montre en tête un exemple de notification sans nom (A3 : « 12 réactions sur
  Raconte-moi un tableau ») et « Dans l'appli, tout arrive dans l'Activité. Réactions et
  abonnés : combien, jamais qui. »
- Et une ligne « Sur ce téléphone » grisée, « Bientôt »
- Et « Par e-mail », une ligne par type avec son choix actuel ; un toucher ouvre les choix sur
  place (boutons radio), un seul type ouvert à la fois ; chaque choix s'enregistre aussitôt

| Type | Choix | Par défaut |
| --- | --- | --- |
| Réactions | Dans le récap · Jamais | Dans le récap |
| Commentaires sur tes projets | Tout de suite · Dans le récap · Jamais | Dans le récap |
| Réponses et mentions | Tout de suite · Dans le récap · Jamais | Dans le récap (Louis, 12/11 : la règle de 6c, aucun e-mail immédiat sans l'avoir demandé, l'emporte sur B7) |
| Nouveaux abonnés | Dans le récap · Jamais | Dans le récap |
| Mises à jour suivies | Dans le récap · Jamais | Dans le récap |
| Coin des testeurs (appels, retours, réponses, « Réglé ») | Tout de suite · Dans le récap · Jamais | Dans le récap |
| Le récap | Activé · Désactivé | Activé, le dimanche à 10 h (B7) |

- Et en bas, « Les e-mails de sécurité du compte arrivent toujours. »
- Et quand le récap est désactivé, les types réglés « Dans le récap » le disent (« Le récap est
  coupé : rien ne part ») sans changer leur choix
- Et les choix d'aujourd'hui sont repris : le récap reste activé ou coupé ; « Un e-mail quand on
  me mentionne ou me répond » activé devient « Réponses et mentions : Tout de suite », coupé
  devient « Dans le récap »

### Les e-mails « tout de suite »

- Étant donné Papi Jean, qui a réglé « Commentaires sur tes projets » sur « Tout de suite »
- Quand Léa commente « Décollage ! »
- Alors 15 minutes plus tard, un e-mail court le prévient, avec ce qui est arrivé entre-temps
  pour tous ses types « Tout de suite », regroupé dans un seul e-mail ; au plus un par heure
- Mais rien ne part s'il a ouvert Activité entre-temps, ou si le contenu a disparu pour lui ; ce
  qui part se calcule au moment de l'envoi (comme aujourd'hui pour les mentions)
- Et un commentaire, une réponse ou une mention donnent leur début (80 caractères, liens
  désarmés) ; **un appel ou un retour de testeur ne donne aucun texte** (« Inès t'a envoyé un
  retour sur Décollage ! ») : le fil est privé, et une messagerie le garderait
- Et chaque ligne mène à sa page dans l'appli (le commentaire en contexte, le bon fil du coin)
- Et chaque e-mail dit pourquoi on le reçoit, et porte « Ne plus recevoir ces e-mails » : la page
  sans connexion propose de passer ces types à « Dans le récap » ou à « Jamais », confirmé par un
  bouton ; le « Se désabonner » de la messagerie (en-tête List-Unsubscribe, un clic, sans page)
  les passe à « Dans le récap » (Louis, 12/11/2026) ; rien ne remonte jamais un type réglé sur
  « Jamais »
- Et l'objet de l'e-mail ne nomme jamais un retour du coin
- Et un même événement ne part jamais deux fois par e-mail, tout de suite puis dans le récap

### Le récap de la semaine, habillé (planche `R8-Recap`, A5, B7)

- Étant donné Inès, récap activé, avec du nouveau cette semaine
- Quand arrive **le dimanche à 10 h** (heure de Paris ; aujourd'hui le lundi à 9 h, B7)
- Alors elle reçoit « Ta semaine sur {{appName}}, Inès » : un bandeau miel avec le logo de jour,
  une carte de 600 px, Funnel Display si la messagerie l'affiche, Arial sinon, et une version
  texte envoyée avec
- Et les parties, chacune seulement si elle a quelque chose à dire :
  - **« Tes projets »** : chaque projet avec ses nombres en pastilles (« 23 réactions »,
    « 4 commentaires », « 2 nouveaux abonnés ») et « Lire les commentaires » ; les réponses et
    mentions réglées « Dans le récap », avec le nom de qui a écrit, jamais le texte ;
  - **« Nouveaux projets de tes proches »** : les projets publiés dans la semaine par les membres
    qu'elle suit (titre et nom seuls, jamais l'accroche : la règle de 6c, Louis 12/11/2026 ;
    « Voir le projet »), trois au plus ;
  - **« Ils cherchent des testeurs »** : un projet d'un proche devenu « Testable » (à défaut,
    publié) dans la semaine, dont elle n'est ni l'autrice, ni testeuse, ni retirée, avec « Tester
    la démo », qui mène à la page du projet ;
  - **« Les projets que tu suis ou que tu testes »** et **« Le coin des testeurs »** : comme en R7a
    et R7b, des nombres et des liens
- Et **quatre images au plus**, jointes à l'e-mail, jamais chargées à distance : deux pour « Tes
  projets », une pour les proches, une pour les testeurs ; de petites vignettes réduites,
  ré-encodées, sans métadonnées, le titre du projet en texte de remplacement ; un projet sans
  image prend une tuile miel avec l'icône de sa catégorie, comme un projet d'un autre membre qui
  a un signalement ouvert : sa photo ne sort pas de {{appName}} tant que la modération n'a pas
  décidé
- Et le pied dit pourquoi elle le reçoit (« Tu reçois ce récap le dimanche, parce qu'il est activé
  dans tes réglages. Il ne parle que de projets visibles des membres. »), avec « Changer mes
  préférences » et « Ne plus recevoir ce récap »
- Et un membre qui recevait déjà le récap lit, une seule fois, dans son premier récap du
  dimanche : « Nouveau : ton récap arrive le dimanche et montre aussi les projets publiés par les
  membres que tu suis, et ceux qui cherchent des testeurs. Tu peux le régler ou le couper dans
  tes réglages. » ; le premier récap d'un nouveau membre dit la même chose
- Et l'aide du choix « Membres » à la publication et à la modification dit désormais : « Les
  membres de {{appName}} verront ce projet ; tes abonnés le trouveront dans leur fil et dans leur
  récap par e-mail, qui reste dans leur messagerie. »
- Et jamais un projet privé, retiré, d'un membre bloqué dans un sens ou dans l'autre, ni d'un
  membre suspendu ; tout se calcule au moment de l'envoi
- Et il reprend chaque type réglé « Dans le récap », et rien de ce qui est parti « tout de suite »
- Et le reste ne change pas : rien s'il n'y a rien, arrêt après 3 récaps sans visite (le 3e le
  dit), le premier récap explique pourquoi il arrive, aucun lien ni domaine écrit par un membre
- Et le récap des « Autre » aux administrateurs garde le lundi à 8 h
- **Règle qui change** (phase 1, 6c) : « aucune image dans un e-mail » devient « quatre vignettes
  jointes au récap, jamais chargées à distance » (A5)
- La partie « Dans tes ruches » : R10

### Repris des listes « À reprendre » et « À surveiller »

- Les textes des e-mails de compte (design, « R8 ») : la version texte de la réinitialisation et
  du changement d'adresse ne parle plus d'un « bouton ci-dessous » ; « Ton mot de passe a changé »
  dit quoi faire si ce n'était pas toi (« Mot de passe oublié ») ; l'e-mail du changement
  d'adresse a un titre
- Les appels à tester, sans plafond tous projets confondus (sécurité, R7b sec-S4) : 20 appels par
  jour et par membre au plus, en plus des 5 par projet

### Mes données

- L'export contient ses choix par type et la date du dernier e-mail « tout de suite »
- La suppression du compte les efface ; les notifications des autres qui venaient de ses gestes
  disparaissent avec eux, comme aujourd'hui

### Le parcours d'un membre

- Le parcours (`journey`) : Papi Jean répond à Léa sur « Le ciel de ce soir » en la mentionnant ;
  Léa voit la cloche s'allumer, ouvre Activité (la ligne en miel sous « Aujourd'hui »), touche la
  notification et arrive sur la réponse, éclairée, dans la feuille des commentaires ; elle ouvre
  la roue, règle « Commentaires sur tes projets » sur « Tout de suite », revient, et la page
  « Activité » n'a plus de miel

### Les choix de la session (12/11/2026), validés avec ce scénario

1. **« Retours par e-mail »** (renvoi de R7b) veut dire : être prévenu par e-mail d'un nouveau
   message du coin, sans son texte. Répondre depuis sa messagerie vient plus tard.
2. **Le coin des testeurs a sa ligne** dans les réglages (« Tout de suite » possible, « Dans le
   récap » par défaut), absente des planches du 28/10 qui précèdent R7b.
3. **Projet rangé et outil rattaché** : Activité seulement, signés « L'équipe de {{appName}} »,
   jamais le nom de l'administrateur.
4. **« Ne plus recevoir ces e-mails »** depuis un e-mail « tout de suite » propose « Dans le
   récap » ou « Jamais », au lieu de tout couper.
5. **Pas de nouveau regroupement** : les commentaires restent un par ligne, comme sur la planche.
6. **Le récap ne montre pas le domaine de la démo** (la planche l'écrit sous « Tester la démo ») :
   un e-mail ne porte aucun domaine venu d'un membre ; la page « Tu quittes {{appName}} » le montre.
7. **Les nouveaux projets des proches suffisent à faire partir un récap** : « du nouveau » veut
   dire du nouveau dans une partie, quelle qu'elle soit.

### Les planches (décision de Louis, 12/11/2026 : les visuels d'abord)

Dessinées et validées par Louis avant la relecture du plan :
- `R8-Activite-Plus` : les lignes absentes des planches du 28/10 (appel à tester, retour, réponse,
  « Réglé dans la v1.3 », projet rangé, outil rattaché), de jour, téléphone ;
- `R8-Contexte` : la feuille des commentaires ouverte sur une réponse éclairée, et l'état « Ce
  commentaire n'est plus là. » ;
- `R8-Email-TdS` : l'e-mail « tout de suite » qui regroupe un commentaire, une mention et un retour
  de testeur (sans texte), et sa page « Ne plus recevoir ces e-mails » ;
- `R8-Reglages`, complétée : la ligne « Coin des testeurs », et un type « Dans le récap » quand le
  récap est coupé ; `R8-Recap`, corrigée : sans le domaine de la démo.

## R9 — La modération, avec 7d

Statut : **validé par Louis** le 12/11/2026 (conversation « plan » de R9), tel quel, avec les
huit choix de la session et les trois planches à dessiner.

R9 refait le geste de signaler et l'écran de la modération d'après les planches du 28/10
(`R9-Signaler`, `R9-Signaler-Danger`, `R9-Signaler-Envoye`, `R9-Bloquer`,
`R9-Moderation-Telephone`, `R9-Moderation-Desktop`, `R9-Retirer`, `R9-Suspendre`, `R9-Suspendu`,
`R9-Partie-Retiree` ; décisions A4, A6, A7, A12, B8, F-S4, F-Ad3). Elle livre aussi 7d, jamais
ouverte seule (scénario de 7c, `phase-1.md`, validé le 26/10) : signaler et retirer une seule
partie d'un contenu, le nom et le pseudo provisoires, ce qu'un membre suspendu peut retirer
(jur-R5), la levée « pour erreur » dite au membre (jur-R6), et les points « Signaler » de la liste
« À reprendre ».

Les règles d'aujourd'hui ne changent pas, sauf celles que cette section nomme : la modération ne
montre jamais qui a signalé (A4) ; un administrateur ne décide pas de ce qui le concerne ; au plus
50 décisions par administrateur et par jour ; le mot de passe retapé pour une suspension sans fin
ou plus de 10 retraits en une heure ; une seule décision à la fois par cible (« Déjà traité ») ;
20 signalements par membre et par jour ; une décision gardée un an après la fin de son effet ; la
modération lit un message du coin des testeurs signalé et sa capture, jamais le reste du fil.

Hors de R9, et où ça va :
- le signalement par un visiteur sans compte (planche `R12-Visiteur-Signaler`) : R12 ;
- l'échelle des sanctions et le réexamen des suspensions sans fin (J11), la base légale de
  l'historique nominatif : R11, la conformité, avec un professionnel ;
- un commentateur qui veut effacer son commentaire sur un projet retiré (« À surveiller ») : R11 ;
- une modération assistée par l'IA, ou des modérateurs qui ne sont pas administrateurs : non.

### Signaler, dans une feuille (planches `R9-Signaler`, `R9-Signaler-Danger`)

- Étant donné Malik, connecté, sur le projet « Météo » d'Inès
- Quand il choisit « Signaler ce projet » dans le menu « … » (ou le lien gris du bas de la page)
- Alors une feuille s'ouvre par-dessus le projet, qui se floute, titrée « Signaler ce projet »
- Et elle rappelle ce qui est signalé : la miniature, le titre et l'auteur
- Et elle demande d'abord « Quelle partie ? » : « Tout le projet » (choisi d'avance), ou une partie
  présente sur la page (voir « Les parties », plus bas)
- Quand il choisit « La 2e photo » puis « Continuer »
- Alors la feuille demande « Qu'est-ce qui ne va pas ? », avec les huit motifs (A6) :
  « Contenu illégal », « Harcèlement ou haine », « Contenu sexuel ou violent », « Arnaque ou
  spam », « Usurpation d'identité », « Une photo ou une information sur moi sans mon accord »,
  « Lien, démo ou prompt dangereux » (arnaque, virus, hameçonnage, prompt piégé) et « Autre chose »
  (les sept d'aujourd'hui gardent leur texte)
- Et un champ de précision, facultatif, avec un texte d'exemple et « N'ajoute pas d'informations
  personnelles inutiles »
- Et « La modération voit qui signale, pour éviter les abus », la phrase de bonne foi, et le bouton
  « Envoyer le signalement »
- Quand il choisit « Harcèlement ou haine », « Contenu sexuel ou violent » ou « Contenu illégal »
- Alors la phrase du 112 paraît, et seulement pour ces trois motifs : « Si quelqu'un est en danger
  maintenant, appelle le 112 : nous lisons les signalements, mais pas en temps réel. » (B8)
- Et pour « Contenu illégal », la précision devient obligatoire : « Dis-nous pourquoi »
- Quand il envoie sans motif
- Alors le bouton n'était pas grisé : « Choisis un motif » paraît sous la liste, et le focus y va
  (« À reprendre », Signaler 7a)
- Quand il envoie « Contenu illégal » sans précision
- Alors l'erreur paraît sous le champ, et l'aide reste lisible (« À reprendre », `TextField`)
- Une note de version, un commentaire, un message du coin ou un appel à tester sans partie à
  choisir : la feuille commence au motif, titrée « Signaler ce commentaire » (ou « ce
  message »…)

**Les sorties de la feuille** (téléphone et web) :
- « Retour », en tête de la deuxième étape, revient à « Quelle partie ? » en gardant le choix
- Annuler, Échap, glisser vers le bas, toucher le voile ou le Retour du navigateur ferment la
  feuille ; si une précision est écrite, la feuille demande d'abord « Abandonner le
  signalement ? » (Abandonner / Continuer)
- Pendant l'envoi, la feuille ne se ferme pas ; la double tape n'envoie qu'une fois
- La page `/report` disparaît ; un ancien lien `/report?kind=…&id=…` ouvre le contenu avec sa
  feuille

**Bloquer aussi** (décision des planches, 28/10 : une case avant l'envoi)
- Étant donné Malik qui signale un contenu d'Inès
- Alors sous la précision, une case « Bloquer aussi Inès Haddad (@ines_haddad) », jamais cochée d'avance
- Quand il la coche et envoie
- Alors la fenêtre de blocage (A7, plus bas) s'ouvre avant l'envoi ; « Bloquer » envoie le
  signalement puis bloque ; « Annuler » décoche la case et laisse la feuille ouverte
- La case n'existe pas pour son propre contenu, ni pour un membre déjà bloqué ; un administrateur
  se bloque comme tout membre : sa place ne se devine nulle part (relecture de sécurité, 14/11/2026)

**Envoyé** (planche `R9-Signaler-Envoye`)
- Alors la feuille dit « Merci, ton signalement a été envoyé. La modération va le regarder. Si le
  contenu est encore là, une notification te dira ce qu’elle a décidé. » (14/11/2026), et
  « Fermer » ; si Malik a bloqué Inès, elle le rappelle (« Tu as aussi bloqué Inès Haddad. »)

**Les cas où l'on ne signale pas**
- Son propre contenu : « Signaler » n'est dans aucun menu ; un ancien lien ouvre la feuille sur
  « C'est ton projet : tu peux le modifier ou le supprimer », avec « Modifier » et « Fermer »,
  sans aucune attente (« À reprendre », 7c : 3 lectures, « décider », « Retour à l'accueil »)
- Déjà signalé à l'identique : « Tu as déjà signalé cette partie. La modération va la regarder. »
- 20 signalements envoyés en 24 heures : la feuille le dit **dès son ouverture**, avant tout
  choix, avec l'adresse de contact en lien et la phrase du 112
- Le contenu a disparu entre-temps : « Ce contenu n'est plus là. », et « Fermer »

### Les parties

Ce qu'on peut viser, et ce que la modération peut retirer seul (le registre des entrées dit, pour
chaque champ, s'il se retire seul ; un test échoue si un champ n'y est pas classé) :

| Contenu | Parties qu'on signale | Retirée seule ? |
| --- | --- | --- |
| Projet | tout le projet ; le titre ; le pitch ; la description ; la catégorie ; les outils ; le lien de la démo ; la couverture ; chaque photo ; la description d'une photo ; le prompt de départ | la description, les outils, le lien de la démo, la couverture, une photo, la description d'une photo, le prompt de départ. Le titre et le pitch : on retire tout le projet. La catégorie : la modération la range (R6b), sans retrait |
| Mise à jour | toute la mise à jour ; « Ce qui a changé » ; chaque photo (avant / après comprises) | une photo ; le texte : toute la mise à jour |
| Profil | tout le profil ; le nom ; le pseudo ; la bio ; les outils ; la photo | chaque partie (un profil entier ne se retire pas : il se suspend) |
| Message du coin, appel à tester | tout le message ; sa capture (ou sa photo) | la capture ou la photo |
| Commentaire, note | en entier | en entier |

La liste ne propose que les parties présentes (un projet sans prompt n'a pas « Le prompt de
départ ») ; les photos se nomment par leur rang et montrent leur miniature (« La 2e photo »).

### Retirer une partie (planches `R9-Retirer`, `R9-Partie-Retiree`)

- Étant donné Louis, administrateur, devant le signalement de la 2e photo de « Météo »
- Quand il choisit « Retirer »
- Alors une fenêtre s'ouvre : « Seulement cette partie » (choisi d'avance) ou « Tout le projet »,
  le fondement (les règles de {{appName}} ou la loi, et laquelle), et l'explication, avec « Montrée
  à Inès »
- Quand il confirme
- Alors la photo disparaît pour tous, sauf Inès ; le reste du projet reste affiché ; ses
  signalements sont traités, et ceux qui visaient tout le projet restent dans la file
- Et Inès reçoit une notification qui nomme la partie (« La 2e photo de Météo a été retirée par la
  modération »), l'explication, et « Contester »
- Et dans « Météo », Inès voit la photo avec « Retiré par la modération », le fondement,
  l'explication, la date, « Contester » avec l'adresse de contact écrite en clair (et son lien), la
  possibilité de saisir la justice, « Remplacer » et « Supprimer » (décision L2 de Louis, 13/11/2026)
- Et Malik est prévenu que son signalement a été traité, sans le détail de la décision : « la
  partie que tu as signalée a été retirée », jamais « le projet a été retiré » (14/11/2026)

Ce que voient les autres d'une partie retirée : rien, comme si elle n'avait jamais été là (une
couverture retirée laisse la place à la photo suivante, ou au fond de la marque ; un lien de démo
retiré enlève « Tester » ; des outils ou une bio retirés, leur ligne disparaît ; une photo de
profil retirée laisse les initiales).

- Quand Inès remplace la photo
- Alors la nouvelle s'affiche pour tous, peut être signalée à son tour, et la décision reste dans
  l'historique
- Quand Inès touche « Supprimer », une fenêtre demande « Supprimer cette photo ? » (« Elle
  disparaîtra de ton projet pour de bon : tu ne pourras pas la récupérer. »), « Annuler » et
  « Supprimer » ; « Supprimer » n'existe que sous une photo ou la couverture, jamais sous la seule
  description d'une photo (14/11/2026)
- Quand Inès supprime la photo, la partie et sa mention « Retiré » disparaissent

### Un nom ou un pseudo retiré (planche `R9-Partie-Retiree`)

- Étant donné Louis qui retire le pseudo de Karim, « @karim_le_vrai »
- Alors Karim s'appelle partout « @membre_4f2a » (quatre signes au hasard, sans tiret), et l'ancien
  pseudo reste réservé 30 jours : personne ne peut le prendre, pas même Karim
- Et Karim reçoit une notification ; à sa visite suivante, une feuille lui demande de choisir un
  nouveau pseudo (« Plus tard » la ferme ; un bandeau sur « Moi » reste jusqu'au choix)
- Même chose pour le nom, qui devient « Membre » jusqu'à ce que Karim en choisisse un autre
- Un pseudo choisi après un retrait peut être signalé et retiré à son tour

### Rétabli

- Quand Louis rétablit un contenu ou une partie retirés (onglet « Retirés »)
- Alors l'auteur reçoit une notification « Ton projet Météo est de nouveau visible » (ou « La 2e
  photo de Météo… »), signée « L'équipe de {{appName}} », sans nom d'administrateur (renvoyé de R8)
- Et un pseudo ou un nom rétabli ne revient pas tout seul s'il a été changé entre-temps : la
  notification dit alors que l'ancien ne peut pas revenir (décision L3 de Louis, 13/11/2026)

### Bloquer (planche `R9-Bloquer`, A7, F-S4)

- Étant donné Malik sur le profil d'Hugo, qui choisit « Bloquer »
- Alors la fenêtre est titrée « Bloquer Hugo Lefèvre (@hugo_l) ? », avec son avatar et la pastille
  « bloqué »
- Et le résumé en gras, quatre puces courtes toujours visibles, puis le texte complet d'aujourd'hui
  (rien du texte juridique ne disparaît)
- Et une case « Signaler aussi son profil », jamais cochée d'avance ; cochée, « Bloquer » bloque
  puis ouvre la feuille « Signaler ce profil »
- La case n'existe pas quand la fenêtre vient de « Bloquer aussi » (le signalement est déjà
  parti)

### La modération sur ordinateur (planche `R9-Moderation-Desktop`, B8, F-Ad3)

- Étant donné Louis sur « Modération », sur un écran large
- Alors la page porte un sous-titre et la pastille « Réservé aux administrateurs »
- Et trois colonnes : la file (« À traiter (3) » et « Retirés »), le détail du signalement choisi,
  l'historique récent ; « Outils » et « Catégories » restent en tête de la file
- Et chaque signalement de la file montre son motif en titre, la partie visée, « Signalé 2 fois »
  en rouge quand plusieurs membres l'ont signalé, et l'heure relative (l'heure exacte au survol et
  dans le détail)
- Et le détail montre « Un commentaire sur Décollage ! » (ou « La 2e photo de Météo »), avec la
  miniature et « Voir en contexte », la copie gardée au moment du signalement, les précisions des
  membres (jamais leurs noms), et les actions : Retirer, Classer sans suite, Suspendre le compte
- Et la fiche de l'auteur : « Compte récent » s'il a moins de 14 jours, sa date d'inscription, ses
  nombres de projets et de commentaires, et ce que la modération a déjà décidé pour lui (« 2
  retraits, 1 suspension levée ») ; les administrateurs seuls la voient
- Et l'historique montre une icône de couleur par action (retrait, retrait d'une partie,
  rétablissement, classement, suspension, levée) ; « Tout l'historique » ouvre l'historique
  complet, filtrable par membre comme aujourd'hui
- Et « Suspendre le compte » ouvre une fenêtre (planche `R9-Suspendre`) : 7 jours, 30 jours ou sans
  fin, le fondement, l'explication, le mot de passe pour « sans fin » ; la page `/suspend`
  disparaît, la levée passe par la même fenêtre

### La modération sur téléphone (planche `R9-Moderation-Telephone`)

- Étant donné Louis sur « Modération », sur son téléphone
- Alors il voit la file (« À traiter (3) », « Retirés ») et un bouton « Historique »
- Quand il touche un signalement, son détail s'ouvre en page (même contenu que la colonne du
  milieu) ; Retirer et Suspendre ouvrent des feuilles

### Un compte suspendu (planche `R9-Suspendu`, jur-R5, jur-R6, J12, J14)

- Étant donné Karim, suspendu, qui se connecte
- Alors le bandeau donne la raison, la fin et « Contester », un lien vers l'adresse de contact dont
  l'objet nomme la décision (J12) ; le « + » disparaît de la barre d'onglets
- Et en plus de ce qu'il peut faire aujourd'hui (supprimer ses contenus, exporter, régler, bloquer,
  signaler…), il peut **retirer** sa bio, ses outils et sa photo, sans en mettre d'autres (jur-R5)
- Et il peut passer un projet public en privé, jamais l'inverse (J14), après une confirmation
  (décision L6 de Louis, 13/11/2026)
- Quand Louis lève la suspension « pour erreur »
- Alors la notification le dit : « Ta suspension a été levée : c'était une erreur de la
  modération. Tu peux de nouveau publier et interagir. » (jur-R6 ; texte relu, décision L1 de
  Louis, 13/11/2026)
- Et une levée simple dit seulement que la suspension est levée, comme aujourd'hui

### L'adresse de contact, partout un lien

- La connexion, les bandeaux, les notifications de modération et les feuilles de Signaler écrivent
  l'adresse de contact comme un lien (`ContactLink`) (« À reprendre ») ; « Contester » en est un

### Accessibilité (« À reprendre », points « Signaler » de 7a et 7b)

- La notice d'un contenu retiré est un groupe nommé par son titre ; dans la notification de
  retrait, la citation du contenu vient sous le titre, avant « Pour contester »
- Sur téléphone, le focus du lecteur d'écran revient sur « … » quand le menu se ferme
- Sur ordinateur, le premier Tab après l'ouverture de la feuille va dans la feuille (plus de
  « BODY [FOCUS PERDU] » à 1440 px), et le focus revient sur « Signaler » à la fermeture
- Chaque choix de la feuille se parcourt aux flèches, un seul arrêt de Tab par liste

### Ménage (restes de R8)

- Les clés orphelines `profile.emails.*` et `notifications.removedDetail` disparaissent ; la tâche
  retirée `mention-emails` sort du planificateur

### Mes données

- L'export garde les décisions qui visent le membre, avec la partie retirée et le pseudo
  provisoire ; jamais l'administrateur, jamais qui a signalé
- Un signalement garde la partie visée ; la suppression du compte s'en charge comme aujourd'hui
  (un an, sans le nom)

### Le parcours d'un membre

- Le parcours (`journey`) : Malik signale la 2e photo de « Le ciel de ce soir » (« Lien, démo ou
  prompt dangereux ») depuis le menu « … » ; un administrateur la retire seule ; Léa, l'autrice,
  voit la photo « Retiré par la modération » et la remplace ; Malik voit que son signalement a été
  traité

### Les choix de la session (12/11/2026), à valider avec ce scénario

1. **« Bloquer aussi » est une case avant l'envoi**, comme le dit `decisions.md` (28/10), et non
   un bouton sur l'écran « Envoyé » comme le dessine `R9-Signaler-Envoye`.
2. **Le huitième motif** s'appelle « Lien, démo ou prompt dangereux » (les renvois de R5a et R6),
   pas « Lien ou démo dangereux » (A6).
3. **La catégorie se signale, mais ne se retire pas** : la modération la range (R6b).
4. **Le quota se dit à l'ouverture de la feuille**, pas après qu'on a tout rempli.
5. **La fenêtre « Retirer »** propose deux choix, comme la planche : retirer une autre partie que
   celle signalée n'y est pas (7c le permettait) ; on rouvre alors le contenu.
6. **Le pseudo provisoire se demande dans une feuille qu'on peut remettre à plus tard**, avec un
   bandeau sur « Moi ».
7. **Deux points des listes** : J12, « Contester » nomme la décision dans l'objet de l'e-mail ;
   J14, un suspendu peut passer un projet en privé.
8. **La copie gardée** au moment du signalement reste la preuve montrée à la modération, même si
   l'auteur a changé la partie depuis.

### Les planches qui manquent (les visuels d'abord)

Les dix planches du 28/10 couvrent l'essentiel. À dessiner et faire valider avant la relecture du
plan :
- `R9-Signaler-Etats` : le quota atteint à l'ouverture, « C'est ton projet », « déjà signalé »,
  « Abandonner le signalement ? » (téléphone, jour) ;
- `R9-Moderation-Detail-Telephone` : le détail d'un signalement sur téléphone, la fiche de
  l'auteur, la feuille « Retirer » ;
- `R9-Activite-Moderation` : les lignes d'Activité d'une partie retirée, d'un rétablissement, d'une
  levée pour erreur et du pseudo provisoire (téléphone, jour).

## R10 — Les Ruches

Statut : **validé par Louis** le 14/11/2026 (conversation « plan » de R10), tel quel, avec les
dix choix de la session et les quatre planches à dessiner.

R10 crée les ruches, des groupes de proches comme « Ma ruche Famille », d'après les planches du
28/10 (`R10-Ruches`, `R10-Ruche`, `R10-Ruche-Nuit`, `R10-Inviter`, `R10-Membres`,
`R10-Ruche-Desktop` ; décisions F-Nav1, F-Fil9, F-Fil11, F-Fil13, F-Pub6, F-Et5 et `decisions.md`
du 28/10). Elle livre aussi ce que les tranches d'avant lui ont renvoyé : le sélecteur du Fil,
« Tes ruches » sur ordinateur, les invitations au premier lancement (R4), « Une ruche » dans « Qui
peut le voir ? » (R6a), la mosaïque de tuiles (R6b), une mise à jour dans une ruche (R7a), la
ligne « Ruches » des réglages et la partie « Dans tes ruches » du récap (R8). Dans le code, la
fonction s'appelle `hive`.

Les règles d'aujourd'hui ne changent pas, sauf celles que cette section nomme : un projet privé,
retiré, d'un membre bloqué dans un sens ou dans l'autre n'apparaît nulle part ; tout se calcule au
moment de la lecture ; un membre suspendu lit et exporte, mais ne publie pas ; un e-mail ne
contient aucun lien ni domaine venu d'un membre ; la modération ne montre jamais qui a signalé.

Hors de R10, et où ça va :
- l'âge minimum (choix de Louis du 14/11/2026 : **15 ans**) : la case « J'ai 15 ans ou plus » à
  l'inscription et sa mention dans les règles viennent avec R11, la conformité ;
- les défis d'une ruche : plus tard (la planche le dit : « Les défis viendront plus tard ») ;
- un tchat ou une conversation de groupe dans une ruche : non (F-Nav1) ;
- inviter dans une ruche quelqu'un qui n'a pas encore de compte : plus tard, avec l'ouverture des
  inscriptions (R12 au plus tôt) ; en R10, on invite des membres de Waiggle ;
- plusieurs animateurs, ou des rôles en plus : plus tard, si les ruches le demandent ;
- un projet réservé à plusieurs ruches à la fois : non (F-Pub6 dit « une ruche ») ;
- des ruches payantes : non décidé (`compliance-backlog`).

### L'onglet Ruches (planche `R10-Ruches`)

**Mes ruches**
- Étant donné Inès, membre des ruches « Famille » et « Amis du jeudi »
- Quand elle touche l'onglet Ruches
- Alors la page « Mes ruches » remplace « Les ruches arrivent bientôt »
- Et une phrase dit : « Une ruche, c'est un groupe de proches. On y entre par une invitation ; ses
  membres se voient entre eux et partagent des projets réservés à la ruche. »
- Et chaque ruche a sa ligne : son alvéole miel avec son icône, son nom, « 4 membres · animée par
  Papi Jean », la pile des photos de quelques membres, et ses nouveautés (« 2 nouveautés », ou
  « rien de neuf »)
- Et les nouveautés comptent les projets publiés et les mises à jour dans la ruche depuis sa
  dernière visite de la page de cette ruche
- Et les ruches vont de la plus récemment active à la plus calme
- Et le bouton « Créer une ruche » est en haut

**Les invitations reçues**
- Étant donné une invitation de Nora Benali dans la ruche « Atelier IA »
- Alors une partie « Invitations » porte une pastille avec leur nombre, au-dessus de ses ruches
- Et chaque invitation dit « Nora Benali t'invite dans la ruche Atelier IA », « 6 membres · il y a
  3 h », avec « Rejoindre la ruche » et « Refuser »
- Et sous les boutons : « Refuser ne prévient personne. »
- Quand elle touche « Rejoindre la ruche »
- Alors elle devient membre, la ruche prend sa place dans la liste, et sa page s'ouvre
- Quand elle touche « Refuser »
- Alors l'invitation disparaît de chez elle, et personne n'est prévenu : pour la ruche,
  l'invitation reste « Invitation envoyée » et compte dans les 50 places jusqu'à ses 30 jours ; ni
  nouvelle invitation ni nouvel e-mail avant (choix de Louis du 14/11/2026, relecture du plan)
- Et deux tapes rapides n'acceptent ni ne refusent deux fois

**Aucune ruche**
- Étant donné un membre qui n'est dans aucune ruche et n'a aucune invitation
- Alors la page montre la mascotte, la phrase qui explique les ruches et « Créer une ruche »

### Créer une ruche (planche à dessiner `R10-Creer`)

- Quand Inès touche « Créer une ruche »
- Alors une feuille demande le nom de la ruche (« Famille », 40 caractères au plus) et une icône,
  à choisir parmi douze, posée dans l'alvéole miel (décision du 28/10)
- Et un aperçu montre l'alvéole et « Ma ruche Famille »
- Quand elle touche « Créer »
- Alors la ruche existe, Inès en est l'animatrice et son seul membre, et la page de la ruche
  s'ouvre sur « Inviter des proches »
- Et un membre crée 10 ruches au plus, et il est membre de 20 ruches au plus ; au-delà, le bouton
  explique pourquoi
- Et un nom vide, ou fait seulement d'espaces, est refusé avec un message sous le champ
- Et un membre suspendu ne voit pas « Créer une ruche »

### La page d'une ruche (planches `R10-Ruche`, `R10-Ruche-Nuit`, `R10-Ruche-Desktop`)

**Le haut**
- Étant donné Inès sur la page de « Famille »
- Alors le haut dit « Ma ruche » puis « Famille », avec l'alvéole, la pile des photos, « 4 membres »
  et le bouton « Inviter » (si elle a le droit d'inviter)
- Et trois onglets : **Actualité · Projets · 5 · Membres** (le nombre compte les projets réservés
  à la ruche)
- Et aucun tchat (F-Nav1)

**Le projet épinglé**
- Étant donné un projet épinglé par l'animateur
- Alors il vient en premier, en grande carte, avec « Épinglé par Papi Jean »
- Et seul un projet que tous les membres de la ruche peuvent voir s'épingle : un projet réservé à
  la ruche, ou un projet « Membres » d'un membre de la ruche
- Et s'il devient privé, est retiré, ou si son auteur quitte la ruche, l'épingle disparaît d'elle-
  même

**Qui cherche des testeurs**
- Alors sous l'épingle, « Papi Jean cherche des testeurs » montre les projets des membres de la
  ruche qui appellent des testeurs (R7a), avec « Testable » et « Tester »

**L'actualité**
- Alors l'onglet Actualité liste, du plus récent au plus ancien, ce que font les membres : « Léa a
  publié Le plan de table », « Tante Odile a mis à jour Biscotte au parc · v2 », « Papi Jean a
  épinglé … », avec la date relative
- Et un projet réservé à la ruche porte la pastille « Réservé à Famille »
- Et l'actualité ne montre que des projets qu'Inès peut voir : ceux réservés à cette ruche et les
  projets « Membres » de ses membres ; jamais un projet réservé à une autre ruche, privé, retiré,
  ou d'un membre bloqué
- Et elle remonte 30 jours, par pages de 20

**Les projets**
- Alors l'onglet Projets montre les projets réservés à la ruche en mosaïque de tuiles (F-Et5),
  du plus récent au plus ancien

**Les membres** (planche `R10-Membres`)
- Alors l'onglet Membres liste les membres : photo, nom, pseudo, « Animateur » pour l'animateur,
  « toi » pour Inès ; le nom ouvre la page du membre
- Et en bas, « Inviter un proche » (si elle a le droit d'inviter)
- Et la phrase : « L'animateur épingle un projet, choisit qui peut inviter et peut retirer un
  membre. Les membres d'une ruche se voient entre eux, jamais les autres membres de Waiggle. »
- Et sous « Mes suggestions », l'interrupteur « Ne pas me proposer aux autres » (voir plus bas)
- Et tout en bas, « Quitter la ruche »

**Sur ordinateur** (planche `R10-Ruche-Desktop`)
- Alors l'actualité est au centre, la colonne de gauche porte les membres, et la colonne de droite
  « Qui cherche des testeurs » avec « Tester »
- Et une phrase dit : « Une partie de la ruche arrive dans ton récap du dimanche. Les défis
  viendront plus tard. »

**Qui peut ouvrir la page**
- Seuls ses membres ; pour tout autre membre, l'adresse d'une ruche répond comme une page qui
  n'existe pas, sans dire si la ruche existe
- Un membre invité, qui n'a pas encore accepté, voit seulement son invitation (nom, icône,
  animateur, nombre de membres), jamais l'actualité ni les membres

### Inviter (planche `R10-Inviter`)

**Envoyer une invitation**
- Quand Inès touche « Inviter »
- Alors une feuille « Inviter dans Famille » cherche parmi les membres de Waiggle, par nom ou
  pseudo (la recherche d'aujourd'hui, qui ignore les accents)
- Et chaque résultat a sa photo, son nom, son pseudo et « Inviter » ; un membre déjà dans la ruche
  dit « Déjà membre », un membre déjà invité dit « Invitation envoyée »
- Et une phrase dit : « Tu invites des membres de Waiggle. Ils deviennent membres seulement s'ils
  acceptent ; un refus ne prévient personne. »
- Et un aperçu « Ce que reçoit Max » montre l'invitation et ses trois promesses : « Les membres de
  la ruche verront ton nom et ta photo dans la ruche. » ; « Tu verras les projets réservés à la
  ruche. » ; « Tu pourras quitter la ruche quand tu veux. »
- Quand elle touche « Inviter » sur la ligne de Max
- Alors le bouton dit « Invitation envoyée », et Max la reçoit dans Ruches et dans son Activité
- Et deux tapes rapides n'envoient qu'une invitation

**Qui peut inviter**
- Par défaut, tout membre de la ruche invite ; l'animateur peut réserver ce droit à lui seul
  (`decisions.md`, 28/10)
- Un membre suspendu n'invite pas

**Les limites**
- Une ruche a 50 membres au plus, invitations en attente comprises ; au-delà, « Inviter » le dit
- Un membre envoie 20 invitations par jour au plus
- Une invitation vaut 30 jours, puis disparaît d'elle-même
- On ne peut pas inviter un membre qu'on a bloqué ou qui nous a bloqué : il n'apparaît pas dans la
  recherche, et l'API répond comme pour un membre qui n'existe pas

**Recevoir une invitation**
- Étant donné Max, invité par Inès dans « Famille »
- Alors son Activité dit « Inès Haddad t'invite dans la ruche Famille », et la ligne ouvre l'onglet
  Ruches
- Et s'il ne suit encore personne, l'invitation passe aussi en tête du Fil, au-dessus de « Proches
  à suivre » (F-Fil9, planche `R4-Fil-Premier`)
- Et un e-mail le prévient selon son réglage « Ruches » ; l'e-mail ne contient pas le nom de la
  ruche, écrit par un membre : « Inès Haddad t'invite dans une ruche sur Waiggle. »
- Quand il accepte
- Alors Inès, qui l'a invité, voit dans son Activité « Max a rejoint Famille » ; s'il refuse,
  personne n'en sait rien

### L'animateur (planche à dessiner `R10-Reglages-Ruche`)

- Étant donné Papi Jean, animateur de « Famille »
- Alors un bouton « Réglages de la ruche » lui permet de : changer le nom et l'icône ; choisir qui
  peut inviter (« Tous les membres » ou « Seulement moi ») ; confier l'animation à un autre membre ;
  supprimer la ruche
- Et sur chaque carte de projet que la ruche peut épingler, « Épingler » (un seul projet à la fois ;
  en épingler un autre remplace le premier)
- Et sur la ligne d'un membre, « Retirer de la ruche », avec une confirmation

**Retirer un membre**
- Quand il retire Tante Odile
- Alors elle n'est plus membre, ses projets réservés à la ruche redeviennent privés, et son
  Activité dit « Tu ne fais plus partie de la ruche Famille. », sans dire qui l'a retirée
- Et elle peut être réinvitée plus tard

**Confier l'animation**
- Quand il confie l'animation à Léa
- Alors Léa devient animatrice, Papi Jean redevient membre, et l'Activité de Léa dit « Tu animes
  maintenant la ruche Famille. »

**Supprimer la ruche**
- Quand il touche « Supprimer la ruche »
- Alors une fenêtre dit « Supprimer la ruche Famille ? Ses 5 projets réservés redeviennent privés,
  pour leurs auteurs. Ça ne s'annule pas. »
- Et après confirmation, la ruche disparaît, et chaque membre lit dans son Activité « La ruche
  Famille a été supprimée. »
- Et deux tapes rapides ne suppriment qu'une fois ; la fenêtre ne se ferme pas pendant la
  suppression

**Un animateur suspendu**
- Il garde son rôle mais n'épingle, ne renomme, n'invite et ne retire plus personne tant que dure
  la suspension ; la ruche continue

### Quitter une ruche

- Quand Léa touche « Quitter la ruche »
- Alors une fenêtre dit « Quitter la ruche Famille ? Tes projets réservés à la ruche redeviennent
  privés. »
- Et la fenêtre dit aussi : « Tes commentaires sur ses projets restent lisibles par ses membres. »
- Et après confirmation, elle n'est plus membre ; personne n'est prévenu
- Et elle peut toujours effacer ses propres commentaires, réactions et messages sur les projets de
  la ruche, sans plus les voir (choix de Louis du 14/11/2026, relecture du plan)
- Et si l'animateur quitte la ruche, l'animation passe au membre le plus ancien, et la fenêtre le
  dit avant (« Léa animera la ruche. ») ; celui-ci est prévenu
- Et si le dernier membre part, la ruche est supprimée, et la fenêtre le dit avant

### Un projet réservé à une ruche (F-Pub6, planche `R6-Publier-Suite`)

**Le choisir**
- Étant donné Inès, membre d'au moins une ruche, qui publie ou modifie un projet
- Alors « Qui peut le voir ? » propose « Membres de Waiggle » (nouveau libellé de « Membres »,
  choix de Louis du 14/11/2026), « Une ruche » et « Privé » (« Public, trouvable
  sur Google » reste pour R12)
- Quand elle choisit « Une ruche »
- Alors elle choisit laquelle parmi ses ruches, et la phrase du bas dit « Seuls les membres de
  Famille verront ce projet. »
- Et un membre qui n'est dans aucune ruche ne voit pas ce choix
- Et un membre suspendu ne publie toujours pas

**Qui le voit**
- Seuls les membres de la ruche, son auteur, et la modération quand il est signalé
- Partout : le Fil, Explorer, « Ils cherchent des testeurs », la recherche, la page de l'auteur, sa
  page, ses images, ses mises à jour, ses commentaires, le coin des testeurs, l'Activité et le
  récap ; pour tout autre membre, son adresse répond comme un projet privé
- Une mise à jour d'un projet réservé n'est vue que des membres de la ruche (renvoi de R7a)
- Partager ce projet dit : « Seuls les membres de Famille pourront l'ouvrir. »
- Un membre qui quitte la ruche perd l'accès tout de suite, même s'il suivait ou testait le projet
- Si son auteur quitte la ruche, en est retiré, ou si la ruche est supprimée, le projet redevient
  privé

### Le Fil (F-Fil9, F-Fil11, F-Fil13 ; planches `R4-Fil`, `R4-Fil-Premier`, `R4-Fil-Desktop`)

**Le sélecteur**
- Étant donné Inès, membre d'au moins une ruche
- Alors des pastilles de verre « Tout · Famille · Amis du jeudi » (une par ruche) restent collées en
  haut du Fil pendant le défilement ; un membre sans ruche ne les voit pas
- Et « Tout » est le Fil d'aujourd'hui : les projets et les mises à jour des membres qu'elle suit,
  y compris leurs projets réservés à une ruche où elle est
- Quand elle touche « Famille »
- Alors le Fil montre les projets et les mises à jour de tous les membres de Famille, même ceux
  qu'elle ne suit pas : les projets réservés à Famille et leurs projets « Membres »
- Et la pastille active a sa goutte ; « Tu es à jour » et le bouton des nouveautés valent pour la
  pastille choisie

**Tes ruches, sur ordinateur**
- Alors la colonne de droite du Fil commence par « Tes ruches » : chaque ruche avec son alvéole,
  son nom et ses nouveautés, qui ouvre sa page ; puis « Proches à suivre » et « Ils cherchent des
  testeurs »

**Proches à suivre**
- Alors les membres de ses ruches qu'elle ne suit pas viennent en premier, puis ceux qui ont publié
  récemment ; la légende dit « Des membres de tes ruches et des membres qui ont publié
  récemment »
- Et jamais un membre qui a choisi « Ne pas me proposer aux autres »

### « Ne pas me proposer aux autres » (planche `R10-Membres`)

- Quand Léa active « Ne pas me proposer aux autres »
- Alors elle n'apparaît plus dans « Proches à suivre », chez personne
- Et la ligne le dit : « Tu n'apparais plus dans « Proches à suivre ». Tu restes dans la recherche
  et dans les membres de tes ruches. »
- Et le réglage vaut pour toutes ses ruches ; il est aussi dans ses réglages, avec les autres
  choix sur ce que les autres voient

### La mosaïque de tuiles (F-Et5, renvoi de R6b)

- Alors la page d'un membre (« Ses projets ») montre les projets en tuiles, comme la page d'un
  outil ; le Fil garde ses grandes cartes
- Et « Récents » dans Explorer garde ses cartes, avec « Suivre » (F-Fil8) et « Tester » (choix de
  Louis du 14/11/2026, relecture du plan : les tuiles les perdraient)

### Les notifications et le récap (renvois de R8)

**L'Activité**
- Les lignes neuves : une invitation reçue ; « Max a rejoint Famille » (à qui l'a invité) ; « Tu ne
  fais plus partie de la ruche Famille. » ; « Tu animes maintenant la ruche Famille. » ; « La ruche
  Famille a été supprimée. »
- Une nouvelle publication dans une ruche ne fait pas de ligne : elle se lit dans les nouveautés de
  la ruche, le sélecteur du Fil et le récap

**Le réglage « Ruches »**
- Les réglages d'e-mail gagnent la ligne « Ruches » : « Tout de suite · Dans le récap · Jamais »,
  « Tout de suite » par défaut (décisions de R8)
- Elle règle l'e-mail d'une invitation ; la partie « Dans tes ruches » du récap est là sauf si
  « Ruches » vaut « Jamais »

**La partie « Dans tes ruches » du récap**
- Alors le récap du dimanche dit, ruche par ruche, les projets publiés et les mises à jour de la
  semaine (titre, auteur), et les invitations en attente si le réglage est « Dans le récap »
- Et un projet réservé à une ruche n'a jamais de vignette (les vignettes restent aux projets
  « Membres ») ; le nom d'une ruche n'est jamais un lien
- Et rien s'il n'y a rien

### Les blocages

- Deux membres d'une même ruche qui se bloquent restent membres tous les deux ; chacun ne voit plus
  rien de l'autre dans la ruche (actualité, projets, membres, épingle, testeurs)
- « Animée par » ne nomme pas un animateur bloqué dans un sens ou dans l'autre
- Sauf pour l'animateur : un membre qui l'a bloqué reste dans sa liste des membres, sous une forme
  réduite (son nom seul, sans photo, pseudo ni lien), avec « Retirer de la ruche » ; un blocage ne
  retire jamais à l'animateur le pouvoir de modérer sa ruche (choix de Louis du 14/11/2026,
  relecture du plan)

### La modération

- Le nom et l'icône d'une ruche se signalent depuis sa page ou depuis l'invitation (« Signaler la
  ruche »), avec les motifs d'aujourd'hui
- La modération voit le nom, l'icône, l'animateur et le nombre de membres, jamais l'actualité ni
  les projets réservés (sauf un projet signalé, comme aujourd'hui)
- Elle peut retirer le nom : la ruche s'appelle alors « Ruche sans nom », l'animateur est prévenu
  et choisit un autre nom (comme le pseudo provisoire de R9)
- Un projet réservé à une ruche se signale comme les autres

### Mes données et la suppression du compte

- L'export ajoute ses ruches (nom, rôle, date d'entrée), les invitations envoyées et reçues, et le
  réglage « Ne pas me proposer aux autres »
- Supprimer son compte le retire de ses ruches ; s'il était animateur, l'animation passe au membre
  le plus ancien ; s'il était le dernier, la ruche est supprimée

### Accessibilité

- Les pastilles du sélecteur sont des onglets (rôle, nom, état actif), au clavier par les flèches
- L'alvéole d'une ruche a un nom lu (« Ruche Famille ») ; son icône est décorative
- Les boutons « Rejoindre la ruche », « Refuser », « Inviter » disent qui ou quoi (« Inviter Max
  Durand »)
- Zones à toucher de 44 au moins ; textes à 200 % sans coupure au milieu d'un mot à 320

### Ménage

- La page « Les ruches arrivent bientôt » et ses textes disparaissent

### Repris des listes « À reprendre » et « À surveiller »

- `compliance-backlog` (R10) : « Ne pas me proposer aux autres » dit ce qu'il couvre (les
  suggestions, pas la recherche) ;
- `compliance-backlog` (R10) : la visibilité « ruche » passe par la même règle d'accès dans la
  recherche, avec un test (un projet réservé n'est jamais trouvé par un non-membre).

### Le parcours d'un membre (`journey`)

- Inès crée la ruche « Famille », invite Léa ; Léa accepte depuis l'onglet Ruches ; Inès publie un
  projet réservé à Famille ; Léa le voit dans l'actualité de la ruche, dans la pastille « Famille »
  du Fil, et l'ouvre ; Max, qui n'est pas dans la ruche, ne le trouve ni dans Explorer, ni dans la
  recherche, ni par son adresse ; Léa quitte la ruche et ne l'ouvre plus

### Les choix de la session (14/11/2026), à valider avec ce scénario

1. **Les limites** : 50 membres par ruche (invitations comprises), 10 ruches créées et 20 ruches
   par membre, 20 invitations par jour, une invitation valable 30 jours, un nom de 40 caractères.
2. **Le sélecteur du Fil** : « Tout » reste les abonnements (F-Nav6) ; la pastille d'une ruche
   montre tous ses membres, suivis ou non.
3. **L'actualité d'une ruche** montre les projets réservés et les projets « Membres » de ses
   membres (la planche montre les deux), sur 30 jours.
4. **Un projet sans ruche** (son auteur part, est retiré, la ruche est supprimée) **redevient
   privé**, jamais « Membres » : l'auteur décide de l'ouvrir.
5. **L'animation passe au membre le plus ancien** quand l'animateur part ou supprime son compte ;
   l'animateur peut aussi la confier.
6. **Une nouvelle publication dans une ruche ne fait pas de ligne d'Activité** : nouveautés, Fil
   et récap suffisent ; les invitations et les départs en font une.
7. **Le nom de la ruche n'est jamais dans l'e-mail d'invitation** ni dans la ligne d'une invitation
   du récap (écrit par un membre qu'on ne connaît peut-être pas) ; la partie « Dans tes ruches » du
   récap l'écrit en texte simple, jamais en lien (décision de Louis du 14/11/2026, planche
   `R10-Recap`) ; jamais de vignette pour un projet réservé.
8. **Le nom d'une ruche se signale et se retire**, comme un pseudo (R9) : une invitation est le
   seul endroit où un inconnu peut écrire un texte à un membre.
9. **« Ne pas me proposer aux autres » est un réglage unique** pour toutes les ruches, aussi dans
   les réglages.
10. **La mosaïque de tuiles** (F-Et5) vient avec R10, comme R6b l'a renvoyé, sur la page d'un
    membre seulement (relecture du plan).

Après la relecture du plan, Louis a retenu le 14/11/2026 les cinq propositions (« Oui, comme
proposé ») : l'invitation refusée reste « envoyée » pour la ruche jusqu'à ses 30 jours ; un ancien
membre efface toujours ses commentaires ; l'animateur voit et peut retirer un membre qui l'a
bloqué ; « Membres de Waiggle » ; la mosaïque sur la page d'un membre seulement.

### Les planches qui manquent (les visuels d'abord)

Les six planches du 28/10 couvrent l'onglet, la page, l'invitation et les membres. À dessiner et
faire valider avant la relecture du plan :
- `R10-Creer` : la feuille « Créer une ruche » (nom, douze icônes, aperçu de l'alvéole), et la
  ruche juste créée, seule, sur « Inviter des proches » (téléphone, jour) ;
- `R10-Reglages-Ruche` : les réglages de l'animateur (nom, icône, qui peut inviter, confier
  l'animation, supprimer), « Retirer de la ruche » et les fenêtres de confirmation (Quitter,
  Retirer, Supprimer) (téléphone, jour) ;
- `R10-Etats` : l'onglet sans ruche, une ruche pleine (50), une invitation qui ne vaut plus, le
  choix de la ruche dans « Qui peut le voir ? » (téléphone, jour) ;
- `R10-Activite` : les lignes d'Activité des ruches et la partie « Dans tes ruches » du récap.

## R11 — La conformité

Statut : **validé par Louis** le 15/11/2026 (conversation « plan » de R11), tel quel, avec les
treize choix de la session et les planches à dessiner.

R11 est la tranche prévue avant toute ouverture au-delà du cercle actuel (décision du 19/10/2026,
liste de conformité n° 1 à 28). Elle écrit les quatre pages qui disent les règles du jeu (Règles,
Confidentialité, Mentions légales, Accessibilité), fait accepter les règles et déclarer l'âge à
l'inscription comme aux membres déjà inscrits, donne les droits qui manquaient (« Mes
commentaires », « Mes retours envoyés », couper la partie « découvertes » du récap), écrit les
procédures de l'éditeur et le registre des traitements. Elle retire enfin de toute l'appli les
sous-titres et les phrases qui décrivent un élément déjà clair (décision de Louis du 15/11/2026).

Décisions de Louis (15/11/2026) : l'éditeur est **Louis, en micro-entreprise** ; les membres déjà
inscrits passent par un **écran obligatoire** ; une **relecture juridique complète** du projet sert
de base à la page Confidentialité et au registre ; les droits manquants viennent **dans R11**.
Âge minimum : **15 ans** (Louis, 14/11/2026). Les règles ne sont pas validées par un professionnel
pour l'instant, en connaissance de cause (Louis, 28/10/2026) ; les autres textes non plus, et le
bilan le redit.

Les règles d'aujourd'hui ne changent pas, sauf celles que cette section nomme : rien d'un membre ne
se voit sans compte ; un membre suspendu lit, exporte et retire, mais ne publie pas ; un e-mail ne
contient aucun lien ni domaine venu d'un membre ; la modération ne montre jamais qui a signalé.

Hors de R11, et où ça va :
- la validation des textes par un professionnel (juriste ou avocat) : avant l'ouverture au public,
  par Louis ;
- le dépôt de la marque (INPI), les recherches d'antériorité du nom, du logo et de « Waggle ! » :
  Louis, avant l'ouverture commerciale ;
- les contrats de sous-traitance (Hostinger, Scaleway) : Louis vérifie qu'ils sont acceptés ; le
  registre dit où ils sont ;
- le consentement aux e-mails marketing (n° 8) : quand ils arriveront (Brevo) ;
- une vérification de l'âge (pièce d'identité, date de naissance) : non, une déclaration suffit à
  ce stade (à faire valider par un professionnel) ;
- les projets publics sur le web et la phrase « Rien n'est public sans ton accord. » : R12.

### Les quatre pages (planche `R2-Regles` ; planches à dessiner `R11-Pages`, `R11-Pages-Desktop`)

**Lire les règles sans compte**
- Étant donné un visiteur sans compte, sur l'accueil
- Quand il touche « Règles » au pied de la page
- Alors la page « Les règles de {{appName}} » s'ouvre à `/rules`, sans demander de compte
- Et elle montre sa version (« Version du 18 nov. 2026 »), « En bref » en mots simples, puis « Le
  texte complet », qui fait foi
- Et les quatre pages sont faites de même : `/rules`, `/privacy` (« Confidentialité »), `/legal`
  (« Mentions légales »), `/accessibility` (« Accessibilité »)
- Et chacune a, en bas, les liens vers les trois autres et l'adresse de contact
- Et sur ordinateur, le texte tient dans une colonne de lecture, avec à côté le sommaire des
  parties ; toucher une partie y mène
- Et la page suit la langue de l'appli (français ou anglais) ; elle est lisible à 200 % de texte

**Le contenu des Règles** (texte complet, par parties)
- À quoi sert {{appName}} ; les démos vivent sur d'autres sites, que {{appName}} ne vérifie pas
- Ton compte : par invitation, à partir de 15 ans, un compte par personne, personnel ; un parent
  n'ouvre pas de compte pour un enfant de moins de 15 ans
- Ce que tu publies : il reste à toi ; tu autorises {{appName}} à l'afficher aux personnes que tu
  choisis ; un prompt publié peut être copié et réutilisé par les membres qui le voient ; une photo
  ou une information sur quelqu'un, seulement avec son accord ; des captures sans données de tiers
- Ce qui est interdit : harcèlement, y compris par mentions ou invitations répétées ; haine ;
  contenu sexuel ou violent ; contenu illégal ; arnaque, virus ou hameçonnage derrière un lien ; se
  faire passer pour quelqu'un par son nom ou son pseudo ; nommer un tiers qui n'est pas membre sans
  son accord ; un nom de ruche insultant ou qui révèle une catégorie sensible
- Les ruches : l'animateur épingle, invite, choisit qui invite, retire un membre
- Les testeurs : le coin des testeurs est privé entre l'auteur et chaque testeur ; on ne cite pas un
  retour et on ne nomme pas un testeur sans son accord
- Comment se font le fil, Explorer, les suggestions et la recherche (les critères et l'ordre, ce
  qu'un membre peut régler, comme « Ne pas me proposer aux autres ») : les phrases retirées des
  écrans (voir « Moins de mots ») sont dites ici
- La modération : signaler ; qui lit un signalement ; ce que la modération peut faire, du plus
  léger au plus lourd (retirer une partie, retirer un contenu, suspendre pour un temps ou sans fin) ;
  la motivation envoyée ; contester par e-mail ; saisir la justice
- Ce que peut l'auteur d'un projet : masquer un commentaire, sans recours pour l'instant ; le sort
  des commentaires quand le projet devient privé ou est supprimé
- Quitter {{appName}} : télécharger ses données, supprimer son compte ; ce qui reste chez les autres
- Les changements des règles : une nouvelle version se lit et s'accepte à la visite suivante
- Responsabilité, droit applicable (français), contact

**Le contenu de la Confidentialité**
- Qui est responsable (l'éditeur des Mentions légales) et comment le joindre
- Pour chaque fonction (compte, profil, projets, réactions, commentaires, mentions, abonnements, fil
  et suggestions, recherche, testeurs, ruches, notifications et e-mails, signalements et modération,
  blocage, sécurité du compte) : les données gardées, pourquoi, sur quelle base, qui les voit, combien
  de temps — selon l'inventaire de la relecture juridique complète, durées **telles que le code les
  applique**
- Ce qui est rangé sur l'appareil (thème, langue, aides vues, adresse en attente de vérification)
  et ce qui n'est jamais gardé (la position de la souris et l'inclinaison de l'appareil pour la
  lumière) ; aucun cookie de mesure ni de publicité
- Les sauvegardes (14 jours, puis la copie hebdomadaire de l'hébergeur) et les journaux du serveur
- Les sous-traitants, ce que chacun reçoit et où : Hostinger (le serveur, à Paris), Scaleway (les
  e-mails, à Paris), GitHub (le code et les images du logiciel, aucune donnée de membre) ; puis, à
  part, un destinataire qui n'est pas un sous-traitant : le fournisseur de l'assistant de code qui
  aide à construire et exploiter {{appName}} (nommé par la page et par `docs/legal/registre.md`),
  dit **tel qu'il est aujourd'hui** (décision du 15/11/2026) : il peut lire des extraits des
  journaux et de la base pour corriger une panne ou traiter un signalement ; l'offre utilisée est une
  offre pour les particuliers, sous laquelle le fournisseur décide lui-même de l'usage de ces données
  (il en est responsable, selon sa propre politique de confidentialité, avec un lien vers elle) ;
  elles peuvent partir hors de l'Union européenne ; elles ne servent pas à entraîner ses modèles
  (réglage coupé le 15/11/2026) et sont gardées 30 jours chez lui. Le passage à une offre
  professionnelle, où le fournisseur devient sous-traitant, viendra au plus tard à l'ouverture au
  public ; la page changera alors
- Tes droits (accès et export, rectification, effacement, opposition, limitation, portabilité), comment
  les exercer depuis l'appli ou par e-mail, le délai de réponse, et la CNIL

**Le contenu des Mentions légales**
- L'éditeur : Louis, entrepreneur individuel (nom, adresse professionnelle, SIREN, e-mail), directeur
  de la publication ; l'hébergeur : Hostinger (nom, adresse, téléphone) ; le code source et sa
  licence (AGPL-3.0) ; la marque et le logo

**Le contenu d'Accessibilité**
- L'engagement, l'état : « partiellement conforme » aux WCAG 2.2 niveau AA, sans audit extérieur
- Ce qui est fait (taille du texte de l'appareil, lecteurs d'écran, clavier, zones de 44, contrastes
  vérifiés, « Réduire les animations »)
- Les limites connues, dites vraies : la lumière d'ambiance et le portail de sortie bougent sans
  bouton pour les arrêter, sauf avec « Réduire les animations » ; de jour, sous la lumière tirée d'une
  photo, quelques textes gris passent sous le contraste visé ; sur iOS et Android, le focus ne va pas
  toujours à la carte arrivée
- Signaler un défaut (contact) ; le Défenseur des droits si la réponse ne vient pas

### Les liens vers les pages

- L'accueil des visiteurs et l'écran de connexion ont un pied : Règles · Confidentialité · Mentions
  légales · Accessibilité · Le code source
- Réglages, « À propos » : les quatre pages et le code source, en lignes
- L'inscription : « les règles de {{appName}} » est un lien dans la case ; il ouvre la page sans
  perdre ce qui est déjà tapé
- Le pied des e-mails ajoute l'adresse de la page Confidentialité, en texte (`waiggle.com/privacy`)

### L'inscription (planche `R2-Inscription` ; à dessiner `R11-Inscription`)

**Deux cases**
- Étant donné Max, qui crée son compte avec un code d'invitation
- Alors, sous le mot de passe, deux cases non cochées : « J'accepte les règles de {{appName}} » et
  « J'ai 15 ans ou plus »
- Quand il touche « Créer mon compte » sans les cocher
- Alors le bouton, resté actif (F-C8), dit ce qui manque, comme pour les autres champs (« Il manque
  deux choses : ton accord aux règles et ton âge. ») ; chaque case non cochée dit « Coche la case pour
  créer ton compte. »
- Et l'API refuse aussi une inscription sans les deux accords, avec son propre code d'erreur
- Quand il coche les deux et crée son compte
- Alors son compte garde la version des règles acceptée, la date, et la déclaration d'âge ; l'export
  de ses données les contient

### Les membres déjà inscrits, et chaque nouvelle version (à dessiner `R11-Accepter`)

**Accepter à la visite suivante**
- Étant donné Inès, inscrite avant R11, qui ouvre l'appli
- Alors, avant toute autre page, « Les règles de {{appName}} » : « En bref », un lien vers le texte
  complet, les deux mêmes cases, et « Continuer »
- Et tant qu'elle n'a pas coché les deux, « Continuer » dit ce qui manque
- Et l'écran garde trois sorties : « Télécharger mes données », « Supprimer mon compte », « Me
  déconnecter » ; aucune autre page ne s'ouvre (un lien reçu revient sur cet écran, puis sur la page
  demandée une fois accepté)
- Et l'API refuse toute écriture de ce compte tant que les règles ne sont pas acceptées, sauf
  accepter, exporter, supprimer le compte, se déconnecter et régler ses e-mails (code d'erreur
  propre, comme la suspension)
- Et un membre suspendu passe par le même écran

**Une nouvelle version**
- Étant donné une nouvelle version des règles (sa date change)
- Alors chaque membre retrouve l'écran à sa visite suivante, avec, au-dessus, « Ce qui change »
- Et une correction de forme (faute, lien) ne change pas la version

### Mes commentaires (à dessiner `R11-Mes-Commentaires`)

- Étant donné Léa, dans Réglages, « Mes données »
- Quand elle touche « Mes commentaires »
- Alors tous ses commentaires et réponses, du plus récent au plus ancien, avec le titre du projet
  (ou « Projet qui n'est plus visible » si elle ne le voit plus), la date et le début du texte
- Et toucher un commentaire d'un projet visible l'ouvre à sa place dans le fil du projet
- Et chacun a « Supprimer », avec la confirmation d'aujourd'hui ; la suppression suit les règles
  d'aujourd'hui (une racine avec des réponses devient « Commentaire supprimé »)
- Et elle peut supprimer un commentaire sur un projet devenu privé, retiré par la modération, d'un
  membre qu'elle a bloqué ou qui l'a bloquée, ou d'une ruche qu'elle a quittée : aujourd'hui, l'API
  le refuse quand le projet ne lui est plus visible
- Et la liste se charge par pages ; vide, elle le dit

### Mes retours envoyés (à dessiner `R11-Mes-Retours`)

- Étant donné Max, testeur de trois projets, dans « Mes données »
- Quand il touche « Mes retours envoyés »
- Alors ses retours et messages du coin des testeurs, groupés par projet (ou « Projet qui n'est plus
  visible »), du plus récent au plus ancien, avec leur capture
- Et un coin fermé (projet retiré, devenu privé, testeur parti, retiré ou bloqué) se relit ici en
  lecture seule, ses seuls messages à lui : jamais ceux de l'auteur d'un coin fermé
- Et chaque message a « Supprimer » (sa capture part avec lui), comme aujourd'hui dans le coin

### Le récap : couper les découvertes (planche `R8-Reglages`)

- Étant donné Inès, dans Réglages, « Notifications »
- Alors une ligne « Découvertes » (les nouveaux projets de ses proches, « Ils cherchent des
  testeurs ») : « Dans le récap » ou « Jamais », « Dans le récap » par défaut, aussi pour les inscrits
  d'avant (rien ne change pour eux sans leur choix)
- Quand elle choisit « Jamais »
- Alors le récap du dimanche garde ses autres parties, sans ces deux-là
- Et la page de désinscription du récap propose aussi « Couper les découvertes »

### Un compte suspendu (vérifié, rien à changer)

- Un compte suspendu peut déjà retirer sa bio, ses outils favoris et sa photo, et le bandeau le dit
  (`suspension/guard.ts`, `DELETE /v1/me/avatar`) : R11 n'y touche pas, sauf si la relecture
  juridique trouve un manque

### Moins de mots (décision de Louis du 15/11/2026)

**La règle**
- Un titre, une rubrique, un bouton, un réglage se suffisent : aucun sous-titre, sur-titre,
  étiquette « toi » ni phrase d'aide qui les décrit ou les redit
- Reste seulement une phrase qui apprend ce que l'écran ne montre pas : une suite irréversible, qui
  voit quoi, une limite ; un état vide garde sa phrase (« Aucun commentaire pour l'instant. »)
- Les aides des lecteurs d'écran, invisibles, ne changent pas
- La règle entre dans `CONTRIBUTING.md` (« Interface ») pour les tranches suivantes

**La liste, phrase par phrase, à valider par Louis** (✂ retirer, ✎ raccourcir ; inventaire du
15/11/2026)

| Écran | Texte d'aujourd'hui | Choix |
| --- | --- | --- |
| Page d'une ruche, et aperçu à la création | « Ma ruche » au-dessus du nom | ✂ (le nom lu devient « Ruche Famille ») |
| Page d'une ruche, sur ordinateur | « Une partie de la ruche arrive dans ton récap du dimanche. Les défis viendront plus tard. » | ✂ |
| Page d'une ruche, Membres | « Mes suggestions » | ✂ |
| Réglages, Mes données | « Ce que les autres voient » | ✂ |
| Membres d'une ruche | « toi » et « @ines_h · toi » | ✂ |
| Mes ruches, sous le titre | « Une ruche, c'est un groupe de proches… » | ✂ ; l'état vide garde « On y entre par une invitation. » |
| Ruche juste créée | « Invite des proches : ils deviennent membres s'ils acceptent. » | ✎ « Ils deviennent membres s'ils acceptent. » |
| Confier l'animation | « Choisis le membre qui animera la ruche. Tu en resteras membre. » | ✎ « Tu en resteras membre. » |
| Réglages de la ruche | « Tu redeviens membre. » sous « Confier l'animation » | ✂ (dit dans la feuille) |
| Fil, pastille d'une ruche | « Les nouveaux projets et les mises à jour des membres de la ruche… » | ✂ (dit dans les Règles) |
| Fil, « Suivis » | « Les nouveaux projets des personnes que tu suis, et les mises à jour… » | ✂ (dit dans les Règles) |
| Fil, « Découvrir » | « Les derniers projets publiés par les membres. » | ✂ (dit dans les Règles ; gardé en R5a, T12) |
| Proches à suivre | « Des membres de tes ruches et des membres qui ont publié récemment » | ✂ (dit dans les Règles) |
| Fil, premier lancement | « Ton fil t'attend » | ✂ (« Bonjour Inès ! » suffit) |
| Fil, encart « Publier » | « Une idée, un essai, ça compte. » | ✂ |
| Explorer, sur ordinateur | « Les projets de tous les membres : à tester, à suivre, pour t'inspirer. » | ✂ |
| Outils | « Le catalogue des outils d'IA, de développement… » | ✂ (jur-T12 : dit dans les Règles) |
| Inscription | « Tes proches te reconnaîtront à ton nom affiché. » | ✂ |
| Connexion | « Connecte-toi pour retrouver les projets de tes proches. » | ✂ |
| Mot de passe oublié | « Indique ton adresse : nous t'envoyons un lien… » | ✎ « Nous t'envoyons un lien. » |
| Mot de passe, la jauge | « C'est bon, ton mot de passe est assez long. » | ✂ à l'écran (la jauge pleine le montre) ; le lecteur d'écran l'entend toujours |
| Vérifie ta boîte mail | « Tant que tu n'as pas ouvert ce lien, tu ne peux pas te connecter. » | ✂ |
| Corriger l'adresse avant vérification | « Une faute de frappe ? Indique la bonne adresse… » | ✎ « L'ancien lien ne marchera plus. » |
| Réglages, la liste (téléphone) | les 11 lignes sous les rubriques (« Photo, nom, pseudo et présentation »…) | ✂ toutes |
| Réglages, Apparence | « Sur cet appareil seulement. « Automatique » suit… » | ✎ « Sur cet appareil seulement. » |
| Réglages, Nous écrire | « En français ou en anglais. Pour une question… » | ✎ « En français ou en anglais. » |
| Accueil, connexion, À propos | « {{appName}} est un logiciel libre. » | ✂ (le lien « Le code source » reste, AGPL art. 13) |
| Connexion et inscription, sous le cadenas | « Rien n'est visible sans compte, ni trouvé par un moteur de recherche. » (faux : l'accueil est trouvé) | ✎ « Les projets et les profils ne se voient qu'avec un compte. » (planche `R11-Pied`, validée) |
| Feuille de suspension, feuille d'un appel | la même phrase, employée comme erreur | remplacée par le vrai message d'erreur |
| Nouveau projet | « Montre à tes proches ce que tu construis. Tu pourras tout modifier ensuite. » | ✎ « Tu pourras tout modifier ensuite. » |
| Aperçu dans le fil | « Il suit ce que tu écris. » | ✂ (décidé en R5a, T9, resté à l'écran) |
| Aperçu dans le fil | « La lumière autour de la carte vient de ta première photo. Change-la, elle change aussi. » | ✎ « La lumière vient de ta première photo. » |
| Qui peut le voir ? | « Toute personne qui a un compte. » sous « Membres de {{appName}} » | ✂ |
| Mises à jour, vide (auteur) | « Pas encore de mise à jour. Raconte ce qui change : tes abonnés et tes testeurs seront prévenus. » | ✎ « Tes abonnés et tes testeurs seront prévenus. » |
| Nouvelle mise à jour | « Une ligne par changement, 5 au plus. Pas besoin de tout dire. » | ✎ « 5 lignes au plus. » |
| Coin des testeurs, vide (auteur) | « Aucun retour pour l'instant. Tes testeurs peuvent t'en envoyer depuis ce coin. » | ✎ « Aucun retour pour l'instant. » |
| Activité, sur ordinateur | « On ne voit nulle part qui a réagi ou qui te suit : seulement des nombres. » | ✂ (dit dans les réglages et sur ses projets) |
| Modération | « Les signalements des membres arrivent ici. Chaque décision entre dans l'historique. » | ✂ |
| Modération, Historique | « Du plus récent au plus ancien » | ✂ |
| Modération, liens Outils et Catégories | « Les autres outils à vérifier, et le catalogue », « Les projets à ranger, et les catégories » | ✂ |
| Modération, Outils et Catégories | leurs sous-titres (« … Chaque changement entre dans « Changements récents ». ») | ✂ |

Restent, parce qu'ils disent qui voit quoi, une limite ou une suite, ou qu'une relecture juridique
les a demandés : les états vides, les promesses de l'invitation à une ruche, « Refuser ne prévient
personne. », l'aide du nom affiché et du pseudo (on te trouve par ce nom), le nettoyage de la photo,
les conséquences d'un mot de passe changé, du changement d'adresse et de la suppression du compte,
« Réactions et abonnés : combien, jamais qui », les aides de « Qui peut le voir ? » pour « Une
ruche » et « Privé », les phrases du coin des testeurs (« reste entre Léa et toi »), le signalement,
la suspension, « Ne pas me proposer aux autres ».

### Les moteurs de recherche

- Le site a un fichier `robots.txt` : l'accueil et les quatre pages peuvent être trouvés ; les
  autres adresses (projets, membres, réglages) ne sont pas proposées aux moteurs (rien ne s'y lit
  sans compte, de toute façon)

### Les durées, les purges et l'éditeur (`docs/ops`, registre)

- Chaque donnée a une durée, et la page Confidentialité dit la durée réelle ; une donnée sans durée
  trouvée par la relecture juridique en reçoit une, avec sa purge de la nuit et son test
- Les sauvegardes : aujourd'hui, seules les quotidiennes partent à 14 jours ; celles d'une autre
  étiquette (`avant-deploi`, `manuel`…) gardent leurs 5 dernières sans limite d'âge, donc parfois des
  comptes supprimés depuis des mois. Chaque étiquette reçoit une borne d'âge, écrite dans
  `infra/backup.sh` ; trier celles déjà sur le serveur attend l'accord de Louis
- Les journaux : ceux de la base n'écrivent plus la valeur d'une erreur (une adresse peut y figurer) ;
  ceux du système (journald) ont une durée ; les compteurs par adresse IP sont annoncés à leur durée
  réelle (49 h, pas 25 h)
- Un compte inactif depuis longtemps est supprimé, après un e-mail un mois avant avec le lien de
  l'export ; la suppression suit le chemin complet d'aujourd'hui ; la durée : **3 ans** sans
  connexion (décision de Louis du 15/11/2026, à faire valider par un professionnel)
- `docs/ops/donnees.md` : que faire en cas de fuite (qui prévient qui, la CNIL sous 72 h, les
  membres touchés) ; une demande reçue à `contact@` (accusé de réception, réponse sous un mois,
  vérifier que c'est bien la personne) ; qui a perdu l'accès à son ancienne adresse ; retirer un
  contenu à la main (renvoi à `moderation.md`)
- `docs/legal/registre.md` : le registre des traitements (finalité, données, personnes, durée,
  destinataires, sous-traitants et leurs contrats, sécurité), tiré du même inventaire
- Une donnée de membre ne s'écrit jamais dans ces documents (le dépôt est public)

### Mes données

- L'export ajoute la version des règles acceptée, sa date et la déclaration d'âge, et le réglage
  « Découvertes »

### Accessibilité

- Les deux cases ont leur nom lu (« J'accepte les règles de {{appName}} », « J'ai 15 ans ou plus »)
  et leur état ; le lien des règles est un lien distinct de la case
- Les pages se lisent par titres (un titre par partie), au clavier, et le sommaire d'ordinateur est
  une navigation (« Sommaire »)
- L'écran « Accepter » met le focus sur son titre ; « Continuer » refusé dit ce qui manque à la
  région d'état
- Zones à toucher de 44 au moins ; textes à 200 % sans coupure au milieu d'un mot à 320

### Le parcours d'un membre (`journey`)

- Max lit les règles depuis l'accueil, revient, crée son compte : refusé sans les deux cases, accepté
  avec ; Inès, inscrite avant, voit l'écran « Accepter », coche, retrouve son Fil ; Léa supprime un
  commentaire depuis « Mes commentaires » sur un projet devenu privé

### Les choix de la session (15/11/2026), à valider avec ce scénario

1. **Les adresses** `/rules`, `/privacy`, `/legal`, `/accessibility` (anglais, comme `/sign-up`),
   visibles sans compte.
2. **Tes coordonnées d'éditeur** s'écrivent à un seul endroit du dépôt (`packages/brand`), comme le
   nom de l'appli : elles sont de toute façon publiques sur la page. Une adresse de domiciliation
   peut remplacer ton adresse personnelle. C'est toi qui les tapes.
3. **La version des règles est une date**, écrite dans le code ; la changer fait revenir l'écran
   « Accepter ».
4. **L'API garde l'accord**, comme la suspension : sans lui, aucune écriture, sauf les sorties.
5. **Deux cases séparées** (règles, âge) : chaque accord a sa preuve.
6. **Pas d'e-mail** aux membres déjà inscrits pour les règles : l'écran suffit dans le cercle
   d'aujourd'hui.
7. **« Mes commentaires » et « Mes retours envoyés » vivent dans « Mes données »**, l'un sous
   l'autre.
8. **« Découvertes » par défaut « Dans le récap »**, pour tous : rien ne change sans le choix du
   membre.
9. **Les critères du fil, d'Explorer et des suggestions** passent des écrans aux Règles (DSA art.
   27 : les paramètres principaux dans les conditions ; à faire valider par un professionnel).
10. **Sans accord, les e-mails continuent** (récap, ruches) : ils existaient avant R11, et l'accord
    se donne à la visite suivante ; seules les écritures attendent.
11. **Si « J'ai 15 ans ou plus » n'est pas coché**, une phrase neutre dit la suite (« {{appName}} est
    ouvert à partir de 15 ans. »), sans pousser à cocher.
12. **L'aide sous « Ruches » des réglages e-mail** demandée par la relecture de R10 (« Tout de suite
    ne vaut que pour les invitations ») n'est pas écrite, selon la règle « Moins de mots » : le
    choix se lit seul.

### Les planches qui manquent (les visuels d'abord)

À dessiner et faire valider avant la relecture du plan :
- `R11-Pages` : une page (Confidentialité) sur téléphone, de jour et de nuit, avec « En bref », les
  titres des parties, le pied de liens ; `R11-Pages-Desktop` : la même sur ordinateur avec le sommaire ;
- `R11-Inscription` : l'inscription avec les deux cases, et l'état « ce qui manque » (téléphone) ;
- `R11-Accepter` : l'écran des membres déjà inscrits, première fois et « Ce qui change » (téléphone,
  ordinateur) ;
- `R11-Mes-Commentaires` et `R11-Mes-Retours` : les deux listes, avec un projet qui n'est plus
  visible (téléphone) ;
- `R11-Pied` : le pied de l'accueil des visiteurs, et « À propos » des réglages (téléphone).

## R12 — Les projets publics

Statut : **validé par Louis** le 16/11/2026 (« Oui, tout »). Écrit le même jour à partir de ses réponses aux vingt questions du
brouillon (toutes les recommandations, sauf Q1, Q9, Q16 et Q20, changées par lui) et des deux
précisions qu'il a validées le même jour.

R12 est la dernière tranche de la refonte. Elle change la règle « un visiteur ne voit rien » (A14) :
un membre peut rendre un projet public, visible par tous et trouvable sur Google ; il peut aussi, par
un choix à part, rendre sa page publique. Un visiteur sans compte voit alors ces projets et ces
pages, une vitrine qui devient l'accueil du site, et peut signaler un contenu (A14 : « comme le DSA
l'impose »). Les moteurs de recherche et les aperçus de lien lisent ces pages et seulement elles, en
français et en anglais, chacune à son adresse. La phrase « Rien n'est public sans ton accord. »
remplace celle de R11. Les Règles, la Confidentialité et le registre disent la nouvelle situation.

Décisions de Louis (16/11/2026) :
- **R12 entière, « Public » ouvert dès le déploiement**, sans interrupteur : le site devient plus
  public **sans devenir commercial** ; la validation des textes par un professionnel et l'offre
  professionnelle de l'assistant de code attendent encore ; **l'inscription reste sur code
  d'invitation** ;
- **la vitrine devient l'accueil (`/`) pour tout le monde**, mais un membre connecté qui arrive sur
  {{appName}} va directement au Fil ; dans l'appli, le logo et « À la une » (Explorer) y mènent ;
- **une adresse par langue** (`/fr/…`, `/en/…`) et les liens `hreflang`, **dans R12**, sur les pages
  publiques seulement ;
- **inviter dans une ruche quelqu'un qui n'a pas de compte : on n'en veut pas.**

Planches : `R12-Visiteur-Accueil`, `R12-Visiteur-Projet`, `R12-Compte-Requis`,
`R12-Visiteur-Signaler`, `R12-Profil-Public`, `R12-Visiteur-Desktop` (dessinées le 28/10) ;
`R6-Modifier` pour le choix « Public » ; les planches à dessiner et à retoucher sont nommées en fin de
section.

Les règles d'aujourd'hui ne changent pas, sauf celles que cette section nomme :
- aucun projet ne devient public sans un geste de son auteur ; aucun contenu d'un membre n'est montré
  sans son accord (A14) ; la visibilité par défaut reste « Membres de {{appName}} » ;
- un visiteur ne voit **jamais** les commentaires, les abonnés, ni les ruches (A14) ; ni qui a réagi,
  qui suit, qui a signalé ;
- réagir, commenter ou suivre demande un compte (A14) ;
- la recherche, Explorer, le fil, les pages d'outils et les ruches restent réservés aux membres, même
  avec un profil public (liste de conformité, « R12 : la recherche reste réservée aux membres ») ;
- un projet privé, réservé à une ruche, retiré par la modération, ou d'un membre bloqué, n'apparaît
  nulle part ; « Tester » passe toujours par la page de sortie (A14) ; le serveur n'ouvre jamais un
  lien de démo (décision du 8/11/2026) ;
- un e-mail ne contient aucun lien ni domaine venu d'un membre ; la modération ne montre jamais qui
  a signalé.

Hors de R12, et où ça va :
- inviter dans une ruche quelqu'un qui n'a pas de compte : **non** (Louis, 16/11/2026) ; ouvrir les
  inscriptions sans code : plus tard ;
- la validation des textes par un professionnel, et le passage de l'assistant de code à une offre
  professionnelle : Louis, quand {{appName}} deviendra commercial ou ouvrira les inscriptions ;
- la montée à Expo SDK 58 : une PR à part, après R12 ;
- la traduction des contenus des membres : phase 3 (CONTRIBUTING, « Langues ») ;
- des adresses par langue pour les pages des membres (Fil, Explorer, réglages…) : non, elles ne sont
  pas lues par les moteurs ;
- le serveur MCP : plus tard.

### L'ouverture (Q1)

- Étant donné le serveur de production, dès le déploiement de R12
- Alors « Public » est proposé à tous les auteurs, et « Rendre ma page publique » à tous les membres
- Et l'inscription demande toujours un code d'invitation (`SIGNUP_INVITE_CODE`, exigé en production)
- Et le garde des Mentions légales (`scripts/legal-placeholders.mjs`) reste tel quel : tant que
  l'inscription demande un code d'invitation, un emplacement à remplir avertit sans bloquer le
  déploiement (Louis, 16/11/2026) ; les coordonnées de l'éditeur se font avec Louis après le
  déploiement de R12

### Rendre un projet public (F-Pub6, planche `R6-Modifier` ; à dessiner `R12-Qui-Peut-Voir`)

**Le choisir**
- Étant donné Léa, qui publie ou modifie « Décollage ! »
- Alors « Qui peut le voir ? » propose, dans cet ordre, « Membres de {{appName}} », « Une ruche » (si
  elle est dans une ruche), « Public » et « Privé » (F-Pub6 ; planche `R6-Modifier`) (Q2)
- Et sous « Public », l'aide « Visible par tous, et trouvable sur Google » (A14, mot pour mot) : elle
  dit qui voit, elle reste selon « Moins de mots »
- Quand elle choisit « Public »
- Alors la phrase du bas du formulaire dit : « Tout le monde pourra le voir, même sans compte. Si tu
  changes d'avis, les moteurs de recherche peuvent le montrer encore quelque temps. » (Q4)
- Et aucune fenêtre de confirmation en plus (Q4)
- Et l'API garde la valeur sous un code stable nouveau, `web` : `public` veut déjà dire « Membres de
  {{appName}} » (`packages/contracts/src/projects.ts`) ; aucun projet existant ne change (Q3)

**Qui peut le choisir**
- Tout auteur, sauf un membre suspendu : il peut rendre un projet public moins visible, jamais plus
  (« Pendant la suspension, tu ne pourras pas le rendre de nouveau public. ») (Q6)
- Un membre de 15 à 17 ans a le même choix, rien n'est coché d'avance ; le point entre dans la liste
  du professionnel (RGPD art. 8, protection des mineurs) (Q7)
- Un projet retiré par la modération ne se rend pas public (il n'est visible que de son auteur)

**Revenir en arrière**
- Étant donné « Décollage ! », public
- Quand Léa choisit « Membres de {{appName}} », « Une ruche » ou « Privé »
- Alors, à l'instant, un visiteur qui ouvre son adresse arrive sur « Se connecter », comme pour une
  adresse inconnue (« une adresse ne révèle rien »)
- Et le projet quitte la vitrine et le plan du site ; sa page dit aux moteurs de ne plus l'indexer
  (`noindex`), ses images ne s'ouvrent plus sans compte
- Et ce qui est déjà copié ailleurs (moteurs de recherche, captures, messageries) n'est pas effacé
  par {{appName}} : la phrase du formulaire et la Confidentialité le disent (Q4)
- Et la même chose arrive quand le projet est supprimé, retiré par la modération, quand le compte est
  supprimé ou supprimé pour inactivité

**Sur la page du projet** (planche `R12-Visiteur-Projet`)
- Une pastille « Public » à côté du statut et de la catégorie, pour tous, membres compris (Q19)

### Ce que voit un visiteur sans compte

**Un projet public** (A14 ; planche `R12-Visiteur-Projet` ; à dessiner `R12-Visiteur-Projet-Desktop`,
`R12-Visiteur-Projet-Nuit`)
- Étant donné un visiteur sans compte qui ouvre l'adresse de « Décollage ! », public
- Alors la page s'ouvre sans demander de compte, à l'adresse de sa langue (`/fr/projects/<id>` ou
  `/en/projects/<id>`, voir « Les adresses par langue »)
- Et il voit la couverture, le titre, l'accroche, le statut, « Les mises à jour », « Tester la démo »
  par la page de sortie et le nombre de réactions (A14), avec « de membres » (planche)
- Et aussi tout ce que l'auteur a écrit : la description, la galerie et sa description des photos,
  les catégories, les outils (sans lien vers leur page, réservée aux membres), « Facile à refaire ? »,
  « Commencé en », « Le prompt de départ » avec « Copier » (Q5)
- Et le nom et la photo de l'auteur ; son nom mène à sa page seulement si elle est publique ; le
  pseudo ne se montre nulle part aux visiteurs (Q8)
- Et jamais : les commentaires, les abonnés, qui a réagi, les ruches, le coin des testeurs ni les
  appels à testeurs, « Suivre », le menu de l'auteur (A14)
- Et en haut, « {{appName}} » (vers l'accueil) et « Se connecter » ; ni barre d'onglets ni « + »
- Et en bas, « Signaler ce projet » (F-Pr12 ; planche)
- Et la page suit le thème du navigateur après `useHydrated()` (CONTRIBUTING, « Web ») ; sa langue
  est celle de son adresse

**Les commentaires**
- Étant donné le même visiteur
- Alors, à la place des commentaires, une phrase : « Les commentaires sont réservés aux membres. » et
  « Créer un compte » (planche `R12-Visiteur-Projet`)
- Et ni leur nombre, ni un extrait (A14 : « jamais les commentaires »)
- Et l'aide de la feuille des commentaires reste vraie (« Tous les membres connectés liront ton
  commentaire. »)

**Réagir, commenter, suivre** (planche `R12-Compte-Requis`, à retoucher)
- Quand le visiteur touche « Réagir », « Créer un compte » ou « Suivre ses mises à jour »
- Alors une feuille « Pour réagir, crée ton compte » propose « Créer un compte » et « Se connecter »,
  avec « Rien n'est public sans ton accord. » (planche)
- Et la phrase « Réagir, commenter et suivre un projet demandent un compte. » est retirée (« Moins de
  mots » : le titre le dit) ; « Ta réaction sera posée juste après » aussi (Q11)
- Et la feuille dit la limite : « {{appName}} s'ouvre sur invitation. » (Q12)
- Et une fois connecté, il revient sur le projet, comme pour un lien partagé ; rien n'est fait à sa
  place (Q11)

**Un projet qui n'est pas public**
- Étant donné un visiteur qui ouvre l'adresse d'un projet « Membres », réservé, privé, retiré,
  supprimé, ou une adresse fausse
- Alors la même suite qu'aujourd'hui : « Se connecter », puis le projet s'il le voit ; la page reçue
  ne dit rien du projet (ni titre, ni image) et porte `noindex`

**Une page publique** (planche `R12-Profil-Public` ; à dessiner `R12-Visiteur-Profil`)
- Étant donné Inès, dont la page est publique, et un visiteur qui ouvre `/fr/members/<id>`
- Alors il voit son nom et sa photo, puis ce qu'elle a coché : sa bio, ses outils favoris, ses
  projets publics, son nombre d'abonnés
- Et jamais ses ruches, qui elle suit, ses commentaires ni ses réactions, ni ses projets « Membres »,
  réservés ou privés, ni son pseudo (Q8)
- Et « Signaler ce profil » en bas
- Et une page qui n'est pas publique répond comme un projet qui ne l'est pas : « Se connecter »

### L'accueil : la vitrine, pour tout le monde (A14, Q9 ; planches `R12-Visiteur-Accueil`, `R12-Visiteur-Desktop`)

**Qui arrive où** (Louis, 16/11/2026)
- `/` est l'accueil, avec la vitrine, **pour tout le monde**, connecté ou non ; le Fil prend sa
  propre adresse (`/feed`, page des membres, sans langue)
- Étant donné un visiteur sans compte qui ouvre {{appName}} (`/`)
- Alors il arrive sur l'accueil dans la langue de son navigateur (`/fr/` ou `/en/`) : l'accroche,
  la vitrine, « Créer un compte » et « Se connecter »
- Étant donné un membre connecté qui **arrive** sur {{appName}} : il tape l'adresse, ouvre un favori,
  rouvre l'onglet, ou vient de se connecter sans lien à suivre
- Alors il arrive directement sur le Fil ; sur le web, c'est le serveur qui l'y envoie, dès la
  demande de la page, avant tout affichage (aucun clignotement de l'accueil)
- Et sur téléphone, l'appli s'ouvre sur l'onglet Fil
- Étant donné le même membre, déjà dans l'appli
- Quand il touche le logo « {{appName}} » ou un lien vers l'accueil
- Alors il voit l'accueil et la vitrine, avec sa barre de membre
- Et « À la une », en tête d'Explorer, reste le chemin le plus court vers la vitrine sur téléphone

**La vitrine**
- Sous l'accroche, « Des projets à voir » : 3 projets publics sur téléphone, 4 sur ordinateur
  (planche `R12-Visiteur-Desktop`) (Q9)
- Et sous la vitrine, « Ces projets sont publics : leurs auteurs l'ont choisi. » (Q10)
- Et chaque carte ouvre la page du projet
- Et la vitrine est **choisie par Louis** parmi les projets publics (A14 : « mis en avant par
  Louis »), dans la modération (à dessiner `R12-Vitrine`) ; l'auteur est prévenu dans Activité et peut
  la quitter par « Retirer de l'accueil » (Q9)
- Et un projet qui cesse d'être public, est supprimé ou retiré quitte la vitrine à l'instant
- Et sans projet mis en avant, l'accueil reste celui de R11 (images d'exemple de la marque, A14)
- Et la phrase de l'accueil devient « Rien n'est public sans ton accord. »
- Et sur ordinateur, la phrase sous l'accroche de la planche (« Publie tes projets, fais-les
  tester… ») et « {{appName}} est un logiciel libre. » ne reviennent pas (« Moins de mots ») ; le
  pied de R11 reste

**« À la une », pour les membres** (à dessiner `R12-A-La-Une`)
- Étant donné Léa, connectée, sur Explorer
- Alors, en tête, une rangée « À la une » : les projets de la vitrine, en cartes qu'on fait défiler
  de côté ; chaque carte ouvre le projet
- Et un projet de la vitrine que Léa ne voit pas (l'auteur l'a bloquée, ou elle l'a bloqué) n'y est
  pas ; la rangée suit les mêmes règles de visibilité qu'Explorer
- Et sans projet mis en avant, la rangée n'apparaît pas (aucune place réservée vide)
- Et elle ne porte ni sous-titre ni phrase d'aide (« Moins de mots »)

### Rendre sa page publique (planche `R12-Profil-Public`, à retoucher)

- Étant donné Inès, dans Réglages, « Mon profil », puis « Mon profil public »
- Alors « Rendre ma page publique », non coché, avec l'aide « Visible par tous, et trouvable sur
  Google » (A14 : « le profil public est un choix à part »)
- Et le sous-titre de la planche (« Un choix à part de la visibilité de tes projets… ») est retiré
  (« Moins de mots »)
- Quand elle l'active
- Alors « Ce que voit un visiteur » : « Mon nom et ma photo » (toujours, non décochable), « Ma bio »,
  « Mes outils favoris », « Mes projets publics » (cochés), « Mon nombre d'abonnés » (décoché) ; sous
  « Mes projets publics », le compte (« 2 sur 4 : les autres restent entre membres », planche)
- Et « Jamais montrés : tes ruches, qui te suit, tes commentaires et tes réactions. » (dit qui voit
  quoi, il reste)
- Et « Voir ma page comme un visiteur » ouvre sa page telle qu'un visiteur la voit
- Et le pseudo n'est pas montré (Q8)
- Et un membre suspendu ne rend pas sa page publique ; il peut la refermer (Q6)
- Et la désactiver a le même effet immédiat que pour un projet (« Revenir en arrière »)
- Et rendre un projet public ne rend pas la page publique, ni l'inverse (A14)

### Le signalement par un visiteur (planche `R12-Visiteur-Signaler`, à retoucher ; à dessiner `R12-Visiteur-Signale`)

- Étant donné un visiteur sur un projet public
- Quand il touche « Signaler ce projet »
- Alors la feuille de R9, en deux étapes : la partie visée, puis le motif ; les 8 motifs de R9, dont
  « Contenu illégal » avec le 112 et la précision obligatoire (`ReportReason`)
- Et un champ « Ton adresse e-mail, facultative », avec l'aide « Pour recevoir la suite de ton
  signalement » ; pas de champ pour le nom (Q13 ; question au professionnel : le DSA, art. 16.2.c,
  cite le nom et l'adresse de qui signale)
- Et la phrase « Tu n'as pas besoin de compte pour signaler. » est retirée ; « La modération lit
  chaque signalement. » reste (elle dit qui lit)
- Quand il envoie
- Alors « Signalement envoyé » (comme R9), et, s'il a donné une adresse, un e-mail d'accusé de
  réception, puis un autre à la décision : deux au plus par signalement ; ni l'un ni l'autre ne
  contient de texte d'un membre (Q14)
- Et l'adresse est effacée une fois la décision envoyée (Q14)
- Et ce qu'il peut signaler : un projet public, une de ses mises à jour, une page publique
  (`ReportTargetKind` : `project`, `update`, `member`)
- Et la modération le reçoit dans la même file, sans dire qui l'a envoyé, ni s'il avait un compte
- Et au plus 5 signalements par adresse IP et par jour (20 pour un membre) ; au-delà, « Trop de
  signalements depuis cette connexion. Réessaie demain. » (pas de « tu » ciblé : l'adresse IP est
  partagée) (Q14)
- Et le pied de l'accueil sur ordinateur garde « Signaler un contenu » (planche
  `R12-Visiteur-Desktop`), qui mène à l'adresse de contact de R11 (Q13)

### Les adresses par langue (Q16, décision de Louis du 16/11/2026)

**Quelles pages**
- Les pages publiques, et seulement elles, ont une adresse par langue, `/fr/…` et `/en/…` :
  l'accueil (`/fr/`, `/en/`), un projet public (`/fr/projects/<id>`), une page publique
  (`/fr/members/<id>`), et les quatre pages de R11 (Règles, Confidentialité, Mentions légales,
  Accessibilité), aux mêmes chemins qu'aujourd'hui précédés de la langue
- Et les pages des membres (Fil, Explorer, Activité, réglages, publication, modération, ruches,
  recherche, outils) gardent leurs adresses d'aujourd'hui : les moteurs ne les lisent pas

**Les anciennes adresses**
- Étant donné un lien d'avant R12 (`/projects/<id>`, `/members/<id>`, `/privacy`…), partagé ou dans
  un e-mail déjà envoyé
- Alors il redirige (301) vers la même page dans la langue du navigateur (`Accept-Language`), le
  français s'il n'en dit rien
- Et un membre connecté qui ouvre une page publique y garde ce qu'il voit aujourd'hui (commentaires,
  « Suivre »…), à n'importe laquelle des deux adresses

**La langue de la page**
- Une page publique s'affiche dans la langue de son adresse, pour un visiteur ; un membre connecté
  la voit dans la langue de son appli
- Et le choix de la langue d'une page publique (pied de page) mène à l'autre adresse de la même page
- Et le contenu des membres (titre, accroche, description) n'est pas traduit : la page anglaise d'un
  projet écrit en français montre le texte en français, autour de libellés anglais
- Et les liens de partage portent la langue de qui partage

**Ce que lisent les moteurs**
- Chaque page publique dit son adresse canonique (elle-même), et ses deux langues par des liens
  `hreflang` (`fr`, `en`), plus `x-default` vers l'adresse sans langue
- Et `<html lang>` vaut la langue de l'adresse, dans le HTML reçu
- Et le plan du site liste les deux adresses de chaque page publique

### Le référencement, les liens de partage et les aperçus

**Ce que lisent les moteurs** (R11 ; rapport « Tendances design UX SEO GEO 2026 »)
- Le `robots.txt` de R11 s'ouvre : les adresses publiques (`/fr/`, `/en/` et ce qui suit) ne sont
  plus refusées (sinon un moteur ne lit pas leur `noindex`) ; les réglages, la publication, Activité,
  la modération, les ruches et la recherche restent refusés
- Et chaque page de projet ou de membre arrive avec, **dans le HTML reçu** (un `noindex` ajouté par
  JavaScript n'est pas fiable) :
  - public : le titre, l'accroche en description, l'adresse canonique et les `hreflang`, les balises
    de partage (Open Graph) avec la couverture ;
  - pas public, ou inconnu : un titre neutre (« {{appName}} »), aucune image, et `noindex`, le même
    HTML dans les deux cas (aucune fuite d'existence)
- Et ces balises sont écrites par une petite route du serveur, qui sert la page pré-rendue de l'appli
  avec ses métadonnées ; `web.output` reste `static` (Q15)
- Et un plan du site (`/sitemap.xml`) liste l'accueil, les quatre pages, les projets publics et les
  pages publiques, dans les deux langues ; un projet qui cesse d'être public en sort tout de suite
- Et les robots des moteurs de recherche, y compris ceux des assistants d'IA qui cherchent, peuvent
  lire les pages publiques ; les robots qui collectent pour **entraîner** des modèles sont refusés sur
  toutes les pages publiques (Q17)

**Partager** (F-Pr1, planche `R5a-Partager` ; à dessiner `R12-Partager-Public`)
- Étant donné Léa qui partage « Décollage ! », public
- Alors le bandeau dit « Tout le monde pourra l'ouvrir. » à la place de « Seuls les membres de
  {{appName}} pourront l'ouvrir. » (Q18)
- Et le lien est l'adresse du projet dans la langue de Léa, sans rien sur le membre qui partage
- Et une page publique se partage de même

**L'aperçu d'un lien** (à dessiner `R12-Apercu-Lien`)
- Étant donné le lien de « Décollage ! », public, collé dans une messagerie
- Alors l'aperçu montre la couverture, le titre, l'accroche et « {{appName}} »
- Étant donné le lien d'un projet « Membres », réservé ou privé
- Alors l'aperçu reste celui de {{appName}} (logo, nom), **jamais** le titre ni une image du projet :
  c'est la règle d'aujourd'hui, qui devient une règle testée
- Et l'image de l'aperçu s'ouvre sans compte, seulement pour un projet public ; elle est déjà
  ré-encodée sans métadonnées (CONTRIBUTING, « Sécurité »)

### « Rien n'est public sans ton accord. » (A14)

- Elle s'écrit sur l'accueil (planches `R2-Accueil`, `R12-Visiteur-Accueil`), dans la feuille
  « Compte requis », sous le cadenas de la connexion et de l'inscription, à la place de « Les projets
  et les profils ne se voient qu'avec un compte. », devenue fausse
- Et elle entre dans « En bref » des Règles

### Les textes qui deviennent faux (Q19)

- Le mot « public » qui veut dire « visible des membres » est réécrit : l'aide d'une mise à jour
  (« Tous les membres pourront la lire » : reste vraie pour un projet « Membres », à compléter pour un
  projet public), « rendre de nouveau public », « Aucun projet public pour l'instant. »
- Le blocage : « Vous ne verrez plus les projets… l'un de l'autre » n'est plus vrai pour un projet
  public vu sans être connecté ; la fenêtre ajoute « Tes projets publics restent visibles de tous,
  même sans compte. »
- `libelles.mjs` et un `git grep` des textes de `fr.ts` et `en.ts` trouvent les autres

### Les Règles, la Confidentialité, le registre

**Les Règles**
- « Ce que tu publies » : tu autorises {{appName}} à l'afficher aux personnes que tu choisis, **et à
  tous, moteurs de recherche compris, si tu choisis « Public »** ; un prompt d'un projet public peut
  être copié par toute personne qui le voit (Q5) ; revenir en arrière n'efface pas les copies faites
  ailleurs
- Une partie « Ce que voit un visiteur » : la liste de « Ce que voit un visiteur sans compte »
- « Comment se font le fil, Explorer… » : la vitrine de l'accueil et « À la une » sont choisies par
  l'éditeur parmi les projets publics ; l'auteur peut la quitter (Q9)
- « La modération » : toute personne, avec ou sans compte, peut signaler un contenu public
- « En bref » : « Rien n'est public sans ton accord. »
- Une nouvelle version des règles, donc l'écran « Accepter » pour tous (R11)

**La Confidentialité**
- « Projets » et « Profil » : le choix « Public », ce qu'il montre, à qui, l'indexation par les
  moteurs, les copies qu'ils gardent, le refus des robots d'entraînement (Q17)
- « Signalements » : le visiteur qui signale (adresse facultative, effacée à la décision ; adresse
  IP pour le quota ; durées) (Q14)
- « Sécurité » : les compteurs par adresse IP des visiteurs (lecture des pages, signalements), à leur
  durée réelle
- Ce qu'un visiteur laisse : aucun cookie, aucune mesure d'audience ; les journaux du serveur
- La ligne du fournisseur de l'assistant de code (« au plus tard à l'ouverture au public ») devient
  « au plus tard quand {{appName}} deviendra commercial ou ouvrira les inscriptions » (Q1) ; la
  relecture juridique dit si l'ouverture de contenus publics change ce que cette ligne doit dire

**Le registre** (`docs/legal/registre.md`)
- Profil et projets : la diffusion publique, base légale (le choix du membre), personnes (tout
  internaute), destinataires (moteurs de recherche)
- Signalements : ceux des visiteurs, leur adresse et sa durée
- Anti-abus : les compteurs par adresse IP des visiteurs
- Un traitement « Vitrine de l'accueil et À la une » (finalité, critère, l'éditeur qui choisit)

### Mes données

- L'export ajoute la visibilité « Public » de chaque projet, le choix « page publique » et ses cases,
  et la présence dans la vitrine

### Accessibilité

- La page d'un visiteur se lit par titres comme celle d'un membre ; « Public » est lu dans le nom du
  projet ou à côté du statut
- La feuille « Compte requis » met le focus sur son titre et se ferme au clavier
- Le signalement d'un visiteur : le champ d'adresse a son nom lu et son type (`email`)
- « À la une » se parcourt au clavier, carte par carte, et a un titre lu
- Le choix de la langue d'une page publique dit la langue de destination dans sa langue (« English »,
  « Français ») avec `lang`
- Zones à toucher de 44 au moins ; textes à 200 % sans coupure au milieu d'un mot à 320

### Le parcours d'un membre (`journey`)

- Léa publie « Décollage ! » en « Public » et lit la phrase du bas ; un visiteur (sans session)
  ouvre son ancienne adresse, arrive sur `/fr/projects/<id>`, voit le titre et « Les commentaires
  sont réservés aux membres. », touche « Réagir » et voit la feuille « Compte requis » ; il signale
  le projet avec une adresse
- Louis met « Décollage ! » dans la vitrine ; le visiteur la voit sur l'accueil ; Léa voit la ligne
  dans Activité ; Inès, connectée, ouvre {{appName}}, arrive sur le Fil, puis voit le projet dans « À
  la une » d'Explorer
- Inès rend sa page publique, décoche « Ma bio » ; « Voir ma page comme un visiteur » ne la montre
  pas
- Léa repasse le projet en « Membres de {{appName}} » ; le visiteur rouvre l'adresse et arrive sur
  « Se connecter » ; la vitrine ne le montre plus
- Les métadonnées (titre, `noindex`, `hreflang`, redirections) se vérifient par les tests
  d'intégration de la route qui les écrit, et par `infra/stack-test.sh` pour Caddy : le parcours
  tourne sans Caddy (PGlite)

### Les planches à dessiner et à retoucher (les visuels d'abord)

À dessiner :
- `R12-Qui-Peut-Voir` (téléphone) : « Qui peut le voir ? » avec les quatre choix, « Public » choisi,
  la phrase du bas ; en encart, le retour à « Membres de {{appName}} » d'un projet public ;
- `R12-Visiteur-Projet-Desktop` (ordinateur) : un projet public vu par un visiteur, la colonne de
  droite sans commentaires, avec la phrase et « Créer un compte » ;
- `R12-Visiteur-Projet-Nuit` (téléphone, nuit) : la page visiteur de nuit ;
- `R12-Visiteur-Profil` (téléphone) : la page publique d'Inès vue par un visiteur, et « Signaler ce
  profil » ;
- `R12-Visiteur-Signale` (téléphone) : « Signalement envoyé », l'état « Trop de signalements », et
  l'e-mail d'accusé de réception (640 de large) ;
- `R12-Apercu-Lien` (téléphone) : l'aperçu d'un lien public dans une messagerie, et celui, neutre,
  d'un projet « Membres » ;
- `R12-Partager-Public` (téléphone) : la feuille de partage avec « Tout le monde pourra l'ouvrir. » ;
- `R12-Vitrine` (ordinateur) : dans la modération, mettre un projet public en avant et l'en retirer ;
  en encart, la ligne d'Activité de l'auteur et « Retirer de l'accueil » ;
- `R12-A-La-Une` (téléphone, et un encart ordinateur) : Explorer avec la rangée « À la une » en tête.

À retoucher, selon « Moins de mots » et les décisions ci-dessus :
- `R12-Profil-Public` : sans le sous-titre ;
- `R12-Visiteur-Desktop` : sans la phrase sous l'accroche ni « {{appName}} est un logiciel libre. »,
  avec le pied de R11 (`R11-Pied`) et le choix de la langue ;
- `R12-Compte-Requis` : sans la phrase sous le titre ni « Ta réaction sera posée juste après », avec
  « {{appName}} s'ouvre sur invitation. » ;
- `R12-Visiteur-Signaler` : sans « Tu n'as pas besoin de compte pour signaler. », les deux étapes de
  R9 (partie, puis motif) ;
- `R12-Visiteur-Projet` : la description, la galerie, le prompt ; le nom de l'auteur sans lien ; la
  pastille « Public ».

## R12b — Les exemples

La vitrine de l'accueil reste vide tant qu'aucun membre n'a rendu un projet public. L'équipe publie
donc des projets d'exemple, fictifs mais crédibles, depuis un compte à elle. Personne ne doit les
prendre pour de vrais projets (décision du 16/11/2026).

### Un compte d'exemples

- Étant donné un compte vérifié de l'équipe (« WaiggleBot »)
  Quand un administrateur du serveur lance `infra/mark-example.sh <son e-mail>`
  Alors ce compte devient un compte d'exemples ; `--revoke` le rend ordinaire.
- Aucun écran de l'appli ne donne ni ne retire ce marquage.

### Ce que voient les membres et les visiteurs

- Étant donné un projet d'un compte d'exemples
  Quand il s'affiche (vitrine de l'accueil, « À la une », Fil, Explorer, recherche, page d'un
  membre, page du projet, pour un membre comme pour un visiteur)
  Alors une pastille « Exemple » l'accompagne, à côté de son statut ou du nom de l'auteur.
- Sur la page du projet, sous son en-tête : « Projet fictif, créé par l'équipe de {{appName}} pour
  montrer à quoi ressemble un projet. »
- Sur la page du compte d'exemples, la pastille « Exemple » à côté du nom, et dessous : « Les
  projets de ce compte sont fictifs : l'équipe de {{appName}} les a créés pour montrer à quoi
  ressemble un projet. »
- Un lecteur d'écran lit « Exemple » comme le reste du texte.

### Ce qui ne les montre pas

- Les moteurs de recherche : la tête d'un projet ou d'une page d'un compte d'exemples dit
  `noindex`, et le plan du site ne les contient pas.
- Les e-mails « Découvertes » ne proposent pas les projets d'un compte d'exemples.
- Les suggestions de personnes à suivre ne proposent pas un compte d'exemples.
- Un membre qui suit le compte d'exemples voit ses projets dans son Fil, comme pour tout membre.

### Le reste ne change pas

Un projet d'exemple se signale, se modère et se met dans la vitrine comme les autres. Ses réactions
et ses commentaires sont ceux de vrais membres.

### Ce que l'équipe publie (relecture juridique de R12b)

Des règles de contenu, sans code : l'équipe les suit en publiant.

- Un projet d'exemple n'est jamais « Testable » et n'a pas de démo.
- Il ne demande rien aux membres (ni conseil, ni astuce, ni test) : un vrai membre écrirait à
  une personne qui n'existe pas.
- Le compte d'exemples ne réagit pas, ne commente pas et ne suit personne. Si l'équipe répond à un
  commentaire, c'est depuis son propre compte, au nom de l'équipe.
- Ses projets comptent dans « Outils populaires » et dans le nombre de projets d'un outil, comme
  ceux des membres : les outils d'un même éditeur n'apparaissent pas dans plus de 4 projets
  d'exemple, pour ne pas faire le classement à la place des membres.

## R13 — Le premier chargement

Mesuré le 17/11/2026 sur waiggle.com (audit de design, section 4) : sur un téléphone modeste (4G
lente, processeur ralenti), l'accueil ne devient vivant qu'après 8,5 s ; pendant ce temps le titre
est caché sous la barre du haut et la page reste un moment sans texte. Sur ordinateur, on voit
d'abord la page du téléphone étirée, puis un saut. En mode sombre, l'écran reste noir, puis montre la
page de jour. Le script fait 1,3 Mo, le même pour toutes les pages, catalogue de développement et
deux langues comprises. Le serveur, lui, répond en 33 ms : tout se joue dans la page.

Le contenu des pages publiques dans leur HTML et le cache des images publiques viennent avec R22
« Les pages publiques » ; une seule langue dans le script, avec R18 « Les finitions » (quelques
dizaines de Ko pour beaucoup de précautions : la page anglaise doit l'avoir dès le premier rendu).

### Ce que voit un visiteur pendant le chargement

- Étant donné un visiteur qui ouvre l'accueil, une page publique ou les Règles
  Quand la page n'a pas encore démarré
  Alors le titre est lisible en entier : la barre du haut a déjà sa place et ne recouvre rien.
- Le texte s'affiche dès la première image, dans une police du système de la même famille (sans
  empattement, ou à chasse fixe pour le code), puis dans les polices de la marque quand elles
  arrivent : jamais une page sans texte.
- Étant donné un visiteur sur ordinateur (fenêtre de plus de 700 px)
  Quand la page n'a pas encore démarré
  Alors il voit le fond de la page et l'abeille au centre, jamais la mise en page du téléphone
  étirée ; puis la page d'ordinateur, sans saut.
- Étant donné un appareil en mode sombre
  Quand la page n'a pas encore démarré, même après 3 secondes
  Alors il voit le fond de nuit et l'abeille, jamais la page de jour ; puis la page de nuit.
- Un lecteur d'écran n'annonce pas l'abeille d'attente comme un contenu : elle est décorative, et la
  page annonce son titre quand elle est prête.
- « Réduire les animations » : l'abeille d'attente ne vole pas, elle reste posée.

### Ce que charge la page

- Le catalogue des composants n'est pas dans le script de l'appli publiée : ni ses écrans ni ses
  textes (« Catalogue des composants » et ses exemples) ; la page `/catalogue` reste « introuvable »
  en ligne et marche en développement.
- Les écrans rares et lourds (modération, éditeur de projet, réglages, coin des testeurs) se
  chargent quand on les ouvre, pas avec l'accueil.
- Les polices : au format du web (WOFF2) ; seules celles du premier écran sont préchargées ; la
  police à chasse fixe (Geist Mono) arrive avec l'écran qui s'en sert.

### Les cibles (téléphone modeste, mesurées avant et après par le même script)

| Mesure | Le 17/11 | Cible |
| --- | --- | --- |
| Poids transféré de `/fr/` | 1 650 Ko | moins de 600 Ko |
| Script de `/fr/` | 1 319 Ko | moins de 450 Ko |
| L'appli démarre | 8,5 s | moins de 4 s |
| Polices au premier écran | 208 Ko, 8 fichiers | moins de 70 Ko, 3 fichiers |
| Sauts de mise en page de l'accueil (ordinateur ; téléphone) | 0,24 ; 0,20 | moins de 0,05 |
| Titre caché par la barre | oui, 7 s | jamais |
| Page sans texte | 0,4 s | jamais |
| Mode sombre avant le démarrage | écran noir 3,4 s, puis page de jour | l'abeille sur fond de nuit |

Une cible manquée ne bloque pas la tranche : le bilan dit de combien, et pourquoi.

### Le reste ne change pas

Une fois la page démarrée, rien ne change pour un membre ni pour un visiteur : mêmes écrans, mêmes
textes, mêmes adresses. Le parcours d'un membre et les captures restent verts.

## R14 — Les projets d'un membre

Depuis R10 (F-Et5), la page d'un membre range ses projets en tuiles, comme la page d'un outil : le
nom de l'auteur revient sous chaque tuile de sa propre page, une tuile ne dit rien du projet
(ni accroche, ni statut, ni réactions), et la tuile montre une autre image que la page du projet.
Les planches validées `R3-Moi` et `R3-Membre-Desktop` montraient autre chose : une mosaïque de
cartes comme celles du Fil. Louis y revient (décision 16 du 17/11/2026, « ok, mosaïque ») ; la
page d'un outil, les ruches et « Récents » gardent leurs tuiles ou leurs cartes.

### La mosaïque

- Étant donné la page de Léa, vue par Léa ou par un proche
  Quand ses projets s'affichent
  Alors le plus récent est une grande carte, comme celles du Fil : photo plein cadre, titre,
  accroche, statut, « Tester » s'il est testable, réactions ;
  Et les suivants sont des cartes plus petites : photo plein cadre, titre, statut et réactions ;
  sans photo, la lumière miel avec l'accroche sur deux lignes.
- Étant donné la page publique de Léa, vue par un visiteur
  Alors la même mosaïque, avec ce que la page publique sait de chaque projet : photo, titre,
  accroche et statut (ni réactions ni « Tester » : la page publique du projet les montre).
- Aucune carte ne répète le nom de Léa : on est sur sa page.
- La pastille de visibilité (« Privé », « Réservé à Famille »), « Exemple » et « Mis à jour »
  restent sur la carte qui les a.
- Un seul projet : la grande carte seule. Deux : deux cartes égales. Trois et plus : la grande carte
  puis les petites, sans case vide.
- L'ordre de lecture (clavier, lecteur d'écran) suit l'ordre des projets : 1, 2, 3…
- La photo d'une carte est la même que la première photo de la galerie du projet.

### Ce que la mosaïque devient selon la largeur

- Téléphone : la grande carte sur toute la largeur, puis deux colonnes de petites cartes.
- Tablette : la grande carte sur deux colonnes, deux petites empilées à côté, puis des rangées de
  trois.
- Ordinateur : la même mosaïque sous l'en-tête, la grande carte à côté de deux petites empilées,
  puis des rangées de trois (quatre au-delà de 1 536 points).

### Entrer dans un projet et en sortir

Pour un membre ; un visiteur passe d'une page publique à l'autre comme aujourd'hui.

- Étant donné la page de Léa
  Quand je touche un de ses projets
  Alors sa photo grandit depuis la carte jusqu'à la page du projet, le reste de la page apparaît en
  fondu, et la page montre tout de suite ce que la carte savait (titre, accroche, statut, photo,
  d'abord floue puis nette) ; le reste de la page arrive avec son chargement.
- Quand je reviens par le bouton Retour de la page
  Alors la photo se replie dans sa carte, la page de Léa est déjà là, au même endroit, sans page
  vide entre les deux, et le focus revient sur la carte.
- Par le Retour du navigateur : la page de Léa revient tout de suite, sans page vide, et sa carte
  le marque d'un léger rebond.
- « Réduire les animations » : un fondu court dans les deux sens, sans vol.

### Le reste ne change pas

La page d'un outil, l'onglet Projets d'une ruche et « Récents » d'Explorer gardent leur forme. Le
projet épinglé (en grand même s'il n'est pas le plus récent), la bannière et la colonne du profil
sur ordinateur viennent plus tard (R15 et suivantes).

## R15 — L'ordinateur en grand

Le contenu n'a que deux largeurs, 520 et 1 280 points. Sur un écran de 1 920, un tiers de la largeur
ne sert à rien (320 points vides de chaque côté), et sur les écrans étroits, les trois quarts ; aucune
grille ne gagne de colonne, et sur Explorer à 1 920 × 1 080, aucune carte de « Récents » n'est sur le
premier écran (audit de design du 17/11, section 2). Louis a choisi un gabarit large, plafonné à
1 920, sans colonne de navigation à gauche, avec trois planches à 1 920 d'abord (décision 11 du
17/11). Les cartes et les grilles s'élargissent ; le texte qui se lit et les formulaires restent
étroits.

### Le gabarit large

- Étant donné un écran de cartes (le Fil, Explorer, la page d'une étiquette ou d'un outil, la page
  d'un membre, l'accueil du visiteur)
  Quand la fenêtre s'élargit
  Alors le contenu garde des marges de 32 points jusqu'à 1 536, puis de 5 % de la fenêtre, et ne
  dépasse jamais 1 920 : 1 376 à 1 440, 1 728 à 1 920, 1 920 à 2 560.
- La barre du haut suit la largeur de l'écran ouvert ; son champ de recherche ne dépasse pas 560.
- Le texte courant (description, pages légales, commentaires) reste à 560 points au plus, quelle
  que soit la largeur.
- Sous 1 280, rien ne change.

### Des colonnes qui suivent la place

- Les grilles de cartes comptent leurs colonnes selon la place, plus selon le type d'appareil : une
  carte ne descend pas sous sa largeur minimale, et une colonne de plus apparaît dès qu'elle tient.
- Le Fil, à 1 920 : trois colonnes de cartes à côté de son panneau (Tes ruches, Proches à suivre,
  Ils cherchent des testeurs), qui reste en place au défilement.
- La page d'une étiquette ou d'un outil : cinq à six colonnes de tuiles à 1 920.
- L'accueil du visiteur : ses quatre cartes s'élargissent ; rien d'autre ne change.

### Explorer

- Étant donné Explorer sur un écran de 1 536 points et plus (en dessous, Explorer reste celui
  d'aujourd'hui : « Récents » sur trois colonnes à 1 280)
  Alors « Ils cherchent des testeurs » et « Outils populaires » passent dans un panneau à droite,
  en lignes ;
  Et « À la une » puis « Récents » prennent la colonne principale, « Récents » sur quatre à cinq
  colonnes ;
  Et à 1 920 × 1 080, au moins quatre cartes de « Récents » sont entières sur le premier écran.

### La page d'un membre

- Étant donné la page de Léa sur un écran de 1 100 points et plus
  Alors son profil (photo, nom, pseudo, bio, outils favoris, abonnés, Suivre ou Modifier mon
  profil) est une colonne à gauche, qui reste en place au défilement, sous une bannière floue tirée
  de sa photo ;
  Et la mosaïque de ses projets (R14) occupe la droite.
- Avec quatre projets, la dernière petite carte n'est plus seule sur sa rangée, étirée en bandeau :
  les petites cartes se répartissent sans carte isolée.
- Sur téléphone et tablette, la page reste celle de R14.

### Ce qui reste étroit

- Les Réglages, les pages légales et l'Activité gardent leur largeur, mais leur bloc est centré
  dans la page au lieu d'être calé à gauche.
- La page d'un projet, ses mises à jour, le coin des testeurs, la connexion, les feuilles (Publier,
  Modifier) et les états (vide, erreur, introuvable) ne changent pas.

### Les cibles (mesurées avant et après par le même passage)

- Part de la fenêtre occupée par le contenu des écrans de cartes : 67 % → 90 % à 1 920, 50 % → 75 %
  à 2 560.
- Cartes de « Récents » entières sur le premier écran d'Explorer à 1 920 × 1 080 : 0 → 4 au moins.
- Aucune ligne de texte courant au-delà de 90 caractères ; aucun défilement horizontal de 320 à
  2 560.

### Le reste ne change pas

Recherche, Outils et Ruches restent étroits (leurs grilles viennent plus tard, avec leurs planches).
Le projet épinglé n'est pas dans cette tranche.

## R16 — Les squelettes

Pendant un chargement, l'appli montre partout la même image : trois bandes grises, dessinées en R1,
avant la refonte. Elles ne ressemblent ni au Fil, ni à un projet, ni à une personne ; posées sur la
lumière miel, elles virent au kaki ; dans l'appli, elles clignotent moins de 300 ms entre deux pages,
et au premier chargement elles restent jusqu'à 8 s à l'écran (audit de design du 17/11, section 11).
Louis a choisi des squelettes à la forme de chaque page, sur planche d'abord (décision 17 du 17/11).
La tranche commence par une garde de session commune aux écrans, qui règle aussi le saut des pages
lisibles sans compte (placé ici par Louis le 17/11). Le 17/11 au soir, Louis a vu sur le site des
sauts au chargement, surtout sur Explorer, et la page Ruches restée étroite sur grand écran ; il a
placé dans R16 la garde sur tous les écrans, la correction de ces sauts, et Ruches, Recherche et
Outils en grand (« on fait tout maintenant dans R16 »).

### Le squelette a la forme de sa page

- Étant donné une page qui charge (le Fil, la page d'un projet, la page d'un membre, l'accueil du
  visiteur, Explorer, la page d'une étiquette ou d'un outil)
  Alors son squelette pose, aux mêmes places et aux mêmes tailles, les cartes, la galerie, l'en-tête
  et les colonnes que la page aura, à la largeur de l'écran (téléphone, tablette, ordinateur,
  jusqu'à 1 920) ;
  Et ce qui est déjà connu s'affiche pour de vrai : la barre du haut, « Retour », les titres de
  section (« Tes ruches », « Récents »…).
- Le Fil n'a plus qu'un squelette, au lieu de deux qui se suivent.
- Ouverte depuis une carte, la page d'un projet montre tout de suite le titre, l'auteur, la photo et
  le statut que la carte connaissait ; le squelette ne couvre que la description, la recette et les
  commentaires. De même, depuis une carte, la page d'un membre montre tout de suite son nom et sa
  photo.
- Sur l'accueil du visiteur, la vitrine garde sa place avec quatre cartes vides : rien ne pousse le
  bas de la page.
- Une section qui arrive seule (« À la une », « Outils populaires », « Proches à suivre », la
  vitrine) garde sa hauteur pendant qu'elle charge.
- Les listes (Activité, ruches, commentaires, modération) et les formulaires (profil, réglages)
  montrent des lignes et des champs vides ; les indicateurs qui tournent et les « Chargement… »
  écrits disparaissent (un lecteur d'écran entend toujours « Chargement »).

### La couleur et le mouvement (sur la planche, de jour et de nuit)

- Une carte vide garde la matière d'une carte réelle sans photo (crème ou feuille, coins et bord),
  pas une dalle grise ; les lignes et les ronds sont d'un brun miel transparent, qui ne vire plus au
  kaki sur la lumière.
- Une lueur miel traverse lentement les cartes vides, au lieu de la respiration grise d'aujourd'hui
  (choix de Louis du 17/11).
- Sous « Réduire les animations », elle ne bouge plus : le squelette est immobile.

### Quand on le voit

- Dans l'appli, si la page arrive en moins de 160 ms, aucun squelette ne s'affiche.
- Quand le contenu arrive, le squelette fond vers lui (environ 180 ms) au lieu d'être échangé d'un
  coup.
- Au premier chargement du site, la page pré-rendue est déjà le squelette de la bonne forme.
- « Revenir » apparaît toujours après 4 s d'attente.

### La garde de session et les pages lisibles sans compte

- Étant donné un visiteur sans compte sur ordinateur
  Quand il ouvre les Règles, la Confidentialité, les Mentions ou l'Accessibilité
  Alors le titre ne saute plus à l'arrivée (aujourd'hui 63 points, deux fois).
- Tous les écrans qui demandent un compte (une quarantaine) partagent une même garde de session :
  même attente, même renvoi vers la connexion qu'aujourd'hui, même page quand la session ne se
  vérifie pas.

### La page ne bouge plus en arrivant

- Étant donné un membre connecté sur ordinateur
  Quand il ouvre ou recharge n'importe quelle page
  Alors la barre du haut est à sa place dès la première image, et le contenu ne descend plus quand
  la session se confirme (aujourd'hui 63 points).
- Étant donné une page qui s'affiche avant l'arrivée des polices de Waiggle
  Quand elles arrivent
  Alors ni la barre, ni les titres, ni les cartes ne bougent ni ne grandissent (aujourd'hui, la
  barre glisse de 10 points et les cartes du Fil grandissent de 52).
- Sur Explorer, l'en-tête d'« À la une » a la même hauteur avec ou sans ses flèches : les flèches
  n'apparaissent qu'une fois qu'on sait qu'elles servent, sans rien déplacer.
- Sur Explorer, « Récents » ne bouge plus quand « À la une » et « Ils cherchent des testeurs »
  arrivent (aujourd'hui, il est poussé de plus de 500 points).
- Sur la page d'une ruche, les trois colonnes sont posées dès le squelette : la colonne de droite
  ne remonte plus (aujourd'hui 161 points).

### Ruches, Recherche et Outils en grand (sur planche d'abord)

- Étant donné Ruches, Recherche ou Outils sur un écran de 1 280 points et plus
  Alors la page prend le gabarit large de R15 (marges de 32 points, puis 5 % de la fenêtre,
  1 920 au plus), comme le Fil et Explorer.
- Ruches : les invitations reçues et mes ruches prennent la largeur, en autant de colonnes que la
  place le permet ; « Créer une ruche » reste en haut à droite.
- Recherche : les projets trouvés en grille de cartes, comme sur Explorer ; les membres et les
  outils trouvés à côté ou dessous, selon la planche.
- Outils : « Les plus utilisés » et « De A à Z » prennent la largeur, en colonnes ; le champ et les
  familles restent au-dessus.
- Le texte qui se lit (la phrase qui explique les ruches, celle du catalogue) reste à 560 points
  au plus.
- Les titres « Ruches », « Recherche » et « Outils » ne s'affichent plus, à toutes les largeurs :
  l'onglet allumé, le champ de recherche et « Chercher un outil » disent déjà où l'on est (Louis,
  17/11 au soir). Ils restent le titre de niveau 1 que lit un lecteur d'écran.
- Sous 1 280, ces trois pages ne changent pas d'une autre façon.

### Les cibles (mesurées avant et après par le même passage)

- Décalage de mise en page (CLS) sous 0,05 au premier chargement : Fil, page d'un projet, page d'un
  membre, accueil du visiteur (0,24 aujourd'hui), Explorer (0,41 ; 0,14 à 1 440 mesuré le 17/11 au
  soir), page d'une ruche, Ruches, pages légales vues sans compte (0,098 à 1 440).
- La barre du haut : 0 point de déplacement entre la première image et la page finie, pour un
  membre comme pour un visiteur, à 1 440 et à 2 560.
- Part de la fenêtre occupée par Ruches, Recherche et Outils : environ 90 % à 1 920, comme les
  écrans de cartes de R15.
- Images de squelette entre deux pages quand l'API répond vite : 3 à 5 aujourd'hui (190 ms) → 0.
- États avant le contenu sur le Fil : 3 → 1.
- Le squelette et la page finie, superposés, ont leurs grandes masses aux mêmes places (galerie,
  colonnes, cartes).

### Le reste ne change pas

Les transitions entre pages, la photo qui défile moins vite et la vague de miel sont R17. Le
préchargement des pages avant le clic n'est pas dans cette tranche.

## R17 — Les passages de page

Sur le web, changer de page ne se voit presque pas, ou se voit mal. L'ancienne page est coupée net,
la nouvelle fond en 180 ms depuis le vide, le retour rejoue ce fondu sur une page déjà prête (on
croit à un rechargement), et la photo d'une carte grandit sur une page vide (audit de design du
17/11, section 3, film image par image). Louis a choisi la variante B du prototype des transitions,
« fondu et glissement » (décision 12 du 17/11), et décidé de faire la photo qui défile moins vite
que la page et la vague de miel des maquettes validées le 28/10 (décision 13). Il a placé ici aussi
la feuille vide d'environ 340 ms au Retour d'un projet, sur téléphone (relecture de R14, 17/11 au
matin). Les squelettes à la forme de la page (R16) donnent la matière : un passage ne mène plus à
trois bandes grises.

### Avancer et revenir, sur le web

- Étant donné un membre sur une page
  Quand il ouvre une page plus profonde (un lien, une ligne, une tuile, une carte)
  Alors l'ancien contenu s'efface en 160 ms pendant que le nouveau apparaît en 320 ms en montant
  de 12 points, sur la courbe « sortie » des jetons (le prototype B validé) ;
  Et la barre du haut et la lumière d'ambiance ne bougent pas.
- Quand il revient par le « Retour » de la page
  Alors c'est l'inverse : le contenu de la page d'avant descend de 12 points en apparaissant ;
  Et il la retrouve à l'endroit où il l'avait laissée (défilement gardé), jamais en fondu depuis
  une page vide.
- Quand il revient par le bouton ou le geste « retour » du navigateur
  Alors l'appli n'ajoute pas d'animation à celle du navigateur ;
  Mais la page d'avant est là tout de suite, à son défilement, sans page vide ni fondu depuis le
  vide.
- Quand il passe d'un onglet à l'autre (Fil, Explorer, Ruches, Moi)
  Alors les deux pages se fondent l'une dans l'autre en 180 ms, sans direction : ce sont des pages
  sœurs.
- La première page de la visite n'a pas de passage : elle est pré-rendue, elle s'affiche telle
  quelle.
- Pendant un passage (400 ms au plus), un second appui ne lance pas une seconde page.
- Un navigateur qui ne sait pas animer un passage de page (View Transitions) montre la page plus
  profonde en fondu, en montant de 12 points, et l'ancienne disparaît d'un coup ; au retour, la
  page d'avant est là tout de suite, sans fondu.

### La carte qui devient la page

- Étant donné une carte de projet avec sa photo, où qu'elle soit (le Fil, Récents, une ruche, les
  projets d'un membre, un carrousel d'Explorer, la vitrine de l'accueil). Les pages publiques
  viendront avec R22.
  Quand le membre l'ouvre
  Alors, sur le web, la photo de la carte grandit jusqu'à la couverture de la page du projet, en environ 420 ms ;
  Et le reste de la page fond en 180 ms autour d'elle ;
  Et on ne voit jamais la page d'arrivée vide derrière la photo.
- Quand il revient par le « Retour » de la page
  Alors la photo se replie dans sa carte, à sa place dans la page d'avant.
- Sur téléphone, au « Retour », la page d'avant est là pendant le repli : plus de feuille vide
  d'environ 340 ms (là depuis R4, sur le Fil aussi). La photo vole au-dessus des deux pages.
- Sur iOS et Android, la carte qui devient la page reste celle d'aujourd'hui ; avancer glisse
  comme le veut le système, et les onglets se fondent.

### La photo d'un projet qui défile moins vite

- Étant donné la page d'un projet avec sa photo de couverture
  Quand le membre fait défiler la page
  Alors la photo descend moins vite que la page (45 % de sa vitesse), et la page la recouvre ;
  Quand il tire vers le bas, plus haut que le haut de la page
  Alors la photo s'agrandit doucement (1 % tous les 6 points), puis revient à sa taille.
- Le texte de la page ne bouge jamais à une autre vitesse que le doigt : seule la photo est
  décalée.

### La vague de miel à l'entrée

- Étant donné une personne qui se connecte (« Me connecter » de la page de connexion) ou qui
  entre après avoir vérifié son adresse (« Continuer » de la page « Adresse vérifiée »)
  Quand elle entre dans l'appli
  Alors une vague de miel monte depuis ce bouton, couvre l'écran, puis se retire
  par le bas et découvre le Fil, en 1,2 s environ ;
  Et la lumière d'ambiance reçoit une impulsion.
- La vague ne passe qu'à cette entrée : jamais à l'ouverture de l'appli par un membre déjà
  connecté, ni en revenant sur le Fil.
- Pendant la vague, rien ne se touche ; le Fil reçoit le focus à son arrivée, comme aujourd'hui.

### Réduire les animations

- Si la personne a activé « Réduire les animations » :
  - chaque passage de page est un fondu croisé de 180 ms, sans déplacement ;
  - la carte qui devient la page est un fondu croisé ;
  - la photo d'un projet ne défile plus à part et ne s'étire pas ;
  - la vague de miel devient un fondu vers le Fil.
- La lumière d'ambiance garde sa couleur et reste immobile (WCAG 2.2.2).

### Les cibles (mesurées avant et après par le même passage)

- Entre le Fil et un projet : images où l'on voit un squelette générique, 2 à 4 → 0 ; une image
  entièrement vide, oui → non.
- Du clic à la page posée, sur ordinateur : 890 ms → 400 ms au plus (hors vol de la photo).
- Défilement gardé au retour, par le bouton de la page comme par le navigateur.
- Sous « Réduire les animations » : un fondu de 10 à 12 images, sans déplacement.
- Au Retour d'un projet sur téléphone : 0 image de feuille vide (aujourd'hui ~340 ms).
- Écart maximal entre deux images pendant un passage, sur un téléphone : 34 ms au plus.

### Le reste ne change pas

Le focus et ce que lit un lecteur d'écran suivent les règles d'aujourd'hui (le titre à l'arrivée,
la carte au retour). Les feuilles (Publier, Signaler…) gardent leur mouvement. Le préchargement des
pages avant le clic n'est pas dans cette tranche.

## R18 — Les finitions

Des restes des tranches passées, avant la gamification : le premier chargement encore lourd
(pistes mesurées en R13), le focus qui tombe sur toute la page à l'arrivée (relectures de R17), le
catalogue des composants qui bloque l'ordinateur 45 s (D1 de R17), et trois points de la liste
« À reprendre » (26/10) : l'ordre de Tab sur ordinateur, la ponctuation des textes des membres,
les cartes sans photo. Les leçons à retoucher se font hors du dépôt.

### Le premier chargement plus léger

Aujourd'hui, le navigateur reçoit 1 096 Ko de script avant de pouvoir répondre : le serveur le
compresse à la volée, au niveau le plus rapide (mesuré sur waiggle.com le 22/11).

- Étant donné une personne qui ouvre waiggle.com pour la première fois
  Quand la page arrive
  Alors le script lui parvient compressé à l'avance, au plus fort (brotli, sinon zstd, sinon gzip),
  selon ce que sait son navigateur ;
  Et elle ne télécharge ni les messages d'erreur de Zod dans 64 langues, ni le code qu'Expo ne sert à
  aucune page ;
  Et elle ne télécharge que la langue de la page (le français sur /fr/, l'anglais sur /en/).
- Quand un membre change de langue (Réglages)
  Alors l'autre langue arrive en moins d'une seconde, pendant que le choix montre qu'il travaille ;
  Et si elle n'arrive pas (réseau coupé), la langue reste celle d'avant, avec un message et
  « Réessayer ».
- Étant donné un visiteur (sans compte)
  Alors il ne télécharge aucun écran réservé aux membres (Fil, Réglages, Publier, Ruches…) ;
  Quand un membre ouvre pour la première fois de sa visite une page de membre
  Alors il voit le squelette de cette page (R16) le temps que son morceau arrive, puis plus jamais
  pendant la visite.

### Le focus à l'arrivée sur une page

- Étant donné une personne qui se sert du clavier ou d'un lecteur d'écran
  Quand elle ouvre une page plus profonde (un lien, une ligne, une tuile, une carte) ou change
  d'onglet
  Alors le focus va au titre de la page, et le lecteur d'écran le lit ;
  Et le Tab suivant mène au premier contrôle sous le titre ;
  Et l'anneau du focus ne se montre qu'au clavier : au doigt ou à la souris, rien ne se voit.
- Une page dont le titre est caché (Ruches, Fil) reçoit le focus sur ce titre caché : le lecteur
  d'écran le lit, l'anneau ne se voit pas, le Tab suivant reprend sous lui.
- Quand elle revient (le « Retour » de la page ou celui du navigateur)
  Alors le focus revient sur la carte, la ligne ou le lien qui l'avait menée là.
- La première page de la visite garde le comportement du navigateur ; une feuille garde le sien
  (le focus dans la feuille, puis sur ce qui l'a ouverte).

### L'ordre de Tab sur ordinateur

Déjà réglé depuis R5a : la page d'un projet se lit rangée par rangée (la galerie et les réactions,
puis l'en-tête et « Suivre », puis la description et la conversation ; décision du 2/11), et la
colonne latérale du Fil vient après son contenu. La tranche le vérifie au clavier, sans le changer.

- Étant donné la page d'un projet, ou le Fil, à deux colonnes
  Quand on avance au clavier
  Alors on parcourt la page dans l'ordre où on la lit, rangée par rangée.

### Les textes des membres bien ponctués

- Étant donné un membre qui écrit « Ça marche ? Oui ! » ou « Note : à tester » (titre, accroche,
  description, mise à jour, commentaire)
  Quand le texte s'affiche en français
  Alors l'espace que le membre a tapée devant ? ! : ; (et après « , avant ») devient insécable : le
  signe ne part jamais seul en début de ligne ;
  Et le texte enregistré ne change pas ; sans espace tapée (« Oui! », « 10:30 », une adresse
  https://…), rien n'est ajouté.
- En anglais, rien ne change.

### Les cartes sans photo sur téléphone

- Étant donné un projet sans photo, dans le Fil ou une liste, sur téléphone
  Alors sa carte n'est pas plus haute qu'il ne faut (sur planche) ;
  Et avec un texte à 200 %, le titre reste lisible, sans mot coupé au milieu.

### Le catalogue sur ordinateur

- Étant donné le catalogue des composants (outil de développement, absent de l'appli publiée)
  Quand on l'ouvre sur ordinateur
  Alors il est utilisable en 10 s au plus (aujourd'hui 45 s), sans tâche de plus d'une seconde
  (aujourd'hui 19 s) ;
  Et ses captures montrent toujours chaque composant dans tous ses états.

### Les cibles (mesurées avant et après par le même passage)

- Script reçu au premier chargement de /fr/ : 1 096 Ko → 700 Ko au plus (686 mesurés ; la cible
  de 650 visée d'abord n'est pas atteinte, la garde de la CI est posée à 700 : décision de Louis
  du 22/11).
- Les captures ne rougissent plus au hasard : `feuille-retour-erreur` passe à chaque exécution.
- Catalogue sur ordinateur : 45 s → 10 s ; tâche la plus longue : 19 s → 1 s.
- Focus après l'arrivée : BODY → le titre de la page, sur chaque page des captures.

### Le reste ne change pas

Les passages de page (R17), les squelettes (R16) et les feuilles gardent leur mouvement. Les pages
publiques rendues dans le HTML viennent avec R22.

## R19 — La gamification

Statut : **validé par Louis** le 23/11/2026 (décisions du 17/11 : pollen, miel, rayon, titres,
séries qui hivernent, défis, classement, sceaux ; « rien qui culpabilise »).

Chaque geste qui aide un proche (tester, faire un retour, commenter, encourager) ou qui fait avancer
son propre projet rapporte du **pollen**. Le pollen fait monter de **niveau** et ne baisse jamais.
Certains moments (une semaine butinée, un défi réussi) rapportent aussi du **miel**, qui se dépense.
Rien ne se perd et rien ne presse : pas de compte à rebours, pas de « tu vas perdre », pas de
chiffre rouge. Aucun geste n'est bloqué par la gamification.

### Le pollen

- Étant donné un membre qui fait un geste de la liste ci-dessous
  Quand le geste réussit
  Alors il gagne son pollen, et un petit « +10 pollen » doré s'affiche un instant près du bouton
  (un fondu avec « Réduire les animations ») ;
  Et le lecteur d'écran l'annonce poliment, sans couper.
- Le même geste sur la même chose ne paie qu'une fois : retirer puis reposer une réaction, ne plus
  suivre puis suivre à nouveau, ne rapporte rien de plus.
- Défaire un geste (supprimer un commentaire, retirer une réaction) ne retire pas son pollen.
  Seule exception : un contenu retiré par la modération retire le pollen qu'il a rapporté ; une
  suspension n'efface rien du passé.
- Chaque sorte de geste a un plafond par jour : au-delà, le geste marche, sans pollen, et rien ne
  l'affiche comme une faute.
- Rien ne se gagne sur ses propres projets (réagir, suivre, tester y sont déjà refusés ; commenter
  son projet ne rapporte rien).
- Un compte suspendu ne gagne rien. Un compte d'exemple (WaiggleBot) ne gagne rien, n'apparaît
  dans aucun classement et ne fait gagner personne.

| Geste | Pollen | Compté par jour, au plus |
| --- | --- | --- |
| Faire un retour de testeur (premier message d'un fil, puis un par jour et par fil) | 25 | 4 |
| Son retour marqué « réglé » par l'auteur | 25 | — |
| Devenir testeur d'un projet | 10 | 5 |
| Commenter ou répondre sur le projet d'un autre | 10 | 10 |
| Publier un projet (premier passage hors privé) | 50 | 2 |
| Publier une mise à jour | 20 | 3 |
| Réagir (chaque sorte, une fois par projet) | 2 | 25 |
| Suivre un projet ou un membre | 3 | 10 |
| Recevoir sur son projet un retour, un testeur, un commentaire, une réaction | 5, 5, 3, 1 | 50 au total |
| Créer une ruche | 15 | 1 |
| Une invitation dans une ruche acceptée (l'invitant ; l'invité gagne 15) | 20 | 5 |
| Compléter son profil (photo, bio, un outil : chacun une fois) | 10 | — |

Ne rapportent rien : ouvrir l'appli ; « Tester la démo » (aucune trace aujourd'hui, et un clic se
triche) ; le parrainage à l'inscription (le code d'invitation est commun : il viendra avec le code
des Éclaireuses, R20).

### Le niveau et « ton rayon »

- Le niveau n commence à 50 × n × (n − 1) pollen : niveau 2 à 100, 3 à 300, 5 à 1 000, 10 à 4 500 ;
  pas de plafond.
- Étant donné un membre
  Quand il ouvre son profil
  Alors il voit son niveau (« Niveau 4 »), son titre (« Butineuse »), et **son rayon** : une
  rangée d'alvéoles qui se remplissent de pollen jusqu'au niveau suivant ;
  Et « 120 pollen avant le niveau 5 » se lit en toutes lettres (le lecteur d'écran aussi).
- Quand il passe un niveau
  Alors une alvéole se scelle (la cire coule) à sa prochaine visite du profil, une seule fois.

### Les titres

- Le titre dit **comment** on butine, pas combien :
  - **Butineuse** : réagit et commente ;
  - **Bâtisseuse** : publie et met à jour ses projets ;
  - **Gardienne** : teste et fait des retours ;
  - **Danseuse** : fait venir du monde (invitations acceptées, ruches créées) ;
  - **Éclaireuse** : réservé aux testeuses de Waiggle (R20).
- Le titre affiché est celui de la famille de gestes qui a rapporté le plus de pollen sur les 4
  dernières semaines ; le membre peut en épingler un autre qu'il a déjà obtenu.
- **La forme se choisit** dans le profil : au féminin par défaut (les ouvrières sont des
  abeilles), au masculin d'un geste (Butineur, Bâtisseur, Gardien, Danseur, Éclaireur). En anglais,
  une seule forme : Forager, Builder, Keeper, Dancer, Scout.

### Les sceaux de cire

- Une douzaine de sceaux pour des premières fois et des paliers : premier projet, première mise à
  jour, premier retour, premier retour réglé, 10 projets testés, 10 retours, première ruche créée,
  une ruche de 5 proches, 5 invitations acceptées, 10 et 25 semaines butinées, et un sceau par
  catégorie de projet (avoir testé ou commenté 3 projets de la catégorie, « Explorateur du
  jardin »). La liste exacte au plan.
- Un sceau gagné reste ; il s'affiche sur le profil, les plus récents d'abord. Un sceau non gagné
  ne s'affiche pas sur le profil : pas de vitrine de manques.

### Les semaines butinées (les séries qui hivernent)

- Une semaine (du lundi au dimanche, heure de Paris) est **butinée** si le membre y a fait au moins
  un geste qui aide ou qui crée : publier, mettre à jour, commenter, faire un retour, devenir
  testeur. Réagir ou suivre seuls ne suffisent pas ; ouvrir l'appli non plus.
- Étant donné une série de 6 semaines butinées
  Quand une semaine passe sans geste
  Alors la série **hiverne** : elle garde ses 6 semaines, une abeille endormie la montre, et rien
  ne le reproche ;
  Quand le membre butine de nouveau
  Alors la série reprend à 7.
- Le profil montre « 7 semaines butinées » ; jamais « tu vas perdre ta série ».
- Chaque semaine butinée rapporte 5 miel.

### Les défis

- **Le défi perso** : chaque lundi, trois défis sont proposés (« Fais un retour sur un projet »,
  « Publie une mise à jour », « Teste un projet d'un proche »…) ; le membre en choisit un, ou
  aucun. Réussi, il rapporte 10 miel et du pollen ; manqué, il disparaît le lundi suivant sans
  trace.
- **Le défi de ruche** : chaque lundi, chaque ruche de 3 membres au moins reçoit un défi commun
  (« 5 retours entre vous cette semaine »), tiré d'une liste fixe ; ses membres voient l'avancée
  (« 3 sur 5 ») dans la ruche, sans dire qui n'a rien fait. Réussi, chacun de ceux qui y ont
  participé reçoit 10 miel.

### Le classement de la semaine

- Les **proches** d'un membre, pour le classement : les membres qu'il suit et qui le suivent.
- Étant donné un membre
  Quand il ouvre le classement
  Alors il voit, pour la semaine en cours, le pollen gagné par lui et ses proches, du plus au moins ;
  Et un onglet par ruche pour le classement de ses membres ;
  Et tout repart à zéro chaque lundi.
- Seuls apparaissent ceux qui ont gagné du pollen cette semaine : personne n'est montré à zéro, et
  le bas du classement ne se distingue pas.
- Chacun apparaît d'office. **Le retrait** : un réglage « Apparaître dans les classements ».
  Retiré, on ne voit plus les classements et on n'y apparaît plus ; le pollen et le niveau restent.

### Le miel

- Le solde de miel se voit à côté du niveau, sur son profil seulement.
- Il se gagne : 5 par semaine butinée, 10 par défi perso, 10 par défi de ruche. Il ne s'achète pas.
- Il se dépense :
  - **offrir du miel** au projet d'un proche (5 miel) : un grand encouragement, l'auteur voit
    « Léa t'a offert du miel » dans son activité ;
  - **décorer son rayon** (une teinte, un motif de cire).
- Plus tard, des fonctions gagnées pour un temps (hors de cette tranche).

### Où on le voit

- Sur **son profil** : niveau, titre, rayon, semaines butinées, miel, sceaux.
- Sur **la page d'un membre** (connecté) : niveau, titre, rayon et sceaux ; jamais le miel.
- Sur **la page publique** (R12) : rien dans cette tranche.
- Une page **« Ma récolte »**, ouverte depuis le rayon du profil (et, sur ordinateur, depuis une
  ligne « Ta semaine » de la colonne du Fil) : le pollen de la semaine et d'où il vient, le défi
  perso, les défis de ruche, le classement, le miel et ce qu'il achète, tous les sceaux. Pas de
  nouvel onglet.

### Ce qui fait revenir, sans insister

- Dans **l'Activité** de l'appli (jamais d'e-mail immédiat ni de notification poussée) : un niveau
  passé, un sceau gagné, un défi de ruche réussi, « Léa t'a offert du miel ».
- Le **récap du dimanche** gagne, seulement s'il y a quelque chose à dire : « Ta semaine : +85
  pollen, défi réussi », l'avancée du défi de ta ruche (« 4 sur 5 »), et « Nouveaux défis lundi ».
- Toujours en positif : jamais « tu vas perdre », jamais de compte à rebours. Un réglage des
  notifications, « Ma récolte », coupe ces lignes et ces annonces.

### Au lancement

- Les membres existants reçoivent une fois, au déploiement, le pollen et les sceaux de ce qu'ils
  ont déjà fait, sans plafond par jour pour le passé ; les séries et le miel partent de zéro.

### Les données

- Le pollen, les sceaux, les séries, les défis et le miel sont dans l'export du compte, et partent
  avec lui.
- La Confidentialité et le registre disent ce qui est compté, et qui voit le classement.

### Le reste ne change pas

Les réactions, commentaires, retours et ruches marchent comme avant. Les Éclaireuses (R20)
viennent ensuite, avec leur sceau de fondatrice et le parrainage.
