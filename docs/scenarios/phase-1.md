# Phase 1 — MVP en cercle restreint : scénarios

Statut : **validé par Louis** le 12/10/2026. Tranche 1 réalisée (voir ses notes de réalisation).

Chaque scénario devient un ou plusieurs tests. Les tranches sont listées dans l'ordre où on les
développera ; chacune est livrable seule.

---

## Tranche 1 — Compte

**Créer un compte par e-mail**
- Étant donné un visiteur sans compte
- Quand il s'inscrit avec un nom, une adresse e-mail et un mot de passe d'au moins 12 caractères
- Alors il reçoit un e-mail de vérification dans sa langue
- Et il ne peut publier qu'après avoir cliqué sur le lien de vérification

**Refuser une adresse déjà utilisée**
- Quand quelqu'un s'inscrit avec une adresse déjà enregistrée
- Alors l'inscription est refusée sans révéler si l'adresse existe (même message que pour un succès)

**Se connecter**
- Étant donné un membre vérifié
- Quand il se connecte avec son e-mail et son mot de passe, ou une passkey
- Alors il arrive sur son fil
- Et après 5 échecs en 15 minutes, les tentatives sont temporairement bloquées

**Supprimer son compte**
- Quand un membre supprime son compte depuis l'appli
- Alors son profil, ses projets, réactions et commentaires disparaissent
- Et il peut d'abord télécharger l'export de ses données

**Recevoir des e-mails de compte sans traqueur** (ajouté le 14/10/2026, ADR 0005)
- Étant donné un e-mail envoyé par l'appli à propos du compte (vérification, adresse déjà utilisée)
- Quand le membre l'ouvre
- Alors aucun pixel ni image de suivi n'y signale l'ouverture
- Et chaque lien pointe directement vers waiggle.io ou api.waiggle.io, jamais vers un domaine de
  redirection d'un prestataire

### Notes de réalisation (tranche 1)

- **Plus strict que prévu** : on ne peut pas du tout se connecter avant d'avoir vérifié son
  adresse (le scénario disait seulement « ne peut pas publier »). Cliquer sur le lien connecte
  directement, donc rien n'est perdu pour le membre.
- **Passkeys reportées** : elles exigent un vrai nom de domaine et une configuration iOS / Android.
  Elles viendront après la mise en ligne sur le VPS.
- **Limitation** : 5 tentatives de connexion par quart d'heure et par adresse IP (pas par compte).
- **Suppression** immédiate après confirmation du mot de passe, sans e-mail de confirmation.
- **Langue** : enregistrée à l'inscription (choix de l'appli, sinon langue du navigateur).
  Changer de langue dans les réglages viendra avec la tranche 2.

## Tranche 2 — Profil et langue

**Compléter son profil**
- Un membre renseigne un nom affiché, une courte bio, un avatar et ses outils favoris
- L'avatar est ré-encodé et ses métadonnées (dont la position GPS) sont supprimées

**Choisir sa langue**
- Au premier lancement, l'appli suit la langue de l'appareil si c'est le français ou l'anglais,
  sinon le français
- Un membre peut changer de langue dans ses réglages ; son choix est mémorisé sur tous ses appareils
- Les e-mails et notifications lui sont envoyés dans cette langue

### Précisions (tranche 2)

- **Limites** : nom de 1 à 80 caractères, bio de 280 caractères au plus, 10 outils favoris au plus
  (40 caractères chacun, doublons retirés).
- **Avatar** : JPEG, PNG ou WebP de 5 Mo au plus. Il est redressé selon l'orientation de la photo,
  recadré en carré de 512 px, réenregistré en WebP, sans aucune métadonnée. Un nouvel avatar
  remplace et efface l'ancien ; la suppression du compte efface aussi l'avatar.
- **Anti-abus** : 30 modifications de profil et 10 envois d'avatar par heure et par membre.
- **Langue** : changer de langue dans l'appli connectée l'enregistre sur le compte ; à la
  connexion sur un autre appareil, l'appli reprend la langue du compte.
- **Ce qui n'est pas modifiable ici** : l'adresse e-mail et le mot de passe (tranche ultérieure).

### Notes de réalisation (tranche 2) — à valider

Règles ajoutées pendant la réalisation, surtout après la relecture de sécurité :

- **Photo préparée sur l'appareil** : l'appli recadre la photo en carré au centre et la réduit à
  1 024 px avant l'envoi (sur mobile, le membre choisit lui-même le cadrage).
