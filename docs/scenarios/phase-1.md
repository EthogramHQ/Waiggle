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
- Et chaque lien pointe directement vers waiggle.com ou api.waiggle.com, jamais vers un domaine de
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

L'appli est en ligne sur waiggle.com. Pour rester entre proches, il faut un code d'invitation pour
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
- Quand un visiteur ouvre `https://waiggle.com/sign-up?code=…`
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

### Précisions (tranche 4) — validées le 19/10/2026

Décisions de Louis :
- **Une « mise à jour » est une note publiée par l'auteur** (« v2 : mode hors ligne »). Modifier
  le projet (corriger une faute, changer une photo) ne fait rien remonter dans le fil.
- **« Cherche des testeurs »** : un projet au statut « testable » qui a un lien de démo. Pas de
  champ à part.
- **Les nouveautés** : l'appli vérifie toutes les minutes, et quand on revient sur elle. S'il y a
  du nouveau, un bandeau « 3 nouveautés » apparaît en haut du fil ; le toucher les affiche. Le fil
  ne bouge jamais tout seul sous le doigt.
- **Abonnements** : on voit combien de membres suivent une personne ou un projet, jamais leurs
  noms. La personne suivie n'est pas prévenue (les notifications viendront en tranche 6).
- **Réalisation en deux étapes** : 4a pour suivre et les deux fils (nouveaux projets), 4b pour les
  notes.

**Suivre une personne**
- Étant donné un membre connecté, sur la page d'un autre membre
- Quand il touche « Suivre »
- Alors le bouton devient « Suivi », et le nombre d'abonnés augmente de un
- Et les nouveaux projets publics de cette personne arrivent dans son fil « Abonnements »
- Quand il touche de nouveau le bouton, il ne la suit plus

**Suivre un projet**
- Étant donné un membre connecté, sur le projet d'un autre membre
- Quand il touche « Suivre ce projet »
- Alors les notes de ce projet arriveront dans son fil « Abonnements » (4b)

**Le fil « Abonnements »**
- Étant donné un membre connecté qui suit des personnes
- Quand il ouvre l'accueil
- Alors il voit leurs nouveaux projets publics, du plus récent au plus ancien, 20 à la fois
- Et « Afficher la suite » charge les 20 suivants ; tout au bout, il lit « Tu es à jour »
- Étant donné un membre qui ne suit personne
- Alors il lit « Tu ne suis personne pour l'instant », avec un bouton vers « Découvrir »

**Le fil « Découvrir »**
- Étant donné un membre connecté, sur l'accueil
- Quand il choisit « Découvrir »
- Alors il voit tous les projets publics, du plus récent au plus ancien, les siens compris
- Et le filtre « Cherche des testeurs » ne garde que les projets testables qui ont une démo

**Les notes (4b)**
- Étant donné l'auteur d'un projet
- Quand il publie une note (« v2 : mode hors ligne »)
- Alors elle apparaît dans le journal du projet, et dans le fil des membres qui suivent ce projet
- Et quand il change le statut de son projet, l'appli lui propose une note déjà écrite (« Le
  projet passe en « testable ». »)

Règles détaillées :
- **Date d'un nouveau projet** : le moment où il devient public pour la première fois. Un
  brouillon privé rendu public une semaine plus tard arrive donc en haut du fil. Le repasser en
  privé puis en public ne le fait pas remonter.
- **Un projet privé n'apparaît dans aucun fil**, ses notes non plus, même pour ses abonnés et même
  pour son auteur. Un abonnement à un projet devenu privé est gardé, mais ne montre plus rien ;
  si le projet redevient public, ses notes reviennent.
- **On ne se suit pas soi-même**, ni ses propres projets : refusé.
- **Suivre un membre** inconnu, supprimé ou jamais vérifié, **ou le projet privé d'un autre** :
  « introuvable ». Suivre deux fois revient à suivre une fois.
- **Notes** (4b) : texte brut de 1 à 1 000 caractères, sans caractères invisibles, affiché tel
  quel. Seul l'auteur publie ou supprime une note de son projet : un autre membre reçoit « refusé »
  si le projet est public, « introuvable » s'il est privé. La suppression demande une
  confirmation. Le journal du projet montre les 20 notes les plus récentes.
- **Anti-abus**, par membre : 120 changements d'abonnement par heure ; 30 notes par jour (4b).
- **Suppression du compte** : ses abonnements, ses abonnés et ses notes disparaissent, et les
  nombres d'abonnés baissent d'autant.