- **Images refusées par le serveur** (même si un autre programme que l'appli les envoie) : plus de
  4 096 × 4 096 pixels, plus de 4 fois plus larges que hautes (ou l'inverse), ou en 16 bits par
  couleur. Une photo de téléphone ordinaire (12 mégapixels) passe.
- **Serveur très sollicité** : au-delà de 2 images en traitement et 8 en attente, l'envoi est refusé
  avec « Réessaie dans un instant ».
- **Caractères invisibles refusés** dans le nom, la bio et les outils : caractères de contrôle,
  caractères qui inversent le sens d'écriture, lettres « vides ». Un nom doit contenir au moins un
  caractère visible. Effet de bord : les drapeaux d'Écosse et du pays de Galles (faits de
  caractères invisibles) ne sont pas acceptés. Les mêmes règles s'appliquent au nom choisi à
  l'inscription.
- **Image envoyée à l'inscription** : ignorée ; un avatar ne vient que de « Changer la photo ».
- **Autres sites** : toute modification envoyée depuis un autre site que l'appli est refusée.

## Tranche 3 — Publier un projet

**Publier un projet**
- Étant donné un membre vérifié
- Quand il publie un projet avec un titre, un pitch d'une phrase, au moins un visuel et un lien de
  démo
- Alors le projet apparaît sur son profil et dans le fil de ses abonnés

**Lien de démo valide**
- Le lien de démo doit être en `https://`
- Un lien vers une adresse locale ou privée (localhost, 192.168.x.x…) est refusé

**Recette du projet**
- L'auteur peut indiquer les outils et modèles utilisés, le temps passé et, s'il le souhaite, ses
  prompts clés
- Les outils deviennent des étiquettes cliquables (« fait avec Claude »)

**Statut et visibilité**
- Un projet a un statut : idée, en construction, testable, terminé, en pause
- Un projet a une visibilité : public ou privé
- Un projet privé n'apparaît nulle part pour les autres membres : ni fil, ni profil, ni recherche,
  ni lien direct (réponse « introuvable »)

**Modifier ou supprimer**
- Seul l'auteur peut modifier ou supprimer son projet ; toute tentative d'un autre membre est refusée

### Précisions (tranche 3) — validées le 12/10/2026

Décisions de Louis :
- **Visuel et lien de démo** : toujours facultatifs. Sans lien, le projet affiche « Pas encore de
  démo ».
- **« Public » veut dire « visible par les membres connectés »** : il faut un compte pour voir un
  projet, la page d'un membre ou une étiquette. Rien n'est visible sans compte, ni indexé par les
  moteurs de recherche.
- **Description longue** en Markdown, assainie à l'affichage.
- **Temps passé** : par tranches (moins d'une heure, une soirée, un week-end, quelques semaines,
  plusieurs mois).

Règles détaillées :
- **Textes** : titre de 1 à 80 caractères ; pitch d'une ligne, de 1 à 140 caractères ; description
  de 10 000 caractères au plus ; 15 outils ou modèles au plus (40 caractères chacun, doublons
  retirés) ; 5 prompts clés au plus (4 000 caractères chacun, affichés tels quels). Les caractères
  invisibles sont refusés partout, comme en tranche 2.
- **Statut** par défaut : idée. **Visibilité** par défaut : public. Un projet privé sert aussi de
  brouillon.
- **Lien de démo** : `https://` uniquement. Sont refusés `localhost`, les noms sans point, les noms
  en `.local`, `.internal`, `.home.arpa` ou `.localhost`, et toute adresse IP privée, locale ou
  réservée. Le serveur n'ouvre jamais ce lien. Un clic passe par une page d'avertissement
  (« Tu quittes Ruche pour… »), comme tous les liens externes.
- **Visuels** : de 0 à 6 par projet, en JPEG, PNG ou WebP de 5 Mo au plus. Ils sont ré-encodés en
  WebP de 1 600 px au plus, sans métadonnées. Le premier sert de couverture, et l'ordre est
  modifiable.
- **Étiquettes** : « Claude », « claude » et « CLAUDE » mènent à la même page. Une page d'étiquette
  ne montre que les projets publics.
- **Droits** : seul l'auteur modifie ou supprime son projet. Pour un projet public, un autre membre
  reçoit « refusé » ; pour un projet privé, « introuvable » (il n'apprend même pas qu'il existe).
- **Suppression** immédiate et définitive, après confirmation. Les visuels sont effacés, et tout
  disparaît avec le compte. L'export des données inclut les projets.
- **Anti-abus**, par membre : 20 créations de projet par jour, 60 modifications par heure, 30 envois
  de visuel par heure.
- **Listes** : les 50 projets les plus récents, sans pagination pour l'instant (elle arrivera avec
  le fil, en tranche 4).