- **Export des données** : il comprend les membres et les projets suivis (identifiant et date), et
  les notes (4b). Un projet suivi devenu privé n'y figure pas, comme s'il avait été supprimé :
  l'export ne doit pas révéler qu'il existe encore.

## Tranche 5 — Réagir et commenter

**Réagir**
- Un membre peut poser une réaction par type sur un projet : Bluffant, Inspirant, Utile, Drôle, Bravo
- Il peut retirer sa réaction ; les compteurs se mettent à jour

**Commenter**
- Un membre peut commenter un projet et répondre à un commentaire, avec des mentions `@nom`
- L'auteur d'un commentaire peut le modifier ou le supprimer ; l'auteur du projet peut le masquer

### Précisions (tranche 5) — validées le 19/10/2026

Décisions de Louis :
- **Les mentions « @nom » sont reportées à la tranche 6** : un membre n'a pas de pseudo unique, et
  une mention ne sert qu'à prévenir quelqu'un, ce que font les notifications.
- **Les réponses tiennent sur un seul niveau** : un commentaire « racine » et ses réponses,
  affichées dessous de la plus ancienne à la plus récente. Répondre à une réponse ajoute au même fil.
- **Masquer** : l'auteur du projet masque un commentaire d'un autre. Le commentaire reste visible de
  son auteur et de l'auteur du projet, marqué « masqué » ; les autres ne le voient plus. L'auteur du
  projet peut le démasquer. Rien n'est effacé en silence.
- **Réactions** : chacun voit les nombres par type et ses propres réactions, jamais qui a réagi
  (comme pour les abonnés). On ne réagit pas à son propre projet.
- **Ni les réactions ni les commentaires n'apparaissent dans les fils ou sur les cartes** : seulement
  sur la page du projet. L'auteur sera prévenu par les notifications (tranche 6).

Décisions de Louis après les relectures (19/10/2026) :
- **Un projet devenu privé, plus personne ne lit ce que les autres y ont laissé**, auteur du projet
  compris : leurs commentaires et leurs réactions sont cachés à tous, puis reviennent si le projet
  redevient public. Chacun garde ainsi la maîtrise de ce qu'il a écrit : rien n'est lu sans lui.
- **Un seul « Répondre » par fil**, au bout du fil, et pas sur chaque commentaire : les réponses
  vont toujours au bout du fil. Il n'apparaît pas sous un commentaire supprimé ou masqué.
- **Des textes non genrés** pour le membre qui lit (« personne d'autre que toi » plutôt que « toi
  seul »), notes comprises.
- **Sur téléphone**, « Modifier » et « Supprimer » le projet viennent après les commentaires.

**Réagir**
- Étant donné un membre connecté, sur le projet public d'un autre
- Quand il touche « Bravo »
- Alors le bouton passe en « réagi » et le nombre de « Bravo » augmente de un
- Et il peut poser jusqu'à cinq réactions différentes sur le même projet, une par type
- Quand il touche de nouveau « Bravo », sa réaction est retirée et le nombre baisse de un
- Étant donné l'auteur du projet
- Alors il voit les nombres de son projet, sans pouvoir réagir

**Commenter**
- Étant donné un membre connecté, sur un projet qu'il voit (le sien, privé compris, ou le projet
  public d'un autre)
- Quand il publie un commentaire (texte brut, 1 à 1 000 caractères)
- Alors le commentaire apparaît en haut de la liste, avec son nom, sa photo et la date
- Et un autre membre peut y répondre, par « Répondre » au bout du fil : la réponse s'affiche sous
  le commentaire, les réponses de la plus ancienne à la plus récente

**Modifier et supprimer son commentaire**
- Étant donné l'auteur d'un commentaire
- Quand il le modifie
- Alors le texte change et le commentaire porte la mention « modifié »
- Quand il le supprime, après confirmation
- Alors il disparaît ; s'il avait des réponses, il devient « Commentaire supprimé » et les réponses
  restent

**Masquer un commentaire**
- Étant donné l'auteur du projet, devant le commentaire d'un autre membre
- Quand il le masque
- Alors les autres membres ne le voient plus ; son auteur et l'auteur du projet le voient encore,
  marqué « masqué » ; une racine masquée qui a des réponses visibles devient « Commentaire
  masqué » pour les autres
- Quand il le démasque, le commentaire redevient visible de tous
- L'auteur du projet ne modifie ni ne supprime le commentaire d'un autre

Règles détaillées :
- **Liste** : les 20 commentaires racines les plus récents d'abord, chacun avec toutes ses réponses
  (50 au plus) ; « Afficher la suite » charge les 20 suivants ; tout au bout, « C'est tout ».