- **Fil des abonnés** : le projet y apparaîtra avec la tranche 4. Dans cette tranche, il apparaît
  sur la page de son auteur et sur les pages de ses étiquettes.
- **Réalisation en deux étapes** : 3a pour le projet lui-même, 3b pour les visuels, la page d'un
  membre et les étiquettes.

### Précisions (tranche 3b-1, les visuels) — validées le 16/10/2026

Décisions de Louis du 16/10/2026 : photos d'abord (la vidéo aura sa propre tranche), une
couverture verticale pour le téléphone, et des médias visibles des seuls membres. La 3b est
découpée en deux : 3b-1 pour les visuels, 3b-2 pour la page d'un membre et les étiquettes.

**Ajouter des photos à son projet**
- Étant donné l'auteur d'un projet
- Quand il ajoute des photos (6 au plus) et choisit leur ordre
- Alors la première sert de couverture, et les autres se parcourent sur la page du projet
- Et la lumière d'ambiance prend la couleur de la photo affichée

**Donner une couverture verticale pour le téléphone**
- Étant donné l'auteur d'un projet
- Quand il choisit une couverture verticale (plus haute que large)
- Alors, sur téléphone, le projet s'affiche avec elle ; sur ordinateur, avec la première photo
- Et sans couverture verticale, le téléphone recadre la première photo au centre

**Des médias réservés aux membres**
- Étant donné une photo d'un projet privé, dont quelqu'un a gardé l'adresse
- Quand un autre membre, ou une personne sans compte, ouvre cette adresse
- Alors la réponse est « introuvable »
- Et il en va de même pour les avatars ouverts sans compte

Règles détaillées :
- **Galerie** : de 0 à 6 photos. **Couverture verticale** : une seule, facultative, plus haute que
  large (sinon refusée). Elle ne compte pas dans les 6.
- **Qui voit quoi** : une photo n'est visible que par un membre connecté qui voit le projet ; un
  avatar, par tout membre connecté. Pour les autres : « introuvable », sans plus de détail.
  **Ceci change la tranche 2**, où un avatar restait visible par quiconque avait son adresse.