- **Droits** : sans session, « connecte-toi » ; projet inconnu, mal formé ou privé d'un autre :
  « introuvable », toujours la même réponse ; réagir à son propre projet : refusé ; modifier ou
  supprimer le commentaire d'un autre, ou masquer sans être l'auteur du projet (y compris son propre
  commentaire : il le supprime plutôt) : « refusé » ; répondre à un commentaire d'un autre projet, à
  une réponse, à un commentaire supprimé ou à un commentaire masqué qu'on ne voit pas :
  « introuvable ». Un commentaire masqué qu'on ne voit pas est « introuvable » pour toute demande
  (modifier, supprimer, masquer, démasquer, répondre), comme un commentaire inconnu.
- **Un projet privé** : seul son auteur le voit, et il n'y voit que ses propres commentaires. Les
  commentaires et les réactions des autres membres sont cachés à tous, auteur compris (nombres à
  zéro) ; ils sont gardés, et reviennent si le projet redevient public.
- **Le nombre de commentaires** affiché compte les racines et les réponses que tout le monde voit :
  ni les masqués, ni les supprimés, ni ceux d'un compte supprimé.
- **Anti-abus**, par membre : 120 réactions (posées ou retirées) par heure ; 60 commentaires
  (publiés ou modifiés) par heure ; masquer et supprimer comptent comme des modifications du projet
  (60 par heure).
- **Suppression du compte** : ses réactions et ses réponses disparaissent ; ses commentaires racines
  qui ont des réponses deviennent « Commentaire supprimé » (texte effacé, sans auteur). Ses projets
  emportent tous leurs commentaires et réactions. L'écran de suppression le dit (« Tes réactions et
  tes commentaires »).
- **Export des données** : ses réactions (projet, type, date) et ses commentaires (projet, texte,
  dates, commentaire parent). Le projet n'est donné que par son identifiant : il appartient à un
  autre, et a pu devenir privé.

## Tranche 6a — Le pseudo

- Chaque membre a un pseudo unique (« @ines_morel »), qui servira à le mentionner (tranche 6b)
- Il le voit et le change dans « Mon profil » ; les autres le lisent sur sa page

### Précisions (tranche 6a) — validées le 19/10/2026

Décisions de Louis :
- **L'ordre de la tranche 6** : 6a le pseudo, 6b les notifications dans l'appli avec les mentions,
  6c les e-mails, le choix par type et le récap. Le push attend une appli native publiée.
- **Le pseudo est proposé, puis modifiable** : l'appli en fabrique un à partir du nom, pour les
  nouveaux comptes comme pour ceux qui existent déjà ; le formulaire d'inscription ne change pas.
- **Changer de pseudo est libre** (avec un quota), et l'ancien reste réservé 30 jours à son
  propriétaire, pour que personne ne le reprenne aussitôt.
- **Sa forme** : 3 à 20 caractères, lettres sans accent, chiffres et « _ », en commençant par une
  lettre. Facile à taper après « @ », et aucun sosie possible.
- **Où il se voit** : sur la page du membre et dans « Mon profil ». Les adresses ne changent pas
  (`/members/<id>`) : changer de pseudo ne casse aucun lien.

**Recevoir son pseudo**
- Étant donné une personne nommée « Inès Morel », qui vient de vérifier son adresse
- Alors elle a le pseudo « ines_morel » ; s'il est pris ou réservé, « ines_morel2 », puis 3…
- Et les membres déjà inscrits en reçoivent un de la même façon

**Voir un pseudo**
- Étant donné un membre connecté, sur la page d'Inès
- Alors il lit « @ines_morel » sous son nom ; Inès le lit aussi dans « Mon profil »

**Changer de pseudo**
- Étant donné Inès, dans « Mon profil »
- Quand elle remplace son pseudo par « ines » et enregistre
- Alors sa page affiche « @ines », et « ines_morel » lui reste réservé 30 jours
- Quand un autre membre essaie « ines_morel » pendant ces 30 jours
- Alors il lit « Ce pseudo est déjà pris », comme pour un pseudo en usage
- Et Inès peut reprendre « ines_morel » pendant ces 30 jours

Règles détaillées :
- **Forme** : les majuscules deviennent des minuscules et un « @ » tapé au début est retiré
  (« @Ines » devient « ines »). Ni « __ », ni « _ » à la fin (« ines__morel » imiterait
  « ines_morel »). Les mots réservés (admin, support, abuse…) sont refusés, avec le message
  « réservé », de même que tout pseudo qui contient le nom de l'appli (« support_… ») ; la
  fabrication l'enlève du nom (décision de Louis du 20/10/2026, après la relecture de sécurité).