- **Côté serveur**, mêmes refus que pour l'avatar : plus de 4 096 × 4 096 pixels, plus de 4 fois
  plus larges que hautes (ou l'inverse), 16 bits par couleur. Même file d'attente : au-delà de
  2 images en traitement et 8 en attente, « Réessaie dans un instant ». Une 7e photo est refusée
  (« Six photos au plus »).
- **Sur l'appareil** : pas de recadrage imposé pour la galerie ; recadrage proposé en vertical pour
  la couverture verticale. L'image est réduite à 2 048 px avant l'envoi, puis le serveur la
  ré-encode en WebP de 1 600 px au plus, sans métadonnées, et en calcule le résumé flou
  (ThumbHash) pour la lumière d'ambiance.
- **Ordre** : des boutons « Mettre en couverture », « Avancer », « Reculer », « Retirer »
  (utilisables au clavier et au lecteur d'écran), plutôt qu'un glisser-déposer.
- **À la création d'un projet**, les photos choisies partent juste après la publication. Si l'une
  échoue, le projet est quand même publié, et la page de modification le signale.
- **Suppression** : retirer une photo, supprimer le projet ou le compte efface les fichiers.
- **Plus tard** : la vidéo, avec sa propre tranche et une décision sur son hébergement.

### Précisions (tranche 3b-2, la page d'un membre et les étiquettes) — validées le 18/10/2026

Jusqu'ici, un projet publié ne se retrouvait nulle part : ni l'auteur ni les outils ne menaient
quelque part. Cette tranche ajoute la page d'un membre et la page d'une étiquette, en attendant le
fil de la tranche 4.

**La page d'un membre**
- Étant donné un membre connecté
- Quand il touche le nom ou l'avatar d'un auteur
- Alors il voit sa page : avatar, nom, bio, outils favoris, et ses projets publics, du plus récent
  au plus ancien
- Et sur sa propre page, il voit aussi ses projets privés, marqués « Privé »

**La page d'une étiquette**
- Étant donné un membre connecté
- Quand il touche une étiquette (« Claude Code ») sur un projet ou sur un profil
- Alors il voit les projets publics faits avec cet outil, de tous les membres, du plus récent au
  plus ancien
- Et « Claude Code », « claude code » et « CLAUDE-CODE » mènent à la même page

**Retrouver ses projets**
- Étant donné un membre connecté, sur l'accueil
- Quand il touche « Mes projets »
- Alors il arrive sur sa propre page

Règles détaillées :
- **Rien sans compte** : la page d'un membre et celle d'une étiquette sont réservées aux membres
  connectés.
- **Un membre introuvable** (identifiant inconnu, compte supprimé, ou adresse e-mail jamais
  vérifiée) : « introuvable ».
- **Une étiquette sans projet public** s'affiche avec « Aucun projet public pour l'instant », et non
  « introuvable » : une étiquette portée seulement par des projets privés ressemble ainsi à une
  étiquette inconnue, et ne révèle rien. Même les projets privés du visiteur n'y figurent pas.
- **Jamais affichés** sur la page d'un membre : son adresse e-mail, sa langue, ses dates de
  connexion.
- **Listes** : les 50 projets les plus récents, sans pagination (elle arrivera avec le fil).
- **Les outils favoris** d'un profil deviennent eux aussi des étiquettes cliquables.

## Design Miel — Apparence et accessibilité

Statut : **validé par Louis** le 12/10/2026.

Avant la tranche 3b, l'appli prend l'identité « Miel » choisie par Louis (blanc, verre, lumière de
miel). Ces scénarios valent pour tous les écrans, présents et à venir.

**Choisir l'apparence**
- Étant donné un membre dans ses réglages
- Quand il choisit l'apparence « Automatique », « Jour » ou « Nuit »
- Alors l'appli change aussitôt d'apparence, sans recharger la page
- Et ce choix est mémorisé sur cet appareil seulement (le téléphone et l'ordinateur peuvent avoir
  chacun le leur)
- Et « Automatique », le choix par défaut, suit le mode clair ou sombre de l'appareil, même quand il
  change pendant l'utilisation

**Animations et lumière d'ambiance**
- Par défaut, pour tout le monde, l'appli a toutes les animations du prototype et la lumière
  d'ambiance vivante : elle prend la couleur du visuel affiché, respire lentement et suit
  l'inclinaison du téléphone
- Seule exception : sur un appareil où la personne a elle-même activé « Réduire les animations »
  (une option d'accessibilité pour qui a le mal des transports), les grands déplacements (une carte
  qui s'envole, la lumière qui suit l'inclinaison) deviennent des fondus. Le reste ne change pas,
  lumière d'ambiance comprise

**Texte agrandi**
- Étant donné un appareil réglé avec une grande taille de texte
- Alors les textes de l'appli grandissent aussi, jusqu'à deux fois leur taille
- Et aucun texte n'est coupé ni ne déborde de son bouton ou de sa carte

**Lisibilité**
- Tout texte respecte un contraste d'au moins 4,5:1 avec son fond (3:1 pour les gros titres et les
  icônes), de jour comme de nuit
- Un bouton qui n'affiche qu'une icône a un nom lu par les lecteurs d'écran (« Retour »,
  « Partager »)
- Les cibles à toucher mesurent au moins 44 × 44 points

**Sur ordinateur**
- Quand la fenêtre est large, les pages s'organisent en colonnes et le contenu ne dépasse pas
  1 280 px de large, centré
- Quand on rétrécit la fenêtre, les colonnes s'empilent comme sur un téléphone, sans défilement
  horizontal

**Le nom de l'appli**
- L'appli, le site et les e-mails affichent « Waiggle »
- Changer ce nom plus tard ne demande de modifier qu'un seul endroit du code
- « Ruche » reste le nom de code du dépôt et n'apparaît plus nulle part pour les membres

**Polices et vie privée**
- Les polices sont livrées avec l'appli : afficher une page n'envoie aucune requête à un service
  extérieur (Google Fonts, par exemple)

## Mise en ligne — Inscription sur invitation

Statut : **validé par Louis** le 13/10/2026 (avec le plan de mise en ligne).

L'appli est en ligne sur waiggle.io. Pour rester entre proches, il faut un code d'invitation pour
créer un compte. Louis le choisit et le donne à qui il veut.

**S'inscrire avec le bon code**
- Étant donné un visiteur qui a reçu le code d'invitation
- Quand il s'inscrit avec son nom, son adresse e-mail, son mot de passe et ce code
- Alors l'inscription se passe comme aujourd'hui : il reçoit l'e-mail de vérification

**Refuser un code faux ou absent**
- Quand quelqu'un s'inscrit sans code, ou avec un code faux
- Alors l'inscription est refusée avec le message « Ce code d'invitation n'est pas valide.
  Demande-le à la personne qui t'a invité·e. »
- Et aucun compte n'est créé, aucun e-mail n'est envoyé
- Et le code est vérifié avant tout le reste : la réponse ne révèle jamais si l'adresse a déjà un
  compte

**Ne pas pouvoir deviner le code**
- La limite qui existe déjà (10 inscriptions par heure et par adresse IP) compte aussi les essais
  de code : en essayer des milliers est impossible

**Partager un lien d'invitation**
- Quand un visiteur ouvre `https://waiggle.io/sign-up?code=…`
- Alors le champ « Code d'invitation » est déjà rempli

### Précisions (inscription sur invitation)

- **Le code** : au moins 12 caractères. Les majuscules, les minuscules et les espaces au début ou
  à la fin sont ignorés (« Miel-2026-Noel » et « miel-2026-noel » sont le même code).
- **Où il vit** : sur le serveur (variable `SIGNUP_INVITE_CODE`), jamais dans le code du dépôt.
  Le changer ne touche pas les membres déjà inscrits ; l'ancien code ne marche plus aussitôt.
- **Fermé par défaut** : en production, le serveur refuse de démarrer si aucun code n'est réglé.
  En développement et dans les tests, l'inscription reste libre.
- **Seule l'inscription change** : la connexion, la vérification de l'adresse et le reste du
  compte fonctionnent comme avant.

### Notes de réalisation (inscription sur invitation)

Ajouts après la relecture de sécurité :

- **Un code tiré au hasard** : la documentation conseille `openssl rand -hex 8` (16 caractères).
  Le serveur refuse de démarrer avec un code qui sert d'exemple dans le dépôt (« Miel-2026-Noel »…) :
  le dépôt est public, n'importe qui pourrait le lire.
- **Le code quitte l'adresse** : une fois le champ rempli par un lien d'invitation, le code est
  retiré de l'adresse de la page (historique du navigateur, partage d'écran).
- **Une seule porte d'entrée** : quand un code est réglé, seule l'inscription par e-mail peut
  créer un compte. Une future connexion par Google ou par lien magique ne pourra pas passer à
  côté. La route de relais du plugin Expo (connexion par un autre site sur téléphone, inutilisée)
  est désactivée : elle renvoyait vers n'importe quel site.
- **Accents** : « Noël » tapé sur deux claviers différents donne le même code.

## Tranche 4 — Suivre et le fil

**Suivre**
- Un membre peut suivre une personne ou un seul projet, et arrêter de suivre

**Le fil « Abonnements »**
- Le fil montre, du plus récent au plus ancien, les nouveaux projets des personnes suivies et les
  mises à jour des projets suivis
- Arrivé au bout, le membre voit « tu es à jour » au lieu d'un défilement infini
- Les nouvelles cartes apparaissent sans recharger quand l'appli est ouverte

**Le fil « Découvrir »**
- Il montre les projets publics récents de tous les membres, et ceux qui cherchent des testeurs

**Ouvrir une démo**
- Quand un membre ouvre un lien de démo, une page lui indique qu'il quitte Ruche et vers quel domaine

## Tranche 5 — Réagir et commenter

**Réagir**
- Un membre peut poser une réaction par type sur un projet : Bluffant, Inspirant, Utile, Drôle, Bravo
- Il peut retirer sa réaction ; les compteurs se mettent à jour

**Commenter**
- Un membre peut commenter un projet et répondre à un commentaire, avec des mentions `@nom`
- L'auteur d'un commentaire peut le modifier ou le supprimer ; l'auteur du projet peut le masquer

## Tranche 6 — Notifications

- Un membre est notifié quand on réagit à son projet, le commente, le suit ou le mentionne
- Les notifications similaires sont regroupées (« 3 personnes ont réagi à ton projet »)
- Il choisit, par type, push, e-mail ou rien ; un récap par e-mail est possible

## Tranche 7 — Sécurité et modération

**Signaler**
- Tout membre peut signaler un projet, un commentaire ou un profil, avec un motif
- Le signalement arrive dans la file de l'administration

**Bloquer**
- Un membre peut en bloquer un autre : ils ne voient plus leurs contenus respectifs et ne peuvent
  plus interagir

**Administrer**
- Un administrateur voit la file des signalements, peut masquer un contenu, suspendre un compte et
  consulter l'historique de ces actions