- **Fabrication** : le nom sans accents, en minuscules ; tout le reste devient « _ » (un seul à la
  suite, aucun au début ni à la fin) ; 16 caractères au plus. Trop court, on ajoute un chiffre
  (« al1 »). S'il commence par un chiffre, ou s'il ne reste rien (nom écrit dans un autre
  alphabet) : « membre_… » ou « member_… », selon la langue du compte. Changer son nom ne change
  pas son pseudo.
- **Un compte jamais vérifié n'a pas de pseudo** : il n'en bloque donc aucun.
- **Réservation** : seul le dernier ancien pseudo est réservé ; changer deux fois libère le
  premier. Personne ne peut ainsi accaparer des pseudos. Au bout de 30 jours, il est libre.
- **Unicité** : pour un pseudo pris ou réservé par un autre, la réponse est la même (« déjà
  pris ») : elle ne dit pas lequel des deux. Garder son pseudo actuel n'est pas un changement.
- **Anti-abus**, par membre : 5 changements de pseudo par jour, en plus du quota du profil.
- **Suppression du compte** : le pseudo et l'ancien réservé sont libérés aussitôt (rien ne reste
  attaché à la personne partie). L'écran de suppression le dit.
- **Export des données** : le pseudo, et l'ancien pseudo réservé avec la date où il redevient libre.
- **Conservation** : le pseudo, jusqu'au changement ou à la suppression du compte ; l'ancien,
  30 jours.

## Tranche 6b et 6c — Notifications

Décisions de Louis (19/10/2026), pour la tranche 6b :
- **6b dans l'appli seulement** : l'écran des notifications, le nombre de nouveautés, les
  regroupements, et les mentions par pseudo. Les e-mails, le choix par type et le récap viennent
  en 6c.
- **Réactions et abonnés sans nom** : groupés par projet et par jour, avec les nombres par type
  (« 3 réactions sur « Météo » : Bravo ×2, Utile ×1 », « 2 personnes de plus te suivent »). Une
  réaction retirée disparaît aussi de la notification.
- **Un commentaire masqué** : son auteur est prévenu sobrement (« Ton commentaire sur « Météo » a
  été masqué par l'auteur du projet. Toi et l'auteur du projet le voyez encore. ») ; la
  notification disparaît si le commentaire est démasqué.

- Un membre est notifié quand on réagit à son projet, le commente, le suit ou le mentionne
- Les notifications similaires sont regroupées (« 3 personnes ont réagi à ton projet »)
- Il choisit, par type, push, e-mail ou rien ; un récap par e-mail est possible

### Précisions (tranche 6b) — validées le 20/10/2026

Décisions de Louis :
- **Un commentaire prévient l'auteur du projet et l'auteur du fil** : l'auteur du projet pour tout
  commentaire d'un autre, l'auteur d'un commentaire racine pour une réponse d'un autre dans son fil.
  Les autres participants ne sont prévenus que s'ils sont mentionnés.
- **Après « @ », les proches d'abord, puis tous** : l'auteur du projet, ceux qui l'ont commenté et
  ceux qu'on suit, puis les autres membres dont le pseudo commence ainsi.
- **Ouvrir l'écran remet le nombre à zéro.**
- **Une notification se garde 90 jours.**
- **Des notifications calculées, pas recopiées** : la liste se calcule à partir des réactions,
  abonnements, commentaires et mentions qui existent. Ce qui disparaît (réaction retirée,
  commentaire supprimé ou masqué, projet devenu privé, compte supprimé) emporte sa notification ; ce
  qui revient (démasqué, redevenu public) la ramène.

**Le nombre de nouveautés**
- Étant donné Inès, connectée, dont le projet public « Météo » vient de recevoir deux « Bravo »
- Alors une cloche montre « 1 » (un groupe), dans la barre du haut sur ordinateur, à côté de
  « Mes projets » sur téléphone ; au-delà de 9 : « 9+ » ; à zéro, pas de pastille
- Et le nombre se met à jour seul, environ chaque minute, et quand l'appli revient au premier plan

**L'écran des notifications**
- Quand Inès touche la cloche
- Alors elle lit, de la plus récente à la plus ancienne : « 2 réactions sur « Météo » : Bravo ×2 » ;
  « Malik a commenté « Météo » : « Super idée… » » ; « Malik parle de toi dans un commentaire sur
  « Météo » » ; « Malik a répondu à ton commentaire sur « Météo » » ; « 3 personnes de plus te
  suivent » ; « 2 personnes de plus suivent « Météo » »
- Et les nouvelles sont signalées ; le nombre de la cloche revient à zéro
- Quand elle touche une notification, elle arrive sur le projet (ou sur « Mon profil » pour celle du
  pseudo) ; celles des abonnés à son compte ne mènent nulle part
- Au bout : « Afficher la suite » (20 par 20), puis « C'est tout » ; sans rien : un état vide

**Mentionner**
- Étant donné Malik, qui écrit un commentaire sur le projet public « Météo »
- Quand il tape « @in »
- Alors l'appli propose au plus 5 membres, les proches d'abord (nom, pseudo, photo)
- Quand il choisit Inès, « @ines_morel » s'écrit dans le texte
- Et, publié, « @ines_morel » est un lien vers la page d'Inès, et Inès est notifiée
- Quand Inès change ensuite de pseudo, le texte de Malik garde « @ines_morel », et le lien mène
  toujours à Inès, jamais à qui reprendrait ce pseudo

**Masquer**
- Étant donné l'auteur de « Météo », qui masque le commentaire de Malik
- Alors Malik lit « Ton commentaire sur « Météo » a été masqué par l'auteur du projet. Toi et
  l'auteur du projet le voyez encore. » ; s'il est démasqué, la notification disparaît
- Et les membres mentionnés dans ce commentaire ne le voient plus, ni sa notification

**Le pseudo**
- Étant donné un membre qui reçoit son pseudo (nouveau compte vérifié, ou membre déjà inscrit)
- Alors sa première notification dit « Ton pseudo est @ines_morel, tiré de ton nom. Tu peux le
  changer dans Mon profil. »

Règles détaillées :
- **Regroupements** : les réactions, par projet et par jour (heure de Paris), avec les nombres par
  type, sans aucun nom ; les abonnés à un projet, par projet et par jour ; les abonnés au compte,
  par jour ; sans nom. Une réaction ou un abonnement retiré sort du nombre ; à zéro, le groupe
  disparaît. Un groupe qui grandit après avoir été vu redevient nouveau et remonte en tête.
- **Commentaires** : un par notification, avec le nom de l'auteur (déjà visible sous le
  commentaire) et un extrait de son texte actuel (80 caractères). Une seule notification par
  commentaire et par personne : mention, sinon réponse, sinon commentaire. Supprimé, ou masqué pour
  elle : la notification disparaît.
- **Mentions** : dans les commentaires seulement (ni notes ni descriptions). Un pseudo en usage
  seulement (pas un ancien réservé), majuscules acceptées ; 5 membres au plus par commentaire
  (au-delà, du texte simple) ; se mentionner soi-même ne notifie pas. Une modification qui ajoute
  une mention prévient la personne ajoutée ; qui en retire une retire la notification. La mention
  est gardée par l'identifiant du membre, trouvé au moment de l'écriture ; compte supprimé : du
  texte simple. **Une mention ne notifie que qui peut lire le commentaire** : sur un projet privé,
  personne ; commentaire masqué, seulement l'auteur du projet.
- **Suggestions** : à partir de 2 caractères après « @ », sur le pseudo seulement ; 5 au plus ;
  seulement des comptes vérifiés, sur un projet qu'on voit. Anti-abus : 600 recherches par heure
  et par membre.
- **Nouveau** : ouvrir l'écran marque comme vu tout ce qui existait à l'ouverture.
- **Droits** : sans session, « connecte-toi » ; chacun ne lit que ses notifications. Rien ne vient
  de ses propres gestes ; un projet privé ne produit aucune notification venant des autres (ils n'y
  voient rien, et leurs gestes passés y sont cachés).
- **Conservation** : 90 jours, puis plus rien n'est montré. Rien n'est recopié : on ne garde que la
  date « vu jusqu'à » et les mentions (avec leur commentaire).
- **Suppression du compte** : ses mentions et son état de lecture disparaissent ; ses gestes
  disparaissent des notifications des autres. L'écran de suppression le dit (« Tes notifications »).
- **Export des données** : la date « vu jusqu'à », et pour chacun de ses commentaires les
  identifiants des membres qu'il y mentionne.

### Précisions (tranche 6c) — validées le 20/10/2026

Décisions de Louis (20/10/2026) :
- **Ne pas encombrer les boîtes e-mail des membres** : une seule sorte d'e-mail par défaut, le récap
  de la semaine ; tout le reste est à demander.
- **E-mail seulement** : le push attend l'appli native (une tranche à part).
- **Désinscription sans connexion, confirmée par un bouton**, depuis chaque e-mail : ouvrir le lien
  ne change rien (un antivirus qui ouvre les liens ne désinscrit personne).
- **Ordonnanceur : pg-boss** (une file de tâches rangée dans PostgreSQL).
- Ajoutés à la tranche : les purges de nuit (conformité n°4), un lien « Se connecter » à côté de
  « session expirée », l'élision « d'Inès ».

**Les réglages** (dans « Mon profil », section « E-mails »)
- Deux choix seulement :
  - « Le récap de la semaine » : activé par défaut ;
  - « Un e-mail quand on me mentionne ou me répond » : désactivé par défaut.
- Chaque choix s'enregistre aussitôt.

**Le récap**
- Étant donné Inès, qui n'a pas ouvert ses notifications depuis lundi dernier
- Quand arrive le lundi à 9 h (heure de Paris)
- Alors elle reçoit un seul e-mail, « Du nouveau sur Waiggle » : ses commentaires, réponses et
  mentions non vus, puis une ligne de nombres (« et 5 réactions, 2 nouveaux abonnés »), au plus
  5 lignes, et un lien vers ses notifications
- Mais si elle a tout vu dans l'appli, ou s'il n'y a rien, aucun e-mail
- Et après 3 récaps sans aucune visite, on n'en envoie plus jusqu'à son retour (le 3e le dit)

**L'e-mail de mention ou de réponse** (seulement si Inès l'a activé)
- Quand Malik la mentionne ou lui répond
- Alors, 15 minutes plus tard, un e-mail court la prévient (avec l'extrait), regroupant tout ce qui
  est arrivé entre-temps
- Mais rien ne part si elle a ouvert ses notifications entre-temps, ou si le commentaire a disparu
  pour elle ; au plus un e-mail par heure

**Se désinscrire**
- Étant donné Inès, qui touche « Ne plus recevoir le récap de la semaine » au bas d'un récap
- Alors une page, sans connexion, demande « Ne plus recevoir le récap de la semaine ? », avec
  « Confirmer » et « Garder mes e-mails » ; rien ne change avant « Confirmer »
- Quand elle confirme, la page le dit, propose « Tout couper » (les e-mails de compte, eux,
  continuent) et mène aux réglages ; elle ne montre ni son nom ni son adresse
- Et sa messagerie propose aussi « Se désabonner » (en-tête List-Unsubscribe), avec sa propre
  confirmation

Règles détaillées :
- Seulement un compte vérifié, dans sa langue ; les e-mails de compte ne changent pas.
- Ce qui part se calcule au moment de l'envoi, comme l'écran des notifications (droits, masquage,
  projet privé) ; un même événement ne part jamais deux fois par e-mail.
- Ni pixel, ni lien réécrit ; le lien de désinscription est signé et ne donne accès à rien d'autre.
- Purges de nuit : sessions expirées, jetons de vérification, compteurs anti-abus périmés,
  historique de pg-boss au-delà de 7 jours, et les inscriptions jamais vérifiées au bout de
  30 jours (la page « vérifie ton e-mail » le dit).
- Le récap ne montre pas le texte des commentaires des autres ; seul l'e-mail de mentions, que le
  membre active lui-même, en donne un extrait. Aucun lien écrit par un membre n'est cliquable dans
  un e-mail. Chaque e-mail dit pourquoi on le reçoit, et le premier récap l'explique.
- Après une restauration de sauvegarde, les envois restent coupés tant que les refus faits
  depuis (suppressions, désinscriptions) ne sont pas réappliqués.
- Export et suppression du compte : les deux réglages et les dates « envoyé jusqu'à ».

## Tranche 7a — Signaler

- Tout membre peut signaler un projet, une note, un commentaire (ou une réponse) ou un profil,
  avec un motif
- Le signalement arrive dans la file de l'administration, qui peut retirer le contenu ou classer
  le signalement ; chaque décision est tracée (qui, quand, pourquoi)

### Précisions (tranche 7a) — validées le 22/10/2026

Décisions de Louis (22/10/2026) :
- **7a est la première partie de la tranche 7** : signaler, et traiter un signalement. Bloquer un
  membre et suspendre un compte viennent après.
- **Qui administre** : un rôle « administrateur », posé ou retiré par un script du dépôt
  (`infra/`), jamais depuis l'appli. Louis seul au départ.
- **Deux actions sur un signalement** : retirer le contenu, ou classer sans suite. Un profil
  signalé va dans la file, mais les actions sur un compte (suspendre, retirer la photo ou le
  pseudo) viennent avec la suspension.
- **Qui est prévenu** : l'administrateur par un e-mail, au plus un par heure ; l'auteur d'un
  contenu retiré, par une notification avec l'explication ; la personne qui a signalé, par une
  notification quand c'est traité. L'auteur d'un contenu ne sait jamais qui l'a signalé ; seule la
  modération le voit, pour éviter les abus.
- **Une adresse de contact** (`contact@waiggle.com`), affichée dans « Mon compte » et dans le pied
  des e-mails. La boîte est créée par Louis avant le déploiement.

**Signaler**
- Étant donné Malik, connecté, sur le projet « Météo » d'Inès
- Quand il choisit « Signaler » dans le menu du projet, un motif, et envoie
- Alors il lit « Merci, ton signalement a été envoyé. La modération va le regarder. »
- Et le projet reste affiché pour tout le monde tant que rien n'est décidé
- Et Inès n'est pas prévenue du signalement
- Même chose pour une note du journal, un commentaire, une réponse, ou la page d'un membre

**Traiter un signalement** (l'administrateur)
- Étant donné Louis, administrateur, qui ouvre « Modération » depuis « Mon compte »
- Alors il voit les signalements en attente, du plus ancien au plus récent : le contenu tel qu'il
  était au moment du signalement, un lien vers lui, le motif, le nombre de signalements reçus
  pour ce contenu, la date
- Quand il choisit « Retirer », avec le fondement (la loi ou les règles de l'appli) et une phrase
  d'explication
- Alors le contenu disparaît pour les autres membres, et son auteur est prévenu, avec
  l'explication
- Et la personne qui a signalé est prévenue que son signalement a été traité
- Quand il choisit « Classer sans suite »
- Alors le contenu reste, le signalement quitte la file, et la personne qui a signalé est prévenue
- Et chaque décision est gardée : qui, quand, quelle action, quelle explication

**Un contenu retiré**
- Un projet retiré n'apparaît plus nulle part pour les autres (comme un projet privé) ; son
  auteur le voit encore, avec « Retiré par la modération » et l'explication
- Une note retirée disparaît pour les autres ; son auteur la voit encore, avec « Retiré par la
  modération » et l’explication
- Un commentaire ou une réponse retirés deviennent « Contenu retiré par la modération » pour les
  autres, comme un commentaire supprimé ; les réponses restent ; son auteur le voit encore, avec
  l’explication
- L'administrateur peut le rétablir ; la décision est tracée de la même façon

Règles détaillées :
- **Motifs** : contenu illégal ; harcèlement ou haine ; contenu sexuel ou violent ; arnaque ou
  spam ; usurpation d'identité ; une photo ou une information sur moi sans mon accord ; autre. Une précision libre facultative, 500 caractères au plus.
- **Qui peut signaler quoi** : un membre connecté, un contenu qu'il voit, jamais le sien. Un seul
  signalement par membre et par contenu ; le refaire répond « déjà signalé ».
- **Anti-abus** : 20 signalements par membre et par jour.
- **Seul un administrateur** voit la file, les signalements et les décisions ; pour tout autre
  membre, ces routes répondent comme si elles n'existaient pas.
- **Un contenu supprimé par son auteur** pendant l'attente : le signalement est classé tout seul.
- **Le texte signalé** est copié dans le signalement au moment de l'envoi, pour que l'auteur ne
  puisse pas le changer avant la décision.
- **Suppression du compte** : les signalements faits par la personne partie restent, sans son
  nom, jusqu'à un an après leur traitement ; ceux qui visent ses contenus encore ouverts deviennent
  « sans objet » (gardés 30 jours), et ceux qui ont mené à un retrait restent un an.
- **Export des données** : les signalements que le membre a faits (contenu visé, motif, date,
  décision) ; jamais ceux qui le visent.
- **Un administrateur ne décide pas de ce qui le concerne** : un signalement de son propre contenu
  ou de son profil attend un autre administrateur.
- **Conservation** : les signalements clos et les décisions, un an ; les signalements d'un compte
  supprimé encore ouverts, 30 jours (à faire valider par un professionnel).
- **Procédure de retrait** dans `docs/ops/` : comment l'éditeur retire un contenu signalé hors de
  l'appli (par exemple par e-mail à l'adresse de contact), et le rôle d'administrateur.

## Tranche 7 — Sécurité et modération

**Signaler** : fait en tranche 7a (signaler, retirer ou classer, décisions tracées).

**Bloquer** : tranche 7b, ci-dessous.

## Tranche 7b — Bloquer

- Un membre peut en bloquer un autre : ils ne voient plus leurs contenus respectifs et ne peuvent
  plus interagir

### Précisions (tranche 7b) — validées le 24/10/2026

Décisions de Louis (24/10/2026) :
- **Toutes les entrées d'un membre sont modérées**, après coup : chacune peut être signalée, et
  sera retirable par l'administrateur (le retrait d'une partie d'un profil ou d'un projet vient en
  7c, avec la suspension). Jamais de retrait automatique. Plus tard, dans une tranche à part : des
  filtres qui remontent un doute à l'administrateur, qui valide ou non ; peut-être une aide par IA.
- **Pas un bouton par champ** : une seule entrée « Signaler » par objet, dans son menu ; le détail
  (une photo, la bio…) se choisira sur la page « Signaler » (7c). « Bloquer » vit dans le menu de
  la page d'un membre, et la confirmation d'un signalement propose aussi de bloquer.
- **Le blocage cache dans les deux sens**, et la personne bloquée n'est pas prévenue.

**Bloquer**
- Étant donné Malik, connecté, sur la page d'Inès
- Quand il choisit « Bloquer » dans le menu, lit ce qui va changer, et confirme
- Alors Malik et Inès ne voient plus les contenus l'un de l'autre : projets, notes, commentaires,
  mentions ; Malik voit encore l'en-tête de la page d'Inès (nom, pseudo, photo), avec « Tu as
  bloqué @ines », pour la débloquer ou signaler son profil
- Et leurs abonnements réciproques sont retirés ; ils ne reviennent pas au déblocage
- Et Inès n'est pas prévenue : pour elle, la page de Malik répond comme si elle n'existait pas

**Après un signalement**
- Étant donné Malik qui vient de signaler un commentaire d'Inès
- Alors la confirmation lui propose aussi de bloquer Inès

**Débloquer**
- Étant donné Malik qui ouvre « Membres bloqués » depuis « Mon compte »
- Quand il choisit « Débloquer » pour Inès
- Alors tout réapparaît de part et d'autre, sauf les abonnements

Règles détaillées :
- **Commentaires déjà écrits** : dans un fil, le commentaire de l'autre est remplacé pour les deux
  personnes seulement (« Commentaire d'un membre que tu as bloqué » pour qui a bloqué,
  « Commentaire indisponible » pour l'autre ; « Commentaire masqué » reste réservé au geste de
  l'auteur du projet) ; les autres membres le voient toujours, et les réponses restent. Chacun
  peut toujours supprimer ses propres commentaires et retirer ses réactions.
- **Plus d'interaction** : ni commenter, ni répondre, ni réagir, ni suivre, chez l'autre.
- **Les réactions déjà données** restent dans les compteurs, qui ne montrent jamais de nom.
- **Mentions** : chacun disparaît des suggestions de l'autre après « @ » ; une mention tapée à la
  main ne prévient pas.
- **Notifications et e-mails** : ceux qui viennent de l'autre (mention, commentaire, réponse,
  abonnement, récap du lundi) disparaissent ; les anciennes peuvent réapparaître au déblocage. Une
  notification de modération (retrait, signalement traité) n'est jamais coupée par un blocage.
- **La modération voit tout**, blocage ou non ; bloquer ne prévient pas la modération : le dialogue
  conseille de signaler d'abord. Un blocage ne sert qu'à cacher : ni compteur, ni signal de
  modération ; débloquer efface la ligne.
- **Anti-abus** : 100 blocages par membre et par jour.
- **Export des données** : les membres que j'ai bloqués (pseudo, date) ; jamais qui m'a bloqué.
- **Conservation** : un blocage est gardé jusqu'au déblocage ou à la suppression d'un des deux
  comptes.
- **Registre des entrées** : chaque champ qu'un membre saisit (nom, pseudo, bio, outils, photo ;
  titre, pitch, description, prompts, outils, lien de démo, photos, couverture d'un projet ;
  notes ; commentaires) est inscrit à un registre ; un test échoue si un champ n'y est pas couvert
  par le signalement, le blocage et l'export (le retrait s'y ajoute en 7c).
- **Copie complète au signalement** : le texte gardé au moment du signalement comprend tous les
  textes de la cible (pour un projet : aussi description, prompts, outils, lien de démo ; pour un
  profil : aussi les outils), pas seulement le titre et le pitch. La copie des images est à peser
  avec la relecture juridique (garder la preuve, ou ne pas garder une image peut-être illégale).

**Administrer**
- Un administrateur voit la file des signalements, peut masquer un contenu, suspendre un compte et
  consulter l'historique de ces actions
