// Textes français : la langue de référence. Toute nouvelle clé s'ajoute d'abord ici.
// {{appName}} est remplacé au moment de l'affichage par le nom de l'appli (défini dans @ruche/brand).
// On ne l'écrit jamais en toutes lettres ici : un test le vérifie, pour qu'un changement de nom se
// fasse en une seule ligne.
// `as const` en bas du fichier fige les valeurs pour que TypeScript en déduise la forme exacte.
// Ton : on tutoie, comme entre proches.
// Typographie française : une espace insécable fine (U+202F) avant « ? », « ! » et « ; », une espace
// insécable (U+00A0) avant « : » et à l'intérieur des guillemets, et l'apostrophe typographique (’).
// Ces espaces sont invisibles ici, mais elles empêchent un « ? » ou un « » » de se retrouver seul en
// début de ligne. Un test (src/typography.test.ts) vérifie qu'aucun texte ne les oublie.
export const fr = {
  common: {
    language: 'Langue',
    languages: {
      fr: 'Français',
      en: 'English',
    },
    loading: 'Chargement…',
    crashed: 'Cette page n’a pas pu s’afficher.',
    retry: 'Réessayer',
    /** R12b : la pastille d’un projet ou d’un compte d’exemples (fictifs). */
    example: 'Exemple',
    back: 'Retour',
    cancel: 'Annuler',
    /** Le bouton qui ferme une feuille ou une fenêtre (R2). */
    close: 'Fermer',
    /** Ce que les lecteurs d'écran ajoutent après le nom d'un lien qui quitte l'appli (R2). */
    externalSite: 'ouvre un site externe',
    remove: 'Retirer {{item}}',
    showPassword: 'Afficher le mot de passe',
    hidePassword: 'Masquer le mot de passe',
    /** Le titre de l'écran de secours, au-dessus de « Cette page n’a pas pu s’afficher. ». */
    crashedTitle: 'Un problème est survenu',
    /** Le nom du logo animé pendant le lancement de l'appli (lu par les lecteurs d'écran). */
    loadingApp: '{{appName}} se lance…',
    /** La fenêtre qui protège une feuille d'administration modifiée (R6b, ui-C1). */
    discardTitle: 'Abandonner les changements ?',
    discardBody: 'Ce que tu as écrit dans cette feuille sera perdu.',
    keepEditing: 'Continuer',
    discard: 'Abandonner',
  },
  /** Les signes de la marque, tels que les lecteurs d'écran les lisent. */
  brand: {
    logoAlt: 'Logo de {{appName}}',
  },
  /** La mascotte, une pose par texte de remplacement (quand elle n'est pas décorative). */
  mascot: {
    search: 'L’abeille de {{appName}} cherche avec une loupe',
    wave: 'L’abeille de {{appName}} fait coucou',
    fly: 'L’abeille de {{appName}} s’envole',
    sleep: 'L’abeille de {{appName}} dort',
  },
  home: {
    title: 'Bienvenue sur {{appName}}',
    tagline: 'Montre à tes proches ce que tu construis avec l’IA.',
    signUp: 'Créer un compte',
    signIn: 'Me connecter',
    haveAccount: 'J’ai déjà un compte',
    publish: 'Publier un projet',
    // R12 (A14) : la phrase de l'accueil, de la feuille « Compte requis » et du cadenas de la
    // connexion et de l'inscription. La clé garde son nom d'avant R12, lu par les écrans et leurs
    // tests ; l'ancienne phrase (« Les projets et les profils ne se voient qu’avec un compte. ») est
    // devenue fausse.
    membersOnly: 'Rien n’est public sans ton accord.',
    // R12 (Q9, Q10) : la vitrine de l'accueil, choisie par la modération parmi les projets publics.
    showcase: 'Des projets à voir',
    showcaseNote: 'Ces projets sont publics : leurs auteurs l’ont choisi.',
  },
  // R12 : ce que voit un visiteur sans compte sur un projet ou une page publique (planches
  // R12-Visiteur-*). Jamais les commentaires, ni qui a réagi, ni qui suit.
  visitor: {
    signIn: 'Se connecter',
    signUp: 'Créer un compte',
    // À la place des commentaires : ni leur nombre, ni un extrait (A14).
    commentsMembersOnly: 'Les commentaires sont réservés aux membres.',
    reactions_one: '{{count}} réaction de membre',
    reactions_other: '{{count}} réactions de membres',
    // Le bouton à côté du nombre de réactions : il ouvre la feuille « Compte requis ».
    react: 'Réagir',
    // La page publique d'un membre sans projet public à montrer.
    noProjects: 'Pas encore de projet public.',
    // La feuille « Compte requis » (planche R12-Compte-Requis) : le titre suffit (Q11), puis la
    // limite (Q12) ; « Rien n’est public sans ton accord. » est home.membersOnly. Les deux autres
    // pastilles reprennent project.reactions.bravo et project.comments.addShort.
    accountRequired: {
      title: 'Pour réagir, crée ton compte',
      follow: 'Suivre ses mises à jour',
      inviteOnly: '{{appName}} s’ouvre sur invitation.',
    },
  },
  // R11 : les quatre pages publiques (/rules, /privacy, /legal, /accessibility), lisibles sans compte.
  // Chaque page a un titre, un « En bref » (des puces courtes : `summary`, l'icône de chaque puce est
  // choisie par l'appli), puis « Le texte complet », une partie par clé de `sections`, dans l'ordre
  // du fichier. Le corps d'une partie est du Markdown simple : paragraphes, listes, gras, et liens
  // https seulement (jamais de lien interne ni de `mailto:` : relecture du plan, U2).
  // Les coordonnées de l'éditeur et de l'hébergeur ne s'écrivent jamais ici : ce sont des paramètres
  // ({{publisher}}, {{siren}}…), remplis depuis `packages/brand/src/legal.ts`. L'adresse du code
  // source aussi ({{sourceUrl}}) : elle contient le nom de l'appli.
  // Aucun de ces textes n'est encore validé par un professionnel (Louis, 28/10 et 15/11/2026).
  legal: {
    /** La date de version, en haut de chaque page ({{date}} : la date courte, à l'heure de Paris). */
    version: 'Version du {{date}}',
    summaryTitle: 'En bref',
    // Option 1 des planches R11 : « qui fait foi » est dit dans le titre lui-même.
    fullTextTitle: 'Le texte complet, qui fait foi',
    /** Sur ordinateur, la navigation à côté du texte. */
    contents: 'Sommaire',
    // Le pied des quatre pages, de l'accueil des visiteurs et de la connexion ; les lignes
    // « À propos » des réglages (planche R11-Pied).
    links: {
      /** Le nom lu de la navigation du pied. */
      label: 'Les pages de {{appName}}',
      rules: 'Règles',
      privacy: 'Confidentialité',
      legal: 'Mentions légales',
      accessibility: 'Accessibilité',
      sourceCode: 'Le code source',
      // R12 (planche R12-Visiteur-Desktop) : le pied de l'accueil, qui mène à l'adresse de contact.
      report: 'Signaler un contenu',
      /** Le nom lu du lien de contact (l'adresse seule est affichée). */
      contact: 'Nous écrire : {{contactEmail}}',
    },
    pages: {
      rules: {
        title: 'Les règles de {{appName}}',
        // Une seule source pour /rules et l'écran « Accepter » (U2). R12 (projets publics) : la
        // puce `public`, la partie `visitors`, et les phrases de la relecture juridique du plan.
        summary: {
          respect:
            'Respecte les autres membres : ni harcèlement, ni haine, ni contenu sexuel ou violent.',
          account:
            'À partir de 15 ans, un seul compte par personne. Ne te fais passer pour personne.',
          consent: 'Ne publie une photo ou une information sur quelqu’un qu’avec son accord.',
          links:
            'Tes démos vivent sur d’autres sites : aucune arnaque, aucun virus, aucun hameçonnage derrière tes liens.',
          report:
            'Un contenu te gêne ? Signale-le. La modération le lit, et peut le retirer ou suspendre un compte.',
          // J3 (relecture du plan) : les comptes inactifs dès l'« En bref ».
          inactive:
            'Un compte sans visite pendant 3 ans est supprimé, après un e‑mail envoyé un mois avant.',
          yours: 'Ce que tu publies reste à toi. Tu peux tout télécharger ou tout supprimer.',
          public: 'Rien n’est public sans ton accord.',
        },
        sections: {
          purpose: {
            title: 'À quoi sert {{appName}}',
            body: '{{appName}} permet à des proches de montrer les projets qu’ils construisent avec l’IA, de les essayer et de s’encourager.\n\n{{appName}} n’héberge aucun programme : chaque projet renvoie vers une démo sur un autre site, dont {{appName}} ne vérifie ni le contenu ni qui le gère.',
          },
          account: {
            title: 'Ton compte',
            body: 'On entre sur {{appName}} par invitation, à partir de 15 ans. Un parent n’ouvre pas de compte pour un enfant de moins de 15 ans.\n\nChacun a un seul compte, personnel : garde ton mot de passe pour toi, et ne te fais passer pour personne, ni par ton nom ni par ton pseudo.\n\nLes membres connectés te trouvent par ton nom affiché et ton pseudo. Aucun membre ne voit ton adresse e‑mail.\n\nUn compte sans visite pendant 3 ans est supprimé. Un e‑mail te prévient un mois avant : te connecter suffit à le garder.',
          },
          content: {
            title: 'Ce que tu publies',
            body: 'Ce que tu publies reste à toi. Tu autorises {{appName}} à l’afficher aux personnes que tu choisis : tous les membres connectés, les membres d’une ruche, toi seul quand le projet est privé, ou tout le monde, moteurs de recherche compris, quand il est public.\n\nUn prompt publié peut être copié et réutilisé par les personnes qui le voient.\n\nRevenir en arrière, ou supprimer, ne retire pas les copies déjà faites ailleurs : moteurs de recherche, captures, messageries.\n\nUne photo ou une information sur quelqu’un, seulement avec son accord ; pour un projet public, son accord d’être vu de tous. Tes captures ne montrent pas les données d’autres personnes.\n\nLes réactions et les abonnés se comptent : personne ne voit qui a réagi ni qui suit qui.',
          },
          // R12 : ce qu'une personne sans compte voit d'un projet public et d'une page publique.
          visitors: {
            title: 'Ce que voit un visiteur',
            body: 'Sans compte, on voit :\n\n- **un projet public** : tout ce que son auteur a écrit (textes, photos, outils, prompt, mises à jour), son nom et sa photo, le nombre de réactions ;\n- **une page publique** : le nom, la photo, et ce que la personne a choisi d’y montrer.\n\nJamais les commentaires, qui a réagi, les abonnés, les ruches, les testeurs, le pseudo, ni un projet qui n’est pas public. Réagir, commenter et suivre demandent un compte.',
          },
          forbidden: {
            title: 'Ce qui est interdit',
            body: '- Le harcèlement, y compris par des mentions ou des invitations répétées.\n- La haine, contre une personne ou un groupe.\n- Un contenu sexuel ou violent.\n- Un contenu illégal.\n- Une arnaque, un virus ou un hameçonnage derrière un lien.\n- Se faire passer pour quelqu’un, par son nom ou son pseudo.\n- Nommer une personne qui n’est pas membre sans son accord.\n- Un nom de ruche insultant, ou qui révèle la santé, les opinions, la religion, l’origine ou la vie sexuelle de quelqu’un.',
          },
          hives: {
            title: 'Les ruches',
            body: 'Une ruche est un groupe de proches, de 50 membres au plus, invitations comprises. On y entre seulement par invitation ; refuser ne prévient personne, et on la quitte quand on veut.\n\nSes membres se voient entre eux et voient les projets réservés à la ruche. Les autres membres de {{appName}} ne voient ni ses membres ni ces projets.\n\nL’animateur épingle un projet, choisit qui peut inviter et peut retirer un membre.\n\nLes nouveautés de tes ruches arrivent aussi dans ton récap du dimanche.',
          },
          testers: {
            title: 'Les testeurs',
            body: 'L’auteur d’un projet peut accueillir des testeurs. Le coin des testeurs est privé : chaque fil reste entre l’auteur et un testeur. Un appel de l’auteur est lu par tous ses testeurs, même ceux qui arrivent plus tard.\n\nOn ne cite pas un retour et on ne nomme pas un testeur sans son accord.',
          },
          // Choix 9 du scénario : les critères quittent les écrans pour cette partie (DSA art. 27,
          // à faire valider). Ce sont les phrases retirées par « Moins de mots ».
          feed: {
            title: 'Le fil, Explorer, les suggestions et la recherche',
            body: 'Le fil, Explorer, les suggestions et la recherche ne dépendent ni de la popularité d’un membre ni d’une publicité.\n\n- **Le fil, « Suivis »** : les nouveaux projets des personnes que tu suis, et les mises à jour de leurs projets et des projets que tu suis. Chaque projet n’y paraît qu’une fois, à son dernier événement, du plus récent au plus ancien.\n- **Le fil, une ruche** : les nouveaux projets et les mises à jour des membres de cette ruche, dans le même ordre.\n- **Explorer** : les projets de tous les membres. « Récents » montre les derniers projets publiés, du plus récent au plus ancien, et se filtre par catégorie ; « Ils cherchent des testeurs », les projets ouverts aux testeurs ; « Outils populaires », les outils cités par le plus de projets.\n- **Les outils** : le catalogue des outils d’IA, de développement et de projets numériques, décrits par {{appName}} sans lien avec leurs éditeurs, et les projets des membres qui s’en servent.\n- **Proches à suivre** : les membres de tes ruches d’abord, puis les membres qui ont publié récemment, selon la date de leur dernier projet. Jamais quelqu’un que tu suis, que tu as écarté ou bloqué, ni un membre qui a choisi « Ne pas me proposer aux autres ».\n- **La recherche** : les projets, les membres et les outils qui contiennent chaque mot tapé, sans tenir compte des accents. Les projets dont le titre contient le mot passent d’abord. En dessous de 3 lettres, seuls les membres que tu suis sont trouvés. Ce que tu cherches n’est pas gardé.\n- **Le classement de la semaine** : le pollen gagné depuis lundi par toi et les membres que tu suis, ou par les membres d’une de tes ruches, du plus au moins. Il compte tes gestes et ce que tes projets reçoivent, sauf tes réactions et tes abonnements. Seuls ceux qui en ont gagné y figurent ; tout repart lundi. Le pollen et le miel n’ont aucune valeur hors de {{appName}} : ils ne s’achètent pas et ne se vendent pas.\n- **La vitrine de l’accueil et « À la une » d’Explorer** : jusqu’à 4 projets publics, choisis par l’éditeur, sans contrepartie. L’auteur est prévenu et peut en retirer son projet, qui n’y revient pas.\n\nTu peux régler ce que tu vois : suivre ou ne plus suivre, écarter une suggestion, bloquer un membre. Et ce que les autres voient de toi : « Ne pas me proposer aux autres » et « Apparaître dans les classements », dans tes réglages.',
          },
          moderation: {
            title: 'La modération',
            body: 'Tout membre peut signaler un contenu ou un profil, et toute personne, même sans compte, un contenu public. Les signalements sont lus par la modération, les administrateurs de {{appName}}, aidés de l’assistant de code (voir la Confidentialité). Elle ne dit jamais qui a signalé.\n\nDu plus léger au plus lourd, la modération peut :\n\n- retirer une partie d’un contenu (une photo, un titre…) ;\n- retirer tout le contenu ;\n- suspendre un compte pour un temps, ou sans fin.\n\nChaque décision est motivée : la personne visée reçoit les faits et la règle ou la loi appliquée. Une suspension est aussi annoncée par e‑mail. Pendant une suspension, on peut tout lire, retirer ses contenus, exporter ses données ou supprimer son compte, mais plus publier.\n\nPas d’accord avec une décision ? Écris à {{contactEmail}} : une personne la relira et te répondra. Tu peux aussi saisir la justice.',
          },
          authors: {
            title: 'Ce que peut l’auteur d’un projet',
            body: 'L’auteur d’un projet peut masquer un commentaire sur son projet : il ne reste visible que de lui et de la personne qui l’a écrit. Il n’y a pas encore de recours contre ce geste.\n\nSi le projet devient privé ou est retiré par la modération, ses commentaires sont gardés sans être lus par les autres membres. S’il est supprimé, ils partent avec lui. Tu peux toujours supprimer tes commentaires depuis « Mes commentaires », dans tes réglages.',
          },
          leaving: {
            title: 'Quitter {{appName}}',
            body: 'Tu peux à tout moment télécharger tes données, puis supprimer ton compte, depuis tes réglages. La suppression est immédiate et sans retour.\n\nCe qui reste chez les autres :\n\n- les réponses à tes commentaires, sous « Commentaire supprimé », sans ton texte ni ton nom ;\n- le nom des ruches que tu as créées, tant qu’elles ont des membres, et les invitations que tu as envoyées, sans ton nom ;\n- tes signalements, sans ton nom, jusqu’à un an après leur traitement ;\n- ce que les membres ont déjà copié, comme un prompt, et les e‑mails qu’ils ont déjà reçus ;\n- ce que les moteurs de recherche ont copié de tes projets et de ta page publics, le temps qu’ils les relisent.',
          },
          changes: {
            title: 'Les changements des règles',
            body: 'Une nouvelle version des règles porte une nouvelle date. Tu la lis et tu l’acceptes à ta visite suivante, avec ce qui change en tête. D’ici là, seul l’écran d’accord s’ouvre : tu peux y télécharger tes données, retirer tes commentaires et tes retours de testeur, supprimer ton compte ou te déconnecter.\n\nUne correction de forme, comme une faute ou un lien, ne change pas la version.',
          },
          liability: {
            title: 'Responsabilité, droit et contact',
            body: '{{appName}} est fourni tel quel, sans garantie qu’il soit toujours disponible. Chaque membre répond de ce qu’il publie ; {{appName}} ne répond pas des sites des démos. Un contenu illicite signalé est retiré dès que la modération le constate.\n\nCes règles relèvent du droit français. Un désaccord ? Écris-nous d’abord à {{contactEmail}} ; tu peux aussi saisir la justice.\n\nPour toute question : {{contactEmail}}, en français ou en anglais.',
          },
        },
      },
      privacy: {
        title: 'Confidentialité',
        summary: {
          noAds: 'Ni publicité, ni cookie de mesure.',
          email: 'Aucun membre ne voit ton adresse e‑mail.',
          // Option 2 des planches R11 : l'assistant de code dès l'« En bref ». R12 (relecture juridique
          // du plan, point 2) : un projet public se lit de partout, et les moteurs le copient hors UE.
          where:
            'Le serveur et les e‑mails sont à Paris. Hors de l’Union européenne, l’assistant de code peut lire des extraits ; ce que tu rends public se lit partout.',
          control: 'Tu peux tout télécharger ou tout supprimer.',
        },
        sections: {
          controller: {
            title: 'Qui est responsable',
            body: 'L’éditeur, présenté dans les Mentions légales, est responsable de tes données. Pour lui écrire : {{contactEmail}}, en français ou en anglais.',
          },
          // Relecture juridique complète du 15/11/2026 (inventaire A1 à A4). Les bases sont
          // « probables » : à faire valider par un professionnel.
          data: {
            title: 'Ce qui est gardé, et pourquoi',
            body: 'Sauf mention contraire, la base est le contrat : les règles que tu acceptes pour utiliser {{appName}}.\n\n- **Ton compte** : ton nom affiché, ton adresse e‑mail, ta langue, ton mot de passe (seulement son empreinte, jamais le mot de passe lui-même). Pour te connecter et t’écrire. Les membres connectés voient ton nom ; tout le monde, sur tes projets et ta page publics. Personne ne voit ton adresse.\n- **Ton profil** : ton pseudo, ta bio, ta photo et tes outils favoris. Vus des membres connectés. Ta page publique, de tout le monde, avec ce que tu y coches ; ton nom et ta photo accompagnent aussi tes projets publics. La photo est recadrée et nettoyée de ses informations cachées.\n- **Tes projets et leurs mises à jour** : textes, prompts, photos, liens des démos, catégories. Vus des personnes que tu choisis : tous les membres connectés, une ruche, toi seul, ou tout le monde quand il est public.\n- **Ce qui est public** : un projet ou une page publics sont lus et copiés par les moteurs de recherche, y compris ceux des assistants d’IA, qui peuvent les citer ou les résumer. Après un retour en arrière, ils les montrent jusqu’à leur prochain passage ; tu peux aussi leur demander de retirer leur copie. {{appName}} demande aux robots qui collectent pour entraîner des IA de ne pas lire le site ; certains ne respectent pas cette demande. Base : ton choix, que tu peux retirer à tout moment.\n- **Les réactions et les abonnements** : qui réagit ou suit quoi. Les autres ne voient que des nombres.\n- **Les commentaires et les mentions** : le texte, la date, qui est mentionné. Vus de ceux qui voient le projet ; la mention, de la personne mentionnée.\n- **Le fil et les suggestions** : la date de ta dernière lecture du fil, les suggestions que tu as écartées, ton choix « Ne pas me proposer aux autres ». Vus de toi seul.\n- **La recherche** : rien n’est gardé de ce que tu cherches.\n- **Les testeurs** : ton inscription comme testeur, tes retours, tes messages et leurs captures. Vus de l’auteur du projet et de toi ; dans les commentaires du projet, un badge « Testeur » s’affiche à côté de ton nom. Un message signalé, et sa capture, est lu par la modération, jamais le reste du fil.\n- **Les ruches** : les ruches dont tu fais partie, qui t’a invité, les invitations. Vues des membres de chaque ruche.\n- **Ta récolte** : le pollen de chacun de tes gestes (le geste, la date, la chose concernée), ton niveau, ton titre, tes sceaux, ton miel, tes défis et tes réglages. Pour compter tes encouragements et te les montrer. La ligne d’un geste reste quand tu le retires, pour ne pas le compter deux fois ; un contenu retiré par la modération perd son pollen. Ton niveau, ton titre, ton rayon et tes sceaux sont vus des membres connectés ; ton miel, tes défis et tes réglages, de toi seul. Ton pollen de la semaine, sans tes réactions ni tes abonnements, est vu des membres qui te suivent et des membres de tes ruches, dans les classements, sauf si tu t’en retires dans Réglages, « Apparence », « Classements ». Base des classements : l’intérêt légitime d’encourager les échanges entre proches.\n- **Les notifications et les e‑mails** : ce qui t’est arrivé, tes choix d’e‑mails, les dates d’envoi. Vus de toi seul.\n- **Les signalements et la modération** : qui signale, le motif, une copie des textes signalés, les décisions et les suspensions. Vus des administrateurs ; la personne visée reçoit la décision, jamais le nom de qui a signalé. Base : l’intérêt légitime de protéger les membres, et la loi pour un contenu illicite.\n- **Les signalements sans compte** : la cible, le motif, la précision, l’adresse e‑mail si elle est donnée, pour l’accusé de réception et la décision, et l’adresse IP pour la limite de 5 par jour. Vus des administrateurs. Base : la loi (règlement sur les services numériques).\n- **Le blocage** : les membres que tu as bloqués. La personne bloquée n’est pas prévenue.\n- **La sécurité du compte** : tes sessions de connexion (avec l’adresse IP et le navigateur de leur création), les liens envoyés par e‑mail, des compteurs contre les abus. Vus de personne. Base : l’intérêt légitime de protéger les comptes.\n- **Les visites sans compte** : pour lire les pages publiques, un compteur par réseau (adresse IP), gardé en mémoire du serveur, jamais écrit ; pour un signalement, un compteur par adresse IP et un par empreinte de l’adresse e‑mail. Vus de personne. Base : l’intérêt légitime de protéger le service.\n- **Les règles acceptées** : la version, la date, et ta déclaration d’avoir 15 ans ou plus, jamais ta date de naissance. Pour prouver ton accord.\n- **La date de ta dernière visite** : pour supprimer un compte inactif depuis 3 ans.',
          },
          // Choix 9 du scénario : toutes les durées, en liste, telles que le code les applique.
          retention: {
            title: 'Combien de temps',
            body: '- **Ton compte et ce que tu publies** : tant que ton compte existe, ou jusqu’à ce que tu les supprimes.\n- **Ta récolte** : tant que ton compte existe ; les défis, jusqu’à la fin de la semaine qui suit. La ligne d’un geste garde ce qui l’a rapporté (le projet, le membre suivi ; pour ce que reçoivent tes projets, qui l’a fait), même si le geste est retiré, pour qu’il ne paie qu’une fois. Aucun membre ne la voit.\n- **Un compte sans visite** : supprimé après 3 ans, avec un e‑mail un mois avant.\n- **Une inscription dont l’adresse n’est jamais vérifiée** : 30 jours.\n- **Une session de connexion** : 7 jours après sa dernière utilisation, effacée sous 8 jours. Une session qui sert chaque jour garde l’adresse IP de sa création.\n- **Les liens envoyés par e‑mail** (vérification, mot de passe, adresse) : valables 1 heure, effacés sous 25 heures.\n- **Les compteurs contre les abus** : moins de 49 heures. Certains gardent une adresse IP. Ceux de la lecture des pages publiques, en mémoire seulement : 10 minutes.\n- **Ton ancien pseudo** : réservé 30 jours.\n- **Une photo ajoutée mais jamais publiée** : 24 heures, effacée sous 48 heures.\n- **Une invitation dans une ruche** : 30 jours, refusée ou non.\n- **Les avis de l’appli sur tes outils, tes ruches, la vitrine et ta récolte** : 90 jours.\n- **Un outil « Autre » écarté, et le journal du catalogue** : 1 an.\n- **Un signalement** : jusqu’à la décision ; 30 jours s’il est sans objet ; 1 an après la décision s’il est traité.\n- **L’adresse e‑mail donnée avec un signalement sans compte** : jusqu’à la clôture du signalement, décidé ou sans objet.\n- **La place d’un projet dans la vitrine** : tant que le projet reste public et que ni toi ni l’éditeur ne l’en retirez.\n- **Une décision de modération** : 1 an après la dernière décision sur le même contenu, et tant que le contenu reste retiré.\n- **Une suspension** : 1 an après sa fin ; sans fin, tant que le compte existe.\n- **Les sauvegardes du serveur** : 14 jours ; 30 jours au plus pour une sauvegarde faite avant une opération.\n- **La copie hebdomadaire de l’hébergeur** : [durée de la copie de l’hébergeur].\n- **Les journaux de l’appli et de la base** : 50 Mo au plus, les plus anciens effacés d’abord ; ceux de l’appli partent aussi à chaque mise à jour. Ils ne gardent ni adresse ni nom.\n- **Le journal du système du serveur** (connexions des administrateurs) : 6 mois.\n- **Un e‑mail envoyé à {{contactEmail}}** : 1 an après la réponse.\n- **Les extraits lus par l’assistant de code** : 30 jours chez Anthropic, sauf les exceptions de sa politique.',
          },
          device: {
            title: 'Sur ton appareil',
            body: '{{appName}} n’utilise aucun cookie de mesure d’audience ni de publicité, et ne charge aucun outil d’un autre site.\n\nSur ton appareil sont rangés :\n\n- ta session de connexion (un cookie sur le web), 7 jours après ta dernière visite ;\n- sur le web, un petit repère qui dit seulement que tu es connecté, sans dire qui tu es, pour t’ouvrir directement sur le Fil et éviter que la page saute pendant qu’elle charge ; 7 jours après ta dernière visite, effacé à la déconnexion ;\n- le thème choisi ;\n- les aides déjà vues ;\n- les dates de la dernière suspension vue, s’il y en a eu une ;\n- l’adresse en attente de vérification, effacée à la connexion ou à la fermeture de l’onglet.\n\nSans compte, aucun cookie n’est posé.\n\nLa lumière d’ambiance suit la souris et l’inclinaison de l’appareil, mais ni l’une ni l’autre n’est jamais gardée.',
          },
          servers: {
            title: 'Les sauvegardes et les journaux',
            body: 'Le serveur fait une sauvegarde de la base et des fichiers chaque jour, gardée 14 jours. Avant une opération délicate, une sauvegarde de plus est faite, gardée 30 jours au plus. L’hébergeur fait aussi une copie hebdomadaire du serveur entier.\n\nUn compte supprimé disparaît donc des sauvegardes au plus tard quand elles expirent.\n\nLes journaux du serveur servent à corriger les pannes et à repérer les attaques. Ils ne gardent ni adresse e‑mail ni nom.',
          },
          recipients: {
            title: 'Qui d’autre reçoit des données',
            body: 'Les sous-traitants de {{appName}}, qui agissent seulement pour lui :\n\n- **Hostinger** : le serveur, à Paris (la base, les fichiers, les journaux, les sauvegardes), et la boîte {{contactEmail}}.\n- **Scaleway** : l’envoi des e‑mails, à Paris. Il reçoit ton adresse, ton nom, ta langue et le contenu des e‑mails.\n- **GitHub** : le code et les images du logiciel. Aucune donnée de membre.\n\nLes e‑mails reçus restent ensuite dans ta messagerie, chez ton fournisseur.\n\n{{appName}} ne vend ni ne loue aucune donnée.',
          },
          // Décision de Louis du 15/11/2026 : l'assistant de code est nommé tel qu'il est
          // aujourd'hui (offre pour particuliers, responsable de son côté, hors UE possible, pas
          // d'entraînement, 30 jours). Seule exception écrite à la règle « aucune trace d'un outil ».
          // R12 (scénario, Q1) : seule l'échéance change ; l'assistant ne lit jamais l'adresse d'un
          // visiteur qui signale (docs/ops/moderation.md).
          assistant: {
            title: 'L’assistant de code',
            body: '{{appName}} est construit et exploité avec l’aide de Claude, l’assistant de code d’Anthropic. Ce n’est pas un sous-traitant : c’est un destinataire à part.\n\nPour corriger une panne ou traiter un signalement, il peut lire des extraits des journaux et de la base de données, par exemple le texte d’un contenu signalé.\n\n- L’offre utilisée aujourd’hui est une offre pour les particuliers. Anthropic y décide lui-même de l’usage de ces extraits, et en est responsable selon [sa politique de confidentialité](https://www.anthropic.com/legal/privacy).\n- Ces extraits peuvent partir hors de l’Union européenne.\n- Ils ne servent pas à entraîner ses modèles : ce réglage est coupé depuis le 15 novembre 2026.\n- Ils sont gardés 30 jours chez Anthropic, sauf les exceptions de sa politique.\n\nAu plus tard quand {{appName}} deviendra commercial ou ouvrira les inscriptions, {{appName}} passera à une offre professionnelle, où Anthropic deviendra son sous-traitant. Cette page changera alors.',
          },
          rights: {
            title: 'Tes droits',
            body: 'Tu as le droit d’accéder à tes données, de les corriger, de les effacer, de t’opposer à un traitement, d’en demander la limitation, et de les emporter.\n\nDepuis l’appli :\n\n- **télécharger tes données** : Réglages, « Mes données » ;\n- **les corriger** : « Mon profil », et ton adresse dans Réglages, « Compte » ;\n- **les effacer** : chaque contenu depuis sa page, tes commentaires depuis « Mes commentaires », tes retours de testeur depuis « Mes retours envoyés », ou tout ton compte ;\n- **t’opposer** : « Ne pas me proposer aux autres », « Apparaître dans les classements » (Réglages, « Apparence »), et le choix de tes e‑mails dans Réglages, « Notifications ».\n\nPar e‑mail, à {{contactEmail}} : écris depuis l’adresse de ton compte, pour que nous sachions que c’est bien toi. Sans compte, après un signalement : depuis l’adresse donnée. Nous répondons sous un mois ; si la demande est complexe, ce délai peut passer à trois mois, et nous te le disons.\n\nTu peux aussi saisir la CNIL : [cnil.fr](https://www.cnil.fr/fr/plaintes).',
          },
        },
      },
      legal: {
        title: 'Mentions légales',
        summary: {
          publisher: 'Un éditeur, en entreprise individuelle.',
          host: 'Le serveur est chez {{host}}.',
          code: 'Un code libre, sous licence AGPL-3.0.',
        },
        sections: {
          publisher: {
            title: 'L’éditeur',
            body: '{{publisher}}, entrepreneur individuel.\n\n- **Adresse** : {{publisherAddress}}\n- **Téléphone** : {{publisherPhone}}\n- **SIREN** : {{siren}}\n- **E‑mail** : {{publisherEmail}}\n\nDirecteur de la publication : {{publicationDirector}}.',
          },
          host: {
            title: 'L’hébergeur',
            body: '{{host}}, {{hostAddress}}, {{hostPhone}}.\n\nLe serveur de {{appName}} est à Paris.',
          },
          code: {
            title: 'Le code source et sa licence',
            body: '{{appName}} est un logiciel libre, sous licence AGPL-3.0. [Le code source]({{sourceUrl}}) est public : chacun peut le lire, le copier et le modifier, selon les conditions de la licence.',
          },
          brand: {
            title: 'La marque et le logo',
            body: 'Le nom {{appName}}, son logo et sa mascotte désignent ce service. La licence du code ne donne pas le droit de s’en servir : ne les utilise pas pour présenter un autre service sans l’accord de l’éditeur.',
          },
        },
      },
      accessibility: {
        title: 'Accessibilité',
        summary: {
          status: '{{appName}} est partiellement conforme aux WCAG 2.2, niveau AA.',
          done: 'Le texte suit la taille choisie sur ton appareil, et tout se fait au lecteur d’écran ou au clavier.',
          contact: 'Un défaut ? Écris à {{contactEmail}}.',
        },
        sections: {
          commitment: {
            title: 'L’engagement',
            body: '{{appName}} veut être utilisable par tous : quelle que soit la taille du texte, avec un lecteur d’écran, au clavier. Cette déclaration vaut pour l’appli, sur le web, sur iOS et sur Android.',
          },
          status: {
            title: 'L’état de conformité',
            body: '{{appName}} est **partiellement conforme** aux règles WCAG 2.2, niveau AA. Aucun audit extérieur n’a encore été fait : cet état vient de nos propres vérifications.',
          },
          done: {
            title: 'Ce qui est fait',
            body: '- Le texte suit la taille choisie sur ton appareil, et se lit encore à 200 %.\n- Chaque écran se lit avec un lecteur d’écran : titres, boutons nommés, états annoncés.\n- Tout se fait au clavier, avec un focus visible.\n- Les zones à toucher font au moins 44 points.\n- Les contrastes des textes sont vérifiés, de jour comme de nuit.\n- Avec « Réduire les animations » sur ton appareil, les grands déplacements deviennent des fondus et la lumière d’ambiance s’arrête.',
          },
          limits: {
            title: 'Les limites connues',
            body: '- La lumière d’ambiance et le portail de sortie bougent sans bouton pour les arrêter, sauf avec « Réduire les animations ».\n- De jour, sous la lumière tirée d’une photo, quelques textes gris passent sous le contraste visé.\n- Sur iOS et Android, le focus ne va pas toujours à la carte qui vient d’arriver.',
          },
          contact: {
            title: 'Signaler un défaut',
            body: 'Un écran que tu ne peux pas utiliser, un contenu que tu ne peux pas lire ? Écris à {{contactEmail}}, en français ou en anglais. Nous te répondrons, et t’aiderons à obtenir ce que tu cherches sous une autre forme.',
          },
          recourse: {
            title: 'Si la réponse ne vient pas',
            body: 'Sans réponse, ou avec une réponse qui ne te convient pas, tu peux saisir le [Défenseur des droits](https://www.defenseurdesdroits.fr).',
          },
        },
      },
    },
  },
  auth: {
    // L'adresse de contact, lisible sans compte (une personne photographiée, une autorité).
    contact:
      'Une question, un contenu à signaler ? Écris-nous à {{contactEmail}}, en français ou en anglais.',
    fields: {
      name: 'Nom affiché',
      // R3 (relecture juridique, C2) : on choisit ici son nom, qui sert à être trouvé.
      nameHint:
        'Les membres connectés pourront te trouver par ce nom. Ton @pseudo en sera tiré ; tu pourras le changer dans Mon profil.',
      email: 'Adresse e‑mail',
      password: 'Mot de passe',
      passwordHint: 'Au moins {{min}} caractères.',
      inviteCode: 'Code d’invitation',
      inviteCodeHint: 'Demande-le à la personne qui t’a invité·e.',
    },
    passwordMeter: {
      remaining_one: 'Encore {{count}} caractère',
      remaining_other: 'Encore {{count}} caractères',
      // R11 (U4) : la jauge pleine le montre ; la phrase quitte l'écran et devient le nom lu de la
      // barre de progression, que le lecteur d'écran entend toujours.
      done: 'Mot de passe assez long',
    },
    // R2 : sur ordinateur, connexion et inscription sont deux onglets d'un même panneau.
    tabs: {
      /** Le nom de la rangée d'onglets, lu par les lecteurs d'écran. */
      label: 'Connexion ou inscription',
      signIn: 'Se connecter',
      signUp: 'Créer un compte',
    },
    signUp: {
      title: 'Créer ton compte',
      subtitle: 'Tes proches te reconnaîtront à ton nom affiché.',
      submit: 'Créer mon compte',
      haveAccount: 'J’ai déjà un compte',
    },
    signIn: {
      title: 'Te revoilà',
      submit: 'Me connecter',
      noAccount: 'Pas encore de compte ?',
      createOne: 'Créer un compte',
      forgotPassword: 'Mot de passe oublié ?',
      // Affiché sur « Se connecter » après « Choisir un nouveau mot de passe » (R2).
      passwordChanged: 'Mot de passe changé. Connecte-toi avec le nouveau.',
    },
    // R2, « Trop d'essais » : une heure fixe, rien qui défile ; sans « tu », l'adresse IP est
    // partagée par toute une famille (relecture juridique, jur-14, décision D3).
    retryAt: 'Nouvel essai possible à {{time}}',
    chooseNewPassword: 'Choisir un nouveau mot de passe',
    // R2 : « J'ai oublié mon mot de passe ». La réponse est la même qu'un compte existe ou non.
    forgotPassword: {
      title: 'Mot de passe oublié ?',
      submit: 'Envoyer le lien',
      sentTitle: 'C’est envoyé',
      sent: 'Si un compte existe pour cette adresse, un e‑mail vient de partir.',
      sentExpires: 'Le lien est valable une heure.',
      // R2 (relecture juridique, C2) : le quota se dit, sans dire si un compte existe.
      sentLimit: 'Trois liens par heure au plus : le dernier reçu reste valable.',
      noneReceived:
        'Rien reçu après quelques minutes ? Regarde dans les indésirables, ou vérifie l’adresse tapée.',
      resend: 'Renvoyer le lien',
      back: 'Retour à la connexion',
    },
    // R2 : la page ouverte par le lien de l'e-mail (/reset-password).
    resetPassword: {
      title: 'Choisis un nouveau mot de passe',
      newPassword: 'Nouveau mot de passe',
      // La conséquence est dite avant le geste (relecture juridique, jur-3).
      consequences: 'Une fois le mot de passe changé, tous tes appareils seront déconnectés.',
      submit: 'Enregistrer le mot de passe',
      // Un seul texte, vrai pour toutes les causes : expiré, déjà servi, abîmé (jur-16).
      invalidTitle: 'Ce lien ne marche plus',
      invalidBody:
        'Il a expiré (une heure), il a déjà servi, ton mot de passe ou ton adresse a changé depuis, ou il est incomplet.',
      requestNew: 'Demander un nouveau lien',
    },
    checkEmail: {
      title: 'Vérifie ta boîte mail',
      body: 'Un e‑mail part vers {{email}}. Ouvre le lien qu’il contient pour activer ton compte : la connexion se fait directement.',
      bodyNoEmail: 'Nous t’avons envoyé un lien par e‑mail. Clique dessus pour activer ton compte.',
      // R2 (D4, relecture juridique B1) : après une correction d'adresse, rien n'affirme l'envoi.
      bodyChanged:
        'Si {{email}} n’est pas déjà utilisée, un lien d’activation vient d’y partir. Ouvre-le pour activer ton compte : la connexion se fait directement.',
      expires:
        'Sans vérification dans les {{days}} jours qui suivent l’inscription, elle est effacée.',
      back: 'Retour à la connexion',
      // R2 : renvoyer le lien, ouvrir sa messagerie, corriger une faute de frappe dans l'adresse.
      openMailbox: 'Ouvrir ma messagerie',
      resend: 'Renvoyer l’e‑mail',
      // La même phrase que l'adresse ait un compte ou non.
      resent: 'Si cette adresse attend sa vérification, un nouvel e‑mail vient de partir.',
      noneReceived: 'Rien reçu ? Regarde dans les indésirables, ou renvoie l’e‑mail.',
      change: {
        title: 'Changer d’adresse',
        intro: 'L’ancien lien ne marchera plus.',
        newEmail: 'Nouvelle adresse e‑mail',
        password: 'Ton mot de passe',
        submit: 'Envoyer le lien',
        // Décision D4 : on ne révèle pas qui a un compte.
        sent: 'Si cette adresse n’est pas déjà utilisée, un lien vient d’y partir.',
        alreadyVerified: 'Ton adresse est déjà vérifiée : il te suffit de te connecter.',
      },
    },
    verified: {
      title: 'Adresse vérifiée',
      body: 'Ton compte est actif : bienvenue sur {{appName}} !',
      continue: 'Continuer',
    },
    errors: {
      nameRequired: 'Indique un prénom ou un pseudo.',
      invalidEmail: 'Cette adresse e‑mail n’est pas valide.',
      passwordTooShort: 'Le mot de passe doit faire au moins {{min}} caractères.',
      passwordTooLong: 'Le mot de passe doit faire au plus {{max}} caractères.',
      invalidCredentials: 'Adresse e‑mail ou mot de passe incorrect.',
      emailNotVerified:
        'Ton adresse n’est pas encore vérifiée : nous venons de te renvoyer le lien par e‑mail.',
      // R2 (jur-14) : sans « tu », l'adresse IP est partagée ; l'heure du prochain essai suit (retryAt).
      tooManyAttempts: 'Trop d’essais pour l’instant.',
      inviteRequired: 'Indique le code d’invitation que tu as reçu.',
      // R2 : à l'envoi, chaque champ vide dit ce qui manque.
      emailRequired: 'Indique ton adresse e‑mail.',
      passwordRequired: 'Choisis un mot de passe.',
      // R2 : le lien du mot de passe oublié a expiré, a déjà servi ou est abîmé (INVALID_TOKEN).
      invalidToken: 'Ce lien ne marche plus.',
      // R2 : changer d'adresse avant la vérification, mais le compte est déjà vérifié (409).
      alreadyVerified: 'Ton adresse est déjà vérifiée : il te suffit de te connecter.',
      inviteInvalid:
        'Ce code d’invitation n’est pas valide. Demande-le à la personne qui t’a invité·e.',
      // Tranche « adresse » : la nouvelle adresse est celle du compte ; le mot de passe est faux.
      sameEmail: 'C’est déjà ton adresse.',
      wrongPassword: 'Mot de passe incorrect.',
      // Un refus 401 sans autre code : la session a expiré entre l'ouverture de la page et l'envoi.
      sessionExpired: 'Ta session a expiré. Reconnecte-toi, puis recommence.',
      generic: 'Une erreur est survenue. Réessaie dans un instant.',
      // R11 : sous chaque case non cochée, à l'envoi (planche R11-Inscription, option 6). Sous la
      // case de l'âge, une phrase neutre qui dit la suite, sans pousser à cocher (choix 11).
      // Les refus de l'API pour ces deux accords sont avec les autres erreurs de l'API (`errors`).
      rulesUnchecked: 'Coche la case pour créer ton compte.',
      ageUnchecked: '{{appName}} est ouvert à partir de 15 ans.',
    },
  },
  // R11 : accepter les règles, à l'inscription (deux cases) et sur l'écran « Accepter » des membres
  // déjà inscrits, à chaque nouvelle version. Le titre de l'écran et son « En bref » sont ceux de la
  // page (`legal.pages.rules`) ; ses trois sorties reprennent `account.export.button`,
  // `account.delete.title` et `account.signOut`.
  rules: {
    /** Les deux cases ; leur nom lu est leur libellé. */
    accept: 'J’accepte les règles de {{appName}}',
    age: 'J’ai 15 ans ou plus',
    // D3 (relecture du plan) : le lien sort de la case, à côté d'elle.
    read: 'Lire les règles',
    /** Sur l'écran « Accepter » : le lien vers la page entière. */
    readFull: 'Lire le texte complet',
    continue: 'Continuer',
    // « Continuer » ou « Créer un compte » refusé dit ce qui manque, dans la région d'état (U3).
    missing: {
      rules: 'Il manque une chose : ton accord aux règles.',
      age: 'Il manque une chose : ton âge.',
      both: 'Il manque deux choses : ton accord aux règles et ton âge.',
    },
    /** Au-dessus de l'« En bref », quand la version a changé. */
    changesTitle: 'Ce qui change',
    // Les phrases de « Ce qui change », une clé par changement, citées par `RULES_CHANGES`
    // (contracts/rules.ts). R12, la deuxième version : les projets publics. R19, la troisième :
    // le classement de la semaine et la valeur du pollen et du miel (relecture juridique, point 2).
    changes: {
      harvest:
        'Le classement de la semaine range les membres par pollen gagné depuis lundi, sans les réactions ni les abonnements. Le pollen et le miel n’ont aucune valeur hors de {{appName}}.',
      public:
        'Un projet peut devenir public, si tu le choisis : tout le monde le voit alors, moteurs de recherche compris.',
      visitors: 'Sans compte, on peut voir les projets et les pages publics, et les signaler.',
      showcase:
        'L’éditeur choisit des projets publics pour la vitrine de l’accueil et « À la une » ; l’auteur peut en retirer le sien.',
    },
    // J2 (relecture du plan) : pour un membre suspendu, sous le rappel de la suspension
    // (`suspension.headline`, `suspension.contest`) : accepter ne rend pas l'écriture.
    suspended:
      'Accepter les règles ne lève pas ta suspension : tu pourras tout lire, mais pas publier, jusqu’à sa fin.',
    error: 'Ton accord n’a pas pu s’enregistrer. Réessaie.',
    // Relecture de design de R11 : l'API refuse une ancienne version (onglet resté ouvert sur
    // d'anciennes règles) ; réessayer ne servirait à rien, recharger montre la nouvelle.
    outdated: 'Les règles ont changé entre-temps. Recharge la page pour lire la nouvelle version.',
  },
  account: {
    title: 'Mon compte',
    about: { title: 'À propos' },
    signOut: 'Me déconnecter',
    // La déconnexion n'a pas abouti (serveur, réseau) : le membre est peut-être encore connecté.
    signOutError:
      'La déconnexion n’a pas abouti : tu es peut-être encore connecté. Vérifie ta connexion et réessaie.',
    language: {
      title: 'Langue',
      hint: 'Tes e‑mails te sont aussi envoyés dans cette langue.',
      // R18 : la langue choisie se charge à la demande ; si elle n'arrive pas (réseau coupé),
      // l'appli garde la langue d'avant et propose « Réessayer » (common.retry).
      loadFailed: 'Cette langue n’a pas pu se charger. Vérifie ta connexion.',
    },
    appearance: {
      title: 'Apparence',
      auto: 'Automatique',
      day: 'Jour',
      night: 'Nuit',
      hint: 'Sur cet appareil seulement.',
    },
    // Les réglages d'e-mail vivent au profil : « Mon compte » y mène (design, 24/10/2026).
    emails: { title: 'E‑mails', row: 'Choisir les e‑mails reçus' },
    // R11 : « Mes commentaires » et « Mes retours envoyés », l'un sous l'autre (choix 7).
    data: {
      title: 'Mes données',
      comments: 'Mes commentaires',
      feedback: 'Mes retours envoyés',
    },
    safety: { title: 'Sécurité' },
    export: {
      button: 'Télécharger mes données',
      done: 'Tes données ont été téléchargées.',
    },
    section: { title: 'Compte' },
    contact: {
      label: 'Nous écrire',
      spoken: 'Nous écrire : {{contactEmail}}',
    },
    moderation: 'Modération',
    blocks: 'Membres bloqués',
    // Le profil ne se charge pas (réseau en panne) : la page le dit au lieu de rester muette.
    loadError: 'Impossible de charger ton compte. Vérifie ta connexion et réessaie.',
    email: {
      label: 'Adresse e‑mail',
      // Le nom lu de la ligne : l'action, puis l'adresse affichée (sinon le lecteur d'écran la tait).
      spoken: 'Changer d’adresse e‑mail : {{email}}',
    },
    // Tranche « adresse » : la page où l'on demande le changement (deux liens à suivre).
    changeEmail: {
      // Trait d'union insécable (U+2011) dans « e‑mail » : le titre ne se coupe plus entre « e- » et
      // « mail » sur un petit téléphone (relecture de design, 360 et 390 px).
      title: 'Changer d’adresse e‑mail',
      current: 'Ton adresse actuelle : {{email}}',
      intro: 'Les autres membres ne la voient pas.',
      steps:
        'Elle ne change qu’après deux confirmations : un lien envoyé à ton adresse actuelle, puis un lien envoyé à la nouvelle.',
      newEmail: 'Nouvelle adresse e‑mail',
      password: 'Confirme avec ton mot de passe',
      submit: 'Envoyer le lien',
      sending: 'Envoi…',
      noAccess: 'Tu n’as plus accès à ton adresse actuelle ? Écris-nous à {{contactEmail}}.',
      sentTitle: 'Regarde ta boîte mail actuelle',
      sentBody: 'Un lien vient de partir vers {{email}}. Il est valable une heure.',
      sentNext:
        'Rien ne change tant que tu n’as pas suivi ce lien, puis celui que tu recevras sur ta nouvelle adresse.',
      sentNone: 'Rien reçu après quelques minutes ? Regarde dans les indésirables.',
      back: 'Retour aux réglages',
    },
    // Les pages où mènent les deux liens des e-mails.
    emailChange: {
      confirmedTitle: 'Plus qu’une étape',
      confirmedBody:
        'Si ta nouvelle adresse peut être utilisée, un second lien vient d’y partir. Ouvre-le pour terminer, sur un appareil où ta session est ouverte : il est valable une heure.',
      confirmedNone:
        'Rien reçu ? Regarde dans les indésirables. Aucun lien ne part si l’adresse est déjà celle d’un autre compte, ni après trois liens dans l’heure.',
      doneTitle: 'Adresse changée',
      doneBody: 'Ton adresse est maintenant {{email}}. Connecte-toi désormais avec elle.',
      doneSignedOut: 'Connecte-toi avec ta nouvelle adresse et ton mot de passe habituel.',
      doneDevices: 'Tes appareils déjà connectés le restent.',
      signIn: 'Me connecter',
      toAccount: 'Aller aux réglages',
      errorTitle: 'Ce lien ne marche plus',
      errorBody:
        'Il a expiré, il a déjà servi, une autre demande l’a remplacé, un autre compte est connecté sur cet appareil, ou ta nouvelle adresse ne peut plus être utilisée. Tu peux recommencer depuis les réglages.',
      restart: 'Recommencer depuis les réglages',
      // R2 (décision D1) : le second lien n'aboutit que dans la session du membre.
      signInFirstTitle: 'Connecte-toi d’abord',
      signInFirstBody:
        'Ce lien ne marche que depuis ton compte. Connecte-toi, puis ouvre-le à nouveau : rien ne change avant.',
    },
    delete: {
      title: 'Supprimer mon compte',
      screenTitle: 'Supprimer ton compte',
      /** RF (jur-RF1) : le titre de la première liste, en face de « Ce qui reste ». */
      goesTitle: 'Ce qui disparaît',
      profileItem: 'Ton profil et ta photo',
      projectsItem: 'Tes projets',
      projectsDetail:
        'Avec leur description, leur recette, leurs prompts, leurs photos, leurs mises à jour, leurs commentaires, leurs testeurs, leurs appels et les retours de leurs testeurs',
      followsItem: 'Tes abonnements, tes abonnés et tes inscriptions de testeur',
      handleItem: 'Ton pseudo',
      handleDetail:
        '@{{handle}}, et l’ancien s’il t’est réservé : ils redeviennent libres aussitôt',
      reactionsItem: 'Tes réactions et tes commentaires',
      reactionsDetail:
        'Un commentaire qui a reçu des réponses devient « Commentaire supprimé » : ton texte et ton nom en sont effacés, les réponses des autres restent.',
      // R7b (juridique J7) : un fil disparaît en entier avec le compte du testeur.
      testerFeedbackItem: 'Tes retours de testeur, avec leurs captures',
      testerFeedbackDetail:
        'Chaque fil où tu as écrit disparaît en entier, réponses des auteurs comprises.',
      notificationsItem:
        'Tes notifications, et les liens vers toi dans les commentaires des autres',
      notificationsDetail:
        'Ton pseudo y reste écrit, en texte simple, sans lien vers toi. Tes réactions, tes abonnements et tes commentaires disparaissent aussi des notifications des autres.',
      exportHint:
        'Tes textes et tes réglages, à garder avant de partir. Tes photos n’y sont pas : enregistre celles que tu veux garder.',
      password: 'Confirme avec ton mot de passe',
      warning: 'C’est immédiat et sans retour.',
      submit: 'Supprimer définitivement',
      wrongPassword: 'Mot de passe incorrect.',
      // R2 : la suppression se fait dans une feuille posée sur les réglages.
      sheetTitle: 'Supprimer ton compte',
      blocksItem: 'Les membres que tu as bloqués',
      blocksDetail: 'Tes blocages partent avec ton compte, et ceux qui te visaient aussi.',
      // R10 (relecture du plan, juridique C5) : les ruches, ce qui part et ce qui reste.
      hivesItem: 'Tes ruches',
      hivesDetail:
        'Tu quittes chacune de tes ruches. Si tu animes une ruche, l’animation passe à son membre le plus ancien ; si tu en es le dernier membre, elle est supprimée. Les invitations que tu as reçues partent aussi.',
      remains: {
        title: 'Ce qui reste',
        hiveNames:
          'Le nom des ruches que tu as créées reste, tant qu’elles ont des membres : elles ne disparaissent pas avec ton compte',
        reports: 'Tes signalements restent, sans ton nom, jusqu’à un an après leur traitement',
        removals: 'Une trace des retraits de tes contenus reste un an',
        // Tranche 7b (relecture juridique, J11) : au conditionnel, l'écran s'affiche pour tous.
        reportCopies:
          'Si tes contenus ou ton profil ont été signalés, la copie de leurs textes reste 30 jours (un an s’ils ont été retirés)',
        // R10, relecture juridique (C4) : une invitation envoyée garde sa ruche, sans inviteur.
        hiveInvitations: 'Les invitations que tu as envoyées restent valables, sans ton nom',
        // R12 (relecture juridique du plan) : au conditionnel, l'écran s'affiche pour tous.
        searchCopies:
          'Les copies que les moteurs de recherche auraient gardées de tes projets publics ou de ta page publique',
      },
    },
  },
  // R2 : une seule page « Réglages » remplace « Mon compte ». Sur téléphone, une liste de rubriques ;
  // sur ordinateur, les rubriques en colonne à gauche, la rubrique choisie à droite.
  settings: {
    title: 'Réglages',
    // La carte du membre, en haut : sa photo, son nom, et deux actions.
    viewPage: 'Voir ma page',
    edit: 'Modifier',
    sections: {
      profile: 'Mon profil',
      notifications: 'Notifications',
      language: 'Langue',
      appearance: 'Apparence',
      data: 'Mes données',
      security: 'Sécurité',
      account: 'Compte',
      about: 'À propos',
      moderation: 'Modération',
    },
    // Rubrique « Sécurité » : changer son mot de passe.
    changePassword: {
      title: 'Changer mon mot de passe',
      screenTitle: 'Changer ton mot de passe',
      current: 'Mot de passe actuel',
      new: 'Nouveau mot de passe',
      // Les conséquences, dites avant le geste (relecture juridique, jur-3).
      consequencesTitle: 'Tes autres appareils seront déconnectés',
      consequences:
        'Cet appareil reste connecté. Sur les autres, il faudra le nouveau mot de passe.',
      submit: 'Changer le mot de passe',
      // Le toast, une fois le mot de passe changé.
      done: 'Mot de passe changé',
      // Le mot de passe actuel est faux : le champ le dit, rien ne change.
      wrongCurrent: 'Ce n’est pas ton mot de passe actuel.',
    },
  },
  profile: {
    title: 'Mon profil',
    avatar: {
      label: 'Photo de profil',
      change: 'Changer la photo',
      updated: 'Photo mise à jour.',
      privacy:
        'La photo est recadrée en carré et nettoyée de ses informations cachées, comme le lieu.',
    },
    fields: {
      name: 'Nom affiché',
      handle: 'Pseudo',
      handleHint:
        'Il ne change pas avec ton nom. {{min}} à {{max}} caractères : lettres sans accent, chiffres et « _ ».',
      bio: 'Bio',
      tools: 'Outils favoris',
      // R6b : les favoris se choisissent dans le catalogue ; l'aide dit qui les voit (jur-T3). R12 :
      // « de tous les membres » est devenu faux pour une page publique.
      toolsHint: 'Visibles sur ta page.',
    },
    save: 'Enregistrer',
    saved: 'Profil enregistré.',
    savedHandle: 'Profil enregistré. @{{former}} te reste réservé {{days}} jours.',
    errors: {
      nameTooLong: 'Le nom doit faire au plus {{max}} caractères.',
      handleTooShort: 'Le pseudo doit faire au moins {{min}} caractères.',
      handleTooLong: 'Le pseudo doit faire au plus {{max}} caractères.',
      handleInvalid:
        'Le pseudo commence par une lettre, puis n’a que des lettres sans accent, des chiffres et des « _ » seuls, sans finir par « _ ».',
      handleReserved: 'Ce pseudo est réservé. Choisis-en un autre.',
      bioTooLong: 'La bio doit faire au plus {{max}} caractères.',
      tooManyTools: '{{max}} outils au plus.',
      toolTooLong: 'Chaque outil doit faire au plus {{max}} caractères.',
      avatarTooLarge: 'L’image dépasse {{max}} Mo.',
      avatarType: 'Choisis une image JPEG, PNG ou WebP.',
      invalidCharacters:
        'Certains caractères ne sont pas autorisés (caractères invisibles ou de contrôle).',
    },
    /** R2 : la légende de l'aperçu en direct, à droite de la feuille sur ordinateur. */
    previewTitle: 'Aperçu de ta page',
    /** R3 : sous le nom, la rubrique dit que la recherche trouve le membre (relecture juridique, jur-J3). */
    searchable:
      'Les membres connectés peuvent te trouver par ton nom ou ton pseudo, dans la recherche et après « @ » dans un commentaire.',
    // R9 (7d) : le nom ou le pseudo remplacés d'office ; la feuille paraît une fois par visite, un
    // bandeau reste sur « Moi » jusqu'au choix (décision L3 de Louis pour la dernière phrase).
    provisional: {
      handleTitle: 'Choisis un nouveau pseudo',
      handleLead: 'En attendant, tu es @{{handle}} partout.',
      nameTitle: 'Choisis un nouveau nom',
      nameLead: 'En attendant, tu t’appelles « {{name}} » partout.',
      handleRule: '{{min}} à {{max}} caractères : lettres sans accent, chiffres et « _ ».',
      restoreNote:
        'Si tu contestes et que la modération annule sa décision, ton ancien pseudo te sera rendu, à condition que tu n’en aies pas choisi d’autre.',
      later: 'Plus tard',
      chooseHandle: 'Choisir ce pseudo',
      chooseName: 'Choisir ce nom',
      bannerHandle: 'Ton pseudo provisoire est @{{handle}}. Choisis-en un autre.',
      bannerName: 'Ton nom provisoire est « {{name}} ». Choisis-en un autre.',
    },
    // R12 (planche R12-Profil-Public) : la page publique, un choix à part de la visibilité des
    // projets (A14). Le nom et la photo sont toujours montrés, le pseudo jamais (Q8).
    publicPage: {
      title: 'Mon profil public',
      toggle: 'Rendre ma page publique',
      toggleHint: 'Visible par tous, et trouvable sur Google',
      visitorSees: 'Ce que voit un visiteur',
      nameAndPhoto: 'Mon nom et ma photo',
      // La case cochée et grisée ne dit pas pourquoi : l'aide le dit.
      nameAndPhotoHint: 'Toujours, si la page est publique',
      bio: 'Ma bio',
      tools: 'Mes outils favoris',
      projects: 'Mes projets publics',
      // Sous « Mes projets publics » : combien de ses projets sont publics (planche).
      projectsCount: '{{count}} sur {{total}} : les autres restent entre membres',
      projectsAll: '{{count}} sur {{total}}',
      projectsNone: 'Aucun projet public pour l’instant',
      followerCount: 'Mon nombre d’abonnés',
      never: 'Jamais montrés : tes ruches, qui te suit, tes commentaires et tes réactions.',
      preview: 'Voir ma page comme un visiteur',
      // Q6 : un membre suspendu peut fermer sa page, jamais l'ouvrir.
      suspended: 'Pendant la suspension, tu peux seulement fermer ta page publique.',
      error: 'Le changement n’a pas pu être enregistré. Réessaie.',
    },
  },
  project: {
    // R12 (Q19) : la pastille d'un projet public, à côté du statut et de la catégorie, pour tous.
    webBadge: 'Public',
    // R6a : la feuille de publication et de modification (planches R6-*). Les textes marqués
    // « juridique » viennent de la relecture du plan (8/11/2026) et remplacent ceux des planches.
    // Les blocs `new`, `edit`, `fields`, `visuals` et `preview` disparaîtront avec l'ancien écran.
    form: {
      newTitle: 'Nouveau projet',
      editTitle: 'Modifier le projet',
      publish: 'Publier',
      save: 'Enregistrer',
      cancel: 'Annuler',
      // juridique (jur-J3) : vrai aussi après un changement de photo, déjà enregistré.
      unchanged: 'Rien à enregistrer pour l’instant.',
      // Les photos.
      photos: 'Photos',
      photosCount: '{{count}} / {{max}}',
      photosCountSpoken_one: '{{count}} photo sur {{max}}',
      photosCountSpoken_other: '{{count}} photos sur {{max}}',
      photosList: 'Les photos du projet, dans l’ordre',
      addPhotos: 'Ajouter',
      addPhotosLabel: 'Ajouter des photos',
      photosRules: 'JPEG, PNG ou WebP, 5 Mo au plus.',
      // juridique (jur-S1, R6a) : le droit à l'image et les droits sur la photo.
      photosConsent:
        'Ne publie la photo d’une personne qu’avec son accord, et seulement des images que tu as le droit de partager.',
      photosOrder:
        'La première sert de couverture : fais glisser une photo, ou utilise « Déplacer », pour changer l’ordre.',
      // juridique (jur-J4) : en modification seulement.
      photosSaved: 'Les photos s’enregistrent tout de suite.',
      // Un 404 en retirant une photo (design, R6a) : elle a déjà été retirée ailleurs.
      photoGone: 'Cette photo a déjà été retirée.',
      dropZone: 'Glisse tes images ici, ou',
      dropZoneChoose: 'choisis-les',
      cover: 'Couverture',
      // Le nom d'une tuile, lu par les lecteurs d'écran.
      photoTile: 'Photo {{number}}',
      photoTileCover: 'Photo {{number}}, couverture',
      photoTileDescribed: 'Photo {{number}} : {{description}}',
      photoTileCoverDescribed: 'Photo {{number}}, couverture : {{description}}',
      photoUploading: 'Envoi de la photo {{number}}',
      photoFailed: 'La photo {{number}} n’a pas pu être ajoutée : {{reason}}',
      photoTooLarge: 'elle dépasse 5 Mo.',
      photoWrongType: 'ce format n’est pas accepté.',
      photoTooMany: 'il y a déjà 6 photos.',
      // Plusieurs photos choisies d'un coup, au-delà des places qui restent : pickVisuals garde les
      // premières, et la feuille le dit (décision de R6a).
      photosCut_one: 'Seule {{count}} photo a été ajoutée : un projet en garde {{max}} au plus.',
      photosCut_other:
        'Seules les {{count}} premières photos ont été ajoutées : un projet en garde {{max}} au plus.',
      photoUploadError: 'l’envoi a échoué.',
      movePhoto: 'Déplacer la photo {{number}}',
      movePhotoEarlier: 'Avancer',
      movePhotoLater: 'Reculer',
      makeCover: 'Mettre en couverture',
      photoMoved: 'Photo déplacée en place {{place}}.',
      removePhoto: 'Retirer la photo {{number}}',
      photoDescription: 'Description de la photo {{number}}, facultative',
      // juridique (jur-J10).
      photoDescriptionHint:
        'Lue à voix haute par les lecteurs d’écran, pour chaque personne qui voit le projet. Ne nomme personne sans son accord.',
      describeFailed: 'La description n’a pas pu être enregistrée. Réessaie.',
      // juridique (jur-J11) : une photo échoue après la création du projet.
      uploadFailed:
        'Le projet est enregistré, mais certaines photos n’ont pas pu être envoyées. Ajoute-les à nouveau ici.',
      // Le titre, la phrase, la description, le lien.
      title: 'Titre',
      oneLine: 'En une phrase',
      description: 'Description',
      descriptionHint: 'Mise en forme Markdown : **gras**, *italique*, listes, [liens](https://…).',
      demoUrl: 'Lien de la démo, facultatif',
      demoUrlHint: 'Une adresse https, par exemple https://monprojet.vercel.app',
      demoValid: 'Lien valide',
      // juridique (jur-J16) : la forme seulement, le site n'est jamais ouvert.
      demoNotChecked: '{{appName}} n’ouvre pas ce site et ne vérifie pas son contenu.',
      stage: 'Où en est le projet ?',
      // Catégorie et outils.
      category: 'Catégorie',
      categoryRule: 'Une principale, et une seconde si tu veux.',
      secondary: 'Seconde, facultative',
      chooseCategory: 'Choisis une catégorie',
      categoryRank1: '{{category}}, catégorie principale',
      categoryRank2: '{{category}}, catégorie seconde',
      categoryPromoted: '{{category}} devient la catégorie principale.',
      categoryReplaced: '{{category}} remplace {{previous}} en catégorie seconde.',
      categoriesAndTools: 'Catégorie et outils',
      ok: 'OK',
      tools: 'Outils',
      toolsCount: '{{count}} / {{max}}',
      toolsCountSpoken_one: '{{count}} outil choisi sur {{max}}',
      toolsCountSpoken_other: '{{count}} outils choisis sur {{max}}',
      toolsChosen: 'Outils choisis',
      toolSearch: 'Chercher un outil',
      toolSuggestions: 'Outils déjà utilisés',
      toolUses_one: '{{count}} projet',
      toolUses_other: '{{count}} projets',
      toolSuggestion_one: '{{name}}, {{count}} projet',
      toolSuggestion_other: '{{name}}, {{count}} projets',
      addTool: 'Ajouter « {{name}} »',
      addToolButton: 'Ajouter un outil',
      // R6b : le catalogue et les « Autre » (textes de la relecture juridique jur-T3 et jur-T4).
      addOtherTool: 'Ajouter « {{name}} » comme autre outil',
      otherToolsHint:
        'Les autres outils sont relus par les administrateurs : ils peuvent les ajouter au catalogue, ou les rattacher à un outil qui y est déjà.',
      otherToolsHintPrivate:
        'Projet privé : ce nom n’est montré à personne et n’est pas relu. S’il entre au catalogue grâce à un autre projet, le tien suivra.',
      otherCategoryHint:
        'Les administrateurs pourront ranger ton projet dans une catégorie qui lui va.',
      categoriesError: 'Les catégories n’ont pas pu se charger.',
      removeTool: 'Retirer {{name}}',
      // « Commencé en » et « Facile à refaire ? ».
      startedOn: 'Commencé en',
      month: 'Mois',
      year: 'Année',
      clear: 'Effacer',
      difficulty: 'Facile à refaire ?',
      // Les prompts.
      promptCounter: '{{count, number}} / {{max, number}}',
      promptCounterSpoken_one: '{{count, number}} caractère sur {{max, number}}',
      promptCounterSpoken_other: '{{count, number}} caractères sur {{max, number}}',
      promptHint: 'Retire ce qui est personnel : noms, adresses, mots de passe.',
      invisibleRemoved_one: '{{count}} caractère invisible a été retiré.',
      invisibleRemoved_other: '{{count}} caractères invisibles ont été retirés.',
      keyFound: 'Clé : {{masked}}',
      // juridique (jur-J12).
      keyWarning:
        'Une clé d’API est collée ici. Les membres qui liront ce prompt pourraient s’en servir à tes frais.',
      keyRevoke:
        'Si elle a déjà été visible, la retirer ne suffit pas : désactive-la chez son fournisseur.',
      removeKey: 'Retirer la clé',
      removeKeyNamed: 'Retirer la clé {{masked}}',
      keyRemoved: '[clé retirée]',
      otherPrompts: 'Les autres prompts',
      prompt: 'Prompt {{number}}',
      addPrompt: 'Ajouter un prompt',
      removePrompt: 'Retirer le prompt {{number}}',
      // Qui peut le voir.
      audience: 'Qui peut le voir ?',
      members: 'Membres de {{appName}}',
      // R10 (F-Pub6) : « Une ruche », seulement pour un membre d'au moins une ruche.
      hive: 'Une ruche',
      hiveHint: 'Seulement les membres d’une de tes ruches.',
      hiveChoice: 'Quelle ruche ?',
      hiveRequired: 'Choisis la ruche qui verra ce projet.',
      // Le futur avant l'enregistrement (nouveau projet, ou passage dans une autre ruche).
      audienceHive: 'Seuls les membres de {{hive}} verront ce projet.',
      audienceHiveEdit: 'Seuls les membres de {{hive}} voient ce projet.',
      private: 'Privé',
      // juridique (jur-J6).
      privateHint: 'Un brouillon : aucun autre membre ne le voit.',
      // R12 (F-Pub6, Q2 à Q4) : « Public », visible sans compte. L'API le garde sous `web`, car
      // `public` y veut déjà dire « Membres de {{appName}} ». L'aide est celle de A14, mot pour mot ;
      // la phrase du bas vaut pour un nouveau projet comme pour une modification.
      web: 'Public',
      webHint: 'Visible par tous, et trouvable sur Google',
      audienceWeb:
        'Tout le monde pourra le voir, même sans compte. Si tu changes d’avis, les moteurs de recherche peuvent le montrer encore quelque temps.',
      // R8 (juridique, relecture du plan) : le récap par e-mail en parle aussi.
      audienceMembers:
        'Les membres de {{appName}} verront ce projet ; tes abonnés le trouveront dans leur fil et dans leur récap par e‑mail, qui reste dans leur messagerie.',
      audienceMembersEdit:
        'Les membres de {{appName}} voient ce projet ; tes abonnés le retrouvent dans leur fil et dans leur récap par e‑mail, qui reste dans leur messagerie.',
      // juridique (jur-J6) : un nouveau projet privé.
      audiencePrivateNew:
        'Aucun autre membre ne le verra. Tu pourras le montrer aux membres quand tu voudras.',
      audiencePrivate:
        'Privé : aucun autre membre ne le voit. Il te sert de brouillon : les commentaires et les réactions des autres membres sont gardés, mais aucun membre, toi compris, ne les voit tant qu’il reste privé. Ils reviendront s’il redevient visible des membres.',
      // L'aperçu de la carte (ordinateur).
      preview: 'Aperçu dans le fil',
      previewLight: 'La lumière vient de ta première photo.',
      previewUntitled: 'Ton projet',
      previewNoPitch: 'Ta phrase apparaîtra ici.',
      // Supprimer, abandonner.
      deleteZone: 'Supprimer ce projet',
      // juridique (jur-J7).
      deleteOwner: 'Aucun autre membre ne peut modifier ni supprimer ce projet.',
      deleteError: 'Le projet n’a pas pu être supprimé. Réessaie.',
      abandonNew: 'Abandonner ce projet ?',
      // juridique (jur-J2).
      abandonNewBody:
        'Rien n’a encore été envoyé : ce que tu as écrit et les photos choisies seront perdus.',
      abandonEdit: 'Abandonner les changements ?',
      abandonEditBody:
        'Tes changements seront perdus. Les photos, elles, sont déjà enregistrées : elles restent comme tu les as laissées.',
      keepEditing: 'Continuer',
      abandon: 'Abandonner',
      // Après l'envoi.
      published: 'Projet publié',
      // juridique (jur-J6).
      draftSaved: 'Brouillon enregistré. Aucun autre membre ne le voit.',
      saved: 'Modifications enregistrées.',
      deleted: 'Projet supprimé.',
    },
    // R6a : les catégories, dans l'ordre de la feuille (codes de `PROJECT_CATEGORIES`).
    category: {
      'home-garden': 'Maison et jardin',
      cooking: 'Cuisine',
      family: 'Famille et enfants',
      learning: 'Apprendre',
      games: 'Jeux',
      art: 'Art et dessin',
      music: 'Musique',
      'photo-video': 'Photo et vidéo',
      'health-sport': 'Santé et sport',
      travel: 'Voyages',
      money: 'Argent et budget',
      work: 'Travail',
      code: 'Code et outils',
      animals: 'Animaux',
      science: 'Sciences et espace',
      other: 'Autre',
    },
    // R6a : « Facile à refaire ? ». La couleur de la pastille n'est jamais seule : le texte dit tout.
    difficulty: {
      easy: 'À la portée de tous',
      medium: 'Il faut s’accrocher',
      hard: 'Pour les initiés',
    },
    fields: {
      demoUrl: 'Lien de démo (facultatif)',
      demoUrlHint: 'Une adresse https, par exemple https://monprojet.vercel.app',
      demoUrlOk: 'C’est bon : un site public en https.',
    },
    status: {
      idea: 'Idée',
      building: 'En construction',
      testable: 'Testable',
      done: 'Terminé',
      paused: 'En pause',
    },
    preview: {
      now: 'à l’instant',
    },
    visuals: {
      remove: 'Retirer la photo {{number}}',
      portrait: 'Couverture verticale (téléphone)',
      portraitHint:
        'Facultative, plus haute que large : affichée sur téléphone. Sans elle, la première photo est recadrée au centre.',
      choosePortrait: 'Choisir une couverture verticale',
      replacePortrait: 'Remplacer la couverture verticale',
      removePortrait: 'Retirer la couverture verticale',
      photo: 'Photo {{number}} sur {{total}}',
      portraitLabel: 'Couverture verticale',
      preparing: 'Préparation de la photo…',
    },
    // R7a : les mises à jour, qui remplacent le Journal (scénario, « Publier une mise à jour »).
    updates: {
      title: 'Les mises à jour',
      add: 'Publier une mise à jour',
      seeAll_one: 'Voir la mise à jour',
      seeAll_other: 'Voir les {{count}} mises à jour',
      // L'état vide, que seul l'auteur voit ; juridique (P5) : une variante pour un projet privé.
      empty: 'Tes abonnés et tes testeurs seront prévenus.',
      emptyPrivate:
        'Pas encore de mise à jour. Ce projet est privé : aucun autre membre ne verra ce que tu publies, et personne n’est prévenu.',
      // La feuille « Nouvelle mise à jour » (planche R7-MAJ-Publier).
      sheetTitle: 'Nouvelle mise à jour',
      cancel: 'Annuler',
      publish: 'Publier',
      lastVersion: 'Dernière version : {{version}}, {{when}}',
      lastUpdate: 'Dernière mise à jour : {{when}}',
      firstUpdate: 'Première mise à jour',
      titleField: 'Titre, facultatif',
      titlePlaceholder: 'Par exemple : Le décompte de la fusée',
      changes: 'Ce qui a changé',
      counter: '{{count}} / {{max}}',
      // Le compteur lu (interface A1) : « 2 lignes sur 5 ».
      counterLabel_one: '{{count}} ligne sur {{max}}',
      counterLabel_other: '{{count}} lignes sur {{max}}',
      addLine: 'Ajouter une ligne',
      removeLineLabel: 'Retirer la ligne {{number}}',
      lineLabel: 'Changement {{number}} sur {{total}}, {{family}}',
      familyButton: 'Famille : {{family}}',
      versionField: 'Numéro de version, facultatif',
      versionPlaceholder: 'v1.3',
      photos: 'Photos',
      addPhotos: 'Ajouter',
      beforeAfterSwitch: 'Avant / après',
      // juridique (P5), mot pour mot : qui la lira, qui est prévenu.
      hintPublic:
        'Tous les membres pourront la lire. Les abonnés et les testeurs de ce projet seront prévenus.',
      // R12 (Q19) : la même aide pour un projet public, que tout le monde lit.
      hintWeb:
        'Tout le monde pourra la lire, même sans compte. Les abonnés et les testeurs de ce projet seront prévenus.',
      hintPrivate:
        'Ce projet est privé : aucun autre membre ne voit cette mise à jour, et personne n’est prévenu. S’il redevient visible des membres, tous la verront, et ses abonnés et testeurs pourront la retrouver dans Activité.',
      // Le statut changé dans « Modifier » préremplit la feuille (comme le Journal avant).
      statusPrefill: 'Le projet passe en « {{status}} ».',
      hintAnnounce:
        'Ton projet est passé en « {{status}} » : annonce‑le à tes abonnés et à tes testeurs, ou touche Annuler.',
      hintAnnouncePrivate:
        'Ton projet est passé en « {{status}} ». Il est privé : personne ne sera prévenu. Publie cette mise à jour pour la garder, ou touche Annuler.',
      required: 'Écris au moins un changement avant de publier.',
      // Relecture de design R7a, C1 : une ligne au-delà de la limite, refusée avant l'envoi.
      lineTooLong: 'Cette ligne dépasse {{max}} caractères : raccourcis-la.',
      // Interface A6 : « Publier » pendant qu'une photo s'envoie encore.
      photosUploading: 'Attends la fin de l’envoi des photos.',
      // Décision de Louis du 10/11/2026 (sécurité A10) : 100 photos de mises à jour par projet.
      photosFull:
        'Ce projet a atteint 100 photos de mises à jour. Supprime une ancienne mise à jour pour en ajouter.',
      // juridique (relecture R7a, C1) : l'aide de la description d'une photo de mise à jour.
      photoDescriptionHint:
        'Lue à voix haute par les lecteurs d’écran, pour chaque personne qui voit la mise à jour. Ne nomme personne sans son accord.',
      // Le nom lu de la version (relecture de l'interface, S1) : « version 1.2 », pas « v1.2 ».
      versionRead: 'version {{version}}',
      published: 'Mise à jour publiée.',
      error: 'La mise à jour n’a pas pu être publiée. Réessaie.',
      limited:
        'Tu as publié 10 mises à jour en 24 heures. La suivante pourra partir un peu plus tard.',
      // « Abandonner » efface aussi les photos déjà envoyées (sécurité A11).
      discardTitle: 'Abandonner cette mise à jour ?',
      discardBody: 'Ce que tu as écrit et les photos ajoutées seront perdus.',
      // Une mise à jour : sans titre, sa version ; sans version non plus, ce mot.
      untitled: 'Mise à jour',
      photosLabel: 'Photos de la mise à jour',
      delete: 'Supprimer la mise à jour « {{title}} »',
      deleteTitle: 'Supprimer cette mise à jour ?',
      deleteBody:
        'Elle disparaîtra de la page du projet, du fil et des notifications, avec ses photos.',
      // juridique (T4) : une mise à jour retirée par la modération.
      deleteBodyRemoved:
        'Elle disparaîtra de la page du projet, du fil et des notifications, avec ses photos. La décision de la modération et la copie du signalement restent gardées jusqu’à un an après la décision.',
      confirmDelete: 'Supprimer',
      deleted: 'Mise à jour supprimée.',
      deleteError: 'La mise à jour n’a pas pu être supprimée. Réessaie.',
      // La frise (planches R7-MAJ-Projet, R7-MAJ-Desktop).
      count_one: '{{count}} mise à jour',
      count_other: '{{count}} mises à jour',
      firstVersion: 'Première version',
      more: 'Afficher la suite',
      moreError: 'La suite des mises à jour n’a pas pu se charger.',
      loadError: 'Les mises à jour n’ont pas pu se charger.',
      // L'avant / après (F-Pr7) : un curseur pour les lecteurs d'écran, sa valeur en pour cent.
      compare: 'Comparer avant et après',
      before: 'Avant',
      after: 'Après',
      beforeDescribed: 'Avant : {{description}}',
      afterDescribed: 'Après : {{description}}',
      compareValue: '{{value}} %',
      compareHint: 'Fais glisser la poignée, ou utilise les flèches du clavier, pour comparer.',
      // La page de la frise (U4b) : le lien qui ramène au projet, et le nom de l'onglet.
      ofProject: '{{title}}, par {{name}}',
      pageTitle: 'Les mises à jour de « {{title}} »',
    },
    // R7a : les testeurs, des membres qui s'inscrivent pour aider l'auteur. Sans genre imposé
    // (décision de Louis du 10/11/2026, juridique T2) ; jamais le nombre pour un autre que l'auteur.
    testers: {
      join: 'Rejoindre les testeurs',
      joinTitle: 'Rejoindre les testeurs',
      joinBody:
        'Tu aides {{name}} à améliorer « {{title}} » : tu recevras ses mises à jour et ses appels à tester, et tu pourras lui envoyer des retours qu’aucun autre membre ne lit. {{name}} verra ton nom, ta photo et ta date d’inscription. Dans les commentaires de ce projet, un badge « Testeur » s’affichera à côté de ton nom.',
      confirm: 'Rejoindre les testeurs',
      cancel: 'Annuler',
      joinedToast: 'Tu fais partie des testeurs de « {{title}} ».',
      quit: 'Quitter les testeurs',
      quitToast: 'Tu ne fais plus partie des testeurs de « {{title}} ».',
      // juridique (T3) : jamais le nombre de testeurs d'un autre.
      full: 'Ce projet ne prend plus de nouveaux testeurs.',
      notTestable: 'Tu ne peux pas rejoindre les testeurs de ce projet.',
      // Pour l'auteur seul, à côté du nombre d'abonnés.
      count_one: '{{count}} testeur',
      count_other: '{{count}} testeurs',
      error: 'L’inscription n’a pas pu être enregistrée. Réessaie.',
      quitError: 'Le départ n’a pas pu être enregistré. Réessaie.',
      // La page de sortie d'une démo ; la seconde phrase est un lien vers la page du projet
      // (interface S4).
      leavingLead: 'Tu veux aider {{name}} ?',
      leavingLink: 'Rejoins les testeurs depuis la page du projet.',
      // juridique (T5) : ne plus suivre un projet qu'on teste.
      stillTester:
        'Tu fais toujours partie des testeurs : ses mises à jour continueront d’arriver.',
      // R7b : le coin des testeurs (/projects/<id>/testers). Textes des planches validées et des
      // relectures du plan (juridique J1 à J12, interface ui-B5), sans genre imposé.
      corner: 'Le coin des testeurs',
      cornerTitle: 'Le coin des testeurs de « {{title}} »',
      cornerMenu: 'Actions du coin des testeurs',
      cornerLoadError: 'Le coin des testeurs n’a pas pu se charger.',
      // juridique (J5) : quitter demande une confirmation, qui dit ce qui reste chez l'auteur.
      quitTitle: 'Quitter les testeurs de « {{title}} » ?',
      quitBody:
        'Tu ne verras plus les appels du coin des testeurs. Tes retours restent lisibles par {{name}} : tant que le coin est ouvert, tu pourras y relire ton fil et supprimer tes messages. Sinon, écris-nous à {{contactEmail}}.',
      quitConfirm: 'Quitter',
      // juridique (J5) : le retrait est silencieux et définitif ; le nom, jamais « Elle » (ui-B5).
      remove: 'Retirer des testeurs',
      removeTitle: 'Retirer {{name}} des testeurs ?',
      removeBody:
        '{{name}} ne verra plus le coin des testeurs et ne pourra plus les rejoindre ; aucune notification ne part. Ses retours te restent lisibles. Impossible de revenir en arrière.',
      removeConfirm: 'Retirer',
      removedToast: '{{name}} ne fait plus partie de tes testeurs.',
      removeError: 'Le retrait n’a pas pu être enregistré. Réessaie.',
      tabs: { label: 'Le coin des testeurs', calls: 'Appels', feedback: 'Retours' },
      list: {
        since: 'depuis le {{date}}',
        sinceLong: 'Dans les testeurs depuis le {{date}}',
        showMore_one: 'Afficher l’autre testeur',
        showMore_other: 'Afficher les {{count}} autres',
        menu: 'Actions pour {{name}}',
        empty: 'Personne ne teste ce projet pour l’instant.',
      },
      // Pour l'auteur, quand le projet est retiré, privé, ou son compte suspendu (ui-A6).
      closedAuthor:
        'Ton coin des testeurs est fermé : tes testeurs ne le voient plus tant que le projet est privé, retiré par la modération, ou que ton compte est suspendu. Tu peux tout relire, mais plus y écrire.',
      // Un ancien testeur garde son fil en lecture seule (décision de Louis du 11/11/2026).
      formerTester:
        'Tu ne fais plus partie des testeurs : tu peux relire ton fil avec {{name}} et supprimer tes messages.',
      calls: {
        launch: 'Lancer un appel',
        sheetTitle: 'Nouvel appel',
        send: 'Envoyer',
        cancel: 'Annuler',
        audience_one: 'Pour ton testeur',
        audience_other: 'Pour tes {{count}} testeurs',
        audienceNone: 'Pour tes futurs testeurs',
        field: 'Ton appel',
        placeholder: 'Par exemple : essayez le niveau 3 ce week-end, surtout sur téléphone',
        // juridique (J8) : un appel est lu de tous les testeurs, même futurs.
        hint: 'Tous tes testeurs liront cet appel, y compris ceux qui arriveront plus tard. Ne nomme personne et ne cite aucun retour sans l’accord de la personne.',
        required: 'Écris ton appel.',
        photo: 'Photo',
        optional: 'facultative',
        addPhoto: 'Ajouter une photo',
        // juridique (J8) : l'aide du droit à l'image de la galerie, et la description lue.
        photoConsent:
          'Ne publie la photo d’une personne qu’avec son accord, et seulement des images que tu as le droit de partager.',
        photoDescription: 'Description de la photo, facultative',
        photoDescriptionHint:
          'Lue à voix haute par les lecteurs d’écran, pour chaque testeur. Ne nomme personne sans son accord.',
        photoName: 'Photo jointe à l’appel',
        invalidPhoto: 'La photo n’est plus disponible. Ajoute-la de nouveau.',
        limited: 'Tu as lancé {{max}} appels aujourd’hui sur ce projet. Réessaie demain.',
        error: 'L’appel n’a pas pu être envoyé. Réessaie.',
        // R11 : sans session, la feuille dit sa vraie raison (au lieu de `home.membersOnly`).
        signedOut: 'Connecte-toi pour lancer un appel à tes testeurs.',
        empty: 'Aucun appel pour l’instant.',
        emptyAuthor:
          'Aucun appel pour l’instant. Lance le premier : tes testeurs seront prévenus dans Activité.',
        more: 'Afficher les appels précédents',
        moreError: 'Les appels précédents n’ont pas pu se charger.',
        loadError: 'Les appels n’ont pas pu se charger.',
        menu: 'Actions de l’appel « {{excerpt}} »',
        delete: 'Supprimer',
        // juridique (J7) : ce que la suppression emporte ; un appel retiré garde la phrase T4.
        deleteTitle: 'Supprimer cet appel ?',
        deleteBody: 'Il disparaîtra du coin des testeurs et des notifications, avec sa photo.',
        deleteBodyRemoved:
          'Il disparaîtra du coin des testeurs et des notifications, avec sa photo. La décision de la modération et la copie du signalement restent gardées jusqu’à un an après la décision.',
        deleteConfirm: 'Supprimer',
        deleteError: 'L’appel n’a pas pu être supprimé. Réessaie.',
        report: 'Signaler',
      },
      feedback: {
        send: 'Envoyer un retour',
        sheetTitle: 'Ton retour',
        submit: 'Envoyer',
        cancel: 'Annuler',
        byAuthor: 'Projet {{nameOf}}',
        clearDraft: 'Effacer le brouillon',
        outcome: 'Ça a marché ?',
        outcomes: { yes: 'Oui', partly: 'En partie', no: 'Non' },
        outcomeRequired: 'Choisis Oui, En partie ou Non.',
        outcomeSpoken: 'Ça a marché : {{outcome}}',
        device: 'Sur quoi ?',
        devices: { phone: 'Téléphone', computer: 'Ordinateur', tablet: 'Tablette' },
        optional: 'facultatif',
        clearDevice: 'Effacer',
        text: 'Raconte, facultatif',
        placeholder: 'Ce qui a marché, ce qui a coincé, ce que tu as aimé',
        capture: 'Une capture d’écran',
        addCapture: 'Ajouter une capture',
        // juridique (J8) : les données des autres aussi (le scénario est amendé).
        captureHint:
          'Retire de ta capture ce qui est personnel, à toi ou à d’autres : noms, messages, adresses.',
        // juridique (J8) : une capture a un nom lu fixe, jamais une description.
        captureName: 'Capture d’écran jointe au retour {{nameOf}}',
        captureNameMine: 'Capture d’écran jointe à ton retour',
        // juridique (J2) : « aucun autre membre », jamais « personne » : la modération lit un
        // message signalé.
        privacy:
          'Ton retour reste entre {{name}} et toi : aucun autre membre ne le lit. {{name}} reçoit une notification.',
        invalidCapture: 'La capture n’est plus disponible. Ajoute-la de nouveau.',
        limited: 'Tu as envoyé {{max}} messages aujourd’hui. Réessaie demain.',
        error: 'Le retour n’a pas pu être envoyé. Réessaie.',
      },
      thread: {
        pageTitle: 'Le fil {{nameOf}} sur « {{title}} »',
        showEarlier: 'Afficher les précédents',
        earlierError: 'Les messages précédents n’ont pas pu se charger.',
        loadError: 'Le fil n’a pas pu se charger.',
        // juridique (J2), mot pour mot.
        privacyAuthor: 'Ce fil reste entre {{name}} et toi : aucun autre membre ne le lit.',
        privacyTester: 'Ton retour reste entre {{name}} et toi : aucun autre membre ne le lit.',
        privacyList:
          'Chaque fil reste entre toi et la personne qui l’a ouvert : aucun autre membre ne le lit.',
        replyPlaceholder: 'Répondre à {{name}}',
        reply: 'Répondre',
        replyLabel: 'Envoyer la réponse',
        replyError: 'La réponse n’a pas pu être envoyée. Réessaie.',
        closedFormer: 'Tu ne peux plus répondre : {{name}} ne fait plus partie des testeurs.',
        closedCorner: 'Le coin est fermé : tu ne peux plus répondre.',
        // Le nom lu de chaque bulle (ui-B5 : {{nameOf}} élide « d’Inès »).
        feedbackOf: 'Retour {{nameOf}}, {{time}}',
        replyOf: 'Réponse {{nameOf}}, {{time}}',
        mineFeedback: 'Ton retour, {{time}}',
        mineReply: 'Ta réponse, {{time}}',
        menu: 'Actions du message « {{excerpt}} »',
        menuNoText: 'Actions du retour {{nameOf}}',
        menuMineNoText: 'Actions de ton retour',
        settle: 'Marquer comme réglé',
        unsettle: 'Remettre à traiter',
        settled: 'Réglé',
        settledIn: 'Réglé dans la {{version}}',
        settledOn: 'Réglé dans la mise à jour du {{date}}',
        settleError: 'Le changement n’a pas pu être enregistré. Réessaie.',
        settleLimited: 'Trop de changements en une heure. Réessaie plus tard.',
        delete: 'Supprimer',
        // juridique (J7).
        deleteTitle: 'Supprimer ce message ?',
        deleteBody: 'Il disparaîtra du fil, pour {{name}} aussi, avec sa capture.',
        deleteBodyRemoved:
          'Il disparaîtra du fil, pour {{name}} aussi, avec sa capture. La décision de la modération et la copie du signalement restent gardées jusqu’à un an après la décision.',
        deleteConfirm: 'Supprimer',
        deleteError: 'Le message n’a pas pu être supprimé. Réessaie.',
        report: 'Signaler',
        // La liste des fils de l'auteur (ui-A1, juridique J12 : « Ne teste plus »).
        you: 'Toi : {{excerpt}}',
        noText: 'Un retour, sans texte',
        unread: 'non lu',
        rowName: '{{name}}, non lu',
        former: 'Ne teste plus',
        filterLabel: 'Filtrer les retours',
        filters: { open: 'À traiter', settled: 'Réglés' },
        filterSpoken_one: '{{label}}, {{count}} fil',
        filterSpoken_other: '{{label}}, {{count}} fils',
        emptyOpen: 'Aucun retour à traiter.',
        emptySettled: 'Aucun retour réglé pour l’instant.',
        emptyAuthor: 'Aucun retour pour l’instant.',
        emptyTester: 'Pas encore de retour. Dis à {{name}} ce qui marche et ce qui coince.',
        more: 'Afficher la suite',
        moreError: 'La suite n’a pas pu se charger.',
        listLoadError: 'Les retours n’ont pas pu se charger.',
        // Sur ordinateur, la colonne de droite tant qu'aucun fil n'est ouvert (planche R7b-Desktop).
        choose: 'Choisis un fil dans la liste pour le lire ici.',
        // Sous un retour, pendant « Marquer comme réglé » ou « Remettre à traiter » (ui-A1).
        settling: 'Enregistrement…',
      },
      // La partie « Retours réglés » de la feuille « Nouvelle mise à jour ».
      settledField: {
        title: 'Retours réglés',
        count: '{{count}} sur {{total}}',
        countSpoken_one: '{{count}} retour coché sur {{total}}',
        countSpoken_other: '{{count}} retours cochés sur {{total}}',
        // juridique (J9) : un ancien testeur ne lira rien.
        hint: 'Coche les retours que cette mise à jour règle : ils passeront dans « Réglés ». Les personnes qui testent encore ce projet le liront sous leur retour et recevront une notification.',
        item: '{{name}} · {{outcome}}',
        detail: '« {{excerpt}} », {{date}}',
        detailNoText: 'Sans texte, {{date}}',
        max: '{{max}} retours au plus par mise à jour.',
        former: 'Ne teste plus',
        loadError: 'Les retours à traiter n’ont pas pu se charger.',
      },
    },
    reactions: {
      amazing: 'Bluffant',
      inspiring: 'Inspirant',
      useful: 'Utile',
      funny: 'Drôle',
      // R5a : « Waggle ! » remplace « Bravo » à l'écran ; la clé reste `bravo` (base, API).
      bravo: 'Waggle !',
      label: '{{name}}, {{count, number}}',
      labelMine: '{{name}}, {{count, number}}, ta réaction',
      own: 'Les réactions à ton projet',
      // Sous le bloc de l'auteur (R5a, jur-2) ; « Pas encore de réaction » tant que tout est à 0 (jur-14).
      ownCaption: 'Des nombres seulement : l’appli ne montre à personne qui a réagi.',
      ownNone: 'Pas encore de réaction',
      // La légende des réactions qu’un compte suspendu lit sans pouvoir réagir.
      readOnly: 'Les réactions à ce projet',
      group: 'Réagir à ce projet',
      error: 'Ta réaction n’a pas pu être enregistrée. Réessaie.',
    },
    // « Le prompt de départ » et ses repères (R5a : F-Pr2, F-Pr10, jur-6, jur-7). Un repère dit ce
    // qu'il a trouvé, jamais une intention ; rien ne dit qu'un prompt est « sûr ».
    prompts: {
      starting: 'Le prompt de départ',
      others: 'Les autres prompts · {{count}}',
      copy: 'Copier',
      copyStarting: 'Copier le prompt de départ',
      copyNamed: 'Copier le prompt {{index}}',
      copied: 'Copié',
      // Le nom lu du bouton pendant « Copié » : il contient le texte affiché (WCAG 2.5.3, R5a ui B2).
      copiedStarting: 'Prompt de départ copié',
      copiedNamed: 'Prompt {{index}} copié',
      bubble: 'Prompt copié',
      copyFailed: 'Impossible de copier le prompt. Réessaie.',
      caution:
        'Relis-le avant de t’en servir. Ne donne jamais à une IA ton mot de passe, une clé ou un code reçu.',
      warning: 'À lire avant de l’utiliser',
      reasons: {
        command: 'Il contient une commande.',
        link: 'Il contient un lien.',
        encoded: 'Il contient un long bloc codé, illisible tel quel.',
        secret:
          'Il parle d’informations à garder pour soi (mot de passe, clé, code, données bancaires…).',
        // R6a, juridique (jur-J12) : une clé d'API reconnue dans le texte, auteur compris.
        apiKey:
          'Il contient ce qui ressemble à une clé d’API : quelqu’un pourrait s’en servir aux frais de son propriétaire.',
      },
    },
    comments: {
      // R8 (« Voir en contexte ») : le commentaire visé n'existe plus, ou ne se voit pas.
      gone: 'Ce commentaire n’est plus là.',
      // R5b : le titre seul ; le nombre est dessiné à côté par `CountedTitle` et lu par `spokenCount`.
      title: 'Commentaires',
      spokenCount_one: '{{count}} commentaire',
      spokenCount_other: '{{count}} commentaires',
      seeAll_one: 'Voir le commentaire',
      seeAll_other: 'Voir les {{count}} commentaires',
      empty: 'Aucun commentaire pour l’instant.',
      // Un projet privé garde les commentaires des autres, que personne ne lit (R5b, jur-P9, `sees`).
      emptyPrivate:
        'Aucun commentaire à lire pour l’instant. Ceux que d’autres membres auraient laissés sont gardés : aucun membre, toi compris, ne les lit tant que le projet reste privé.',
      emptyRemoved:
        'Aucun commentaire à lire pendant le retrait du projet. Ceux que d’autres membres auraient laissés restent gardés.',
      suspendedNote: 'Tu ne peux pas commenter pendant la suspension.',
      send: 'Envoyer',
      sendLabel: 'Envoyer le commentaire',
      replyTo: 'Réponse à {{name}}',
      replyToExcerpt: 'Réponse à {{name}} : « {{excerpt}} »',
      editing: 'Modifier ton commentaire',
      cancelReply: 'Annuler la réponse',
      cancelEdit: 'Annuler la modification',
      counter: '{{count}} / {{max}}',
      counterSpoken_one: '{{count}} caractère sur {{max}}',
      counterSpoken_other: '{{count}} caractères sur {{max}}',
      tooLong_one: '{{count}} caractère de trop.',
      tooLong_other: '{{count}} caractères de trop.',
      author: 'Auteur',
      // Le lien du nom de l'auteur du projet, lu avec son badge (R5b, ui-M1).
      authorLink: '{{name}}, Auteur',
      // R7b : le badge des testeurs, dessiné comme « Auteur ».
      tester: 'Testeur',
      testerLink: '{{name}}, Testeur',
      menu: 'Actions du commentaire {{nameOf}}',
      yours: 'Ton commentaire',
      // La carte compacte de l'aperçu : un seul bouton, nommé par l'auteur et l'extrait (ui-B7).
      openLine: 'Commentaire {{nameOf}} : {{excerpt}}',
      openLineMine: 'Ton commentaire : {{excerpt}}',
      hiddenNote: 'Il ne reste visible que de toi et de la personne qui l’a écrit.',
      hiddenByAuthor: 'Masqué par l’auteur du projet',
      hiddenByAuthorNote: 'Il ne reste visible que de toi et de l’auteur du projet.',
      readMore: 'Lire la suite',
      readLess: 'Réduire',
      add: 'Écrire un commentaire',
      addShort: 'Commenter',
      hint: 'Tous les membres connectés liront ton commentaire. La personne qui a publié le projet peut le masquer.',
      // Les légendes réduites d'une fenêtre basse (R5b) : seulement qui lira.
      hintShort: 'Tous les membres connectés liront ton commentaire.',
      hintPrivateShort: 'Ce projet est privé : aucun autre membre ne lira ce commentaire.',
      replyHintShort: 'Tous les membres connectés liront ta réponse.',
      replyHintPrivateShort: 'Ce projet est privé : aucun autre membre ne lira cette réponse.',
      editHintShort: 'Tous les membres connectés liront la nouvelle version.',
      hintPrivate:
        'Ce projet est privé : aucun autre membre ne lira ce commentaire. S’il devient visible des membres, tous les membres le liront.',
      about: '{{name}} : {{text}}',
      published: 'Commentaire publié.',
      error: 'Le commentaire n’a pas pu être publié. Réessaie.',
      limited: 'Tu as publié 60 commentaires en une heure. Attends un peu avant le suivant.',
      reply: 'Répondre',
      replyHint:
        'Tous les membres connectés la liront ; la personne qui a publié le projet peut la masquer.',
      replyHintPrivate:
        'Ce projet est privé : aucun autre membre ne lira cette réponse. S’il devient visible des membres, tous les membres la liront.',
      replyError: 'La réponse n’a pas pu être publiée. Réessaie.',
      replyGone: 'Ce fil n’accepte plus de réponse.',
      replyPublished: 'Réponse publiée.',
      editShort: 'Modifier',
      editHint:
        'Tous les membres connectés liront la nouvelle version, marquée « modifié ». La personne qui a publié le projet peut la masquer.',
      editHintHidden:
        'Ce commentaire est masqué : il ne reste visible que de toi et de la personne qui a publié le projet.',
      editError: 'Le commentaire n’a pas pu être modifié. Réessaie.',
      saved: 'Commentaire modifié.',
      edited: 'modifié',
      deleteShort: 'Supprimer',
      deleteTitle: 'Supprimer ce commentaire ?',
      deleteBody: 'Il disparaîtra pour tout le monde.',
      deleteBodyReplies:
        'Ton texte et ton nom disparaîtront pour tout le monde. Les réponses restent, sous « Commentaire supprimé ».',
      confirmDelete: 'Supprimer',
      deleteError: 'Le commentaire n’a pas pu être supprimé. Réessaie.',
      deleted: 'Ton commentaire a été supprimé.',
      hideShort: 'Masquer',
      unhideShort: 'Démasquer',
      hiddenByMe: 'Masqué par toi',
      hiddenDone:
        'Commentaire masqué : il ne reste visible que de toi et de la personne qui l’a écrit.',
      shownDone: 'Commentaire de nouveau visible par tous.',
      hideError: 'Le changement n’a pas pu être enregistré. Réessaie.',
      deletedPlaceholder: 'Commentaire supprimé',
      hiddenPlaceholder: 'Commentaire masqué',
      privateKeptPlaceholder: 'Commentaire gardé tant que le projet est privé',
      removedKeptPlaceholder: 'Commentaire gardé pendant le retrait du projet',
      removedPlaceholder: 'Contenu retiré par la modération',
      // Tranche 7b : « Commentaire masqué » reste au geste de l'auteur du projet (J6).
      blockedPlaceholder: 'Commentaire d’un membre que tu as bloqué',
      unavailablePlaceholder: 'Commentaire indisponible',
      more: 'Afficher la suite',
      moreError: 'La suite des commentaires n’a pas pu se charger.',
      loadError: 'Les commentaires n’ont pas pu se charger.',
      loading: 'Chargement des commentaires…',
    },
    page: {
      /** R12b : sous l’en-tête d’un projet d’un compte d’exemples. */
      exampleNote:
        'Projet fictif, créé par l’équipe de {{appName}} pour montrer à quoi ressemble un projet.',
      published: 'publié le {{date}}',
      /** R4 : la date relative après le verbe (« publié hier », « publié le 12 oct. » : jur-J2). */
      publishedWhen: 'publié {{when}}',
      // R5a : la ligne de dates sous le titre, avec la phrase de RelativeTime (ui-16).
      publishedOn: 'Publié {{when}}',
      createdOn: 'Créé {{when}}',
      updatedWhen: 'Mis à jour {{when}}',
      report: 'Signaler ce projet',
      // Le bouton du haut, d'où qu'on arrive (ui-11 : « Retour au fil » mentirait en venant d'ailleurs).
      back: 'Retour',
      notFoundAction: 'Retour au fil',
      // R5b (D4, jur-P9) : l'auteur ne lit pas non plus les commentaires ni les réactions des autres
      // sur son projet privé (`sees` des commentaires, `reactions/load.ts`).
      privateBanner:
        'Privé : aucun autre membre ne le voit. Il te sert de brouillon : les commentaires et les réactions des autres membres sont gardés, mais aucun membre, toi compris, ne les voit tant qu’il reste privé. Ils reviendront s’il redevient visible des membres.',
      external: '{{host}}, un site hors de {{appName}}',
      description: 'Description',
      tryDemo: 'Tester la démo',
      noDemo: 'Pas encore de démo',
      recipe: 'La recette',
      tools: 'Outils et modèles',
      prompts: 'Prompts clés',
      // R6a : « La recette » montre le mois de début et la difficulté (le temps passé a disparu).
      startedOn: 'Commencé en {{month}}',
      difficulty: 'Facile à refaire : {{level}}',
      // La catégorie à côté du statut (« Sciences et espace · Apprendre »).
      categories: '{{primary}} · {{secondary}}',
      edit: 'Modifier',
      delete: 'Supprimer',
      deleteTitle: 'Supprimer « {{title}} » ?',
      // juridique (jur-J9, puis T1 de R7a) : les mises à jour ont remplacé les notes.
      deleteConfirm:
        'Le projet, sa description, ses photos, ses prompts, ses mises à jour et son coin des testeurs disparaissent tout de suite, avec les commentaires, les réactions et les retours des autres membres. Impossible de revenir en arrière.',
      // Un projet retiré par la modération : la décision et la copie du signalement restent un an.
      deleteConfirmRemoved:
        'Le projet, sa description, ses photos, ses prompts, ses mises à jour et son coin des testeurs disparaissent tout de suite, avec les commentaires, les réactions et les retours des autres membres. La décision de la modération et la copie du signalement restent gardées jusqu’à un an après la décision. Impossible de revenir en arrière.',
      // R12 (relecture juridique du plan) : une phrase à part, pour un projet public seulement.
      deleteConfirmWeb: 'Les moteurs de recherche peuvent le montrer encore quelque temps.',
      deleteConfirmButton: 'Supprimer',
      notFoundTitle: 'Ce projet est introuvable',
      // Le même texte pour tous (R5a jur L3) : il ne dit pas si le projet existe.
      notFound:
        'Il a peut-être été supprimé, il n’est pas visible pour toi, ou le lien est incorrect.',
      home: 'Retour à l’accueil',
      notMine: 'Seule la personne qui a publié ce projet peut le modifier.',
    },
    errors: {
      checkFields: 'Vérifie les champs en rouge.',
      titleRequired: 'Donne un titre à ton projet.',
      titleTooLong: 'Le titre doit faire au plus {{max}} caractères.',
      pitchRequired: 'Résume ton projet en une phrase.',
      pitchTooLong: 'Le pitch doit faire au plus {{max}} caractères.',
      descriptionTooLong: 'La description doit faire au plus {{max}} caractères.',
      demoUrlInvalid:
        'Le lien doit commencer par https:// et mener à un site public (pas d’adresse IP ni de réseau local).',
      tooManyTools: '{{max}} outils au plus.',
      toolTooLong: 'Chaque outil doit faire au plus {{max}} caractères.',
      tooManyPrompts: '{{max}} prompts au plus.',
      promptTooLong: 'Chaque prompt doit faire au plus {{max, number}} caractères.',
      invalidCharacters:
        'Certains caractères ne sont pas autorisés (caractères invisibles ou de contrôle).',
    },
  },
  // R7a : les trois familles d'une ligne de « Ce qui a changé ».
  update: {
    family: { new: 'Nouveau', fixed: 'Réparé', polish: 'Plus joli' },
    // L'exemple de chaque famille, dans le champ vide.
    example: {
      new: 'Par exemple : un mode nuit',
      fixed: 'Par exemple : la lune ne disparaît plus à minuit',
      polish: 'Par exemple : des étoiles qui scintillent',
    },
    // Chaque ligne se lit avec sa famille (interface B4) : « Nouveau : Un compte à rebours… ».
    lineRead: '{{family}} : {{text}}',
  },
  report: {
    // Signaler un contenu (tranche 7a). « La modération » : il n'y a qu'une personne derrière.
    title: 'Signaler',
    action: 'Signaler',
    project: 'Signaler ce projet',
    update: 'Signaler cette mise à jour',
    member: 'Signaler ce profil',
    // R7b : un appel à tester, un message d'un fil de testeur.
    call: 'Signaler cet appel',
    message: 'Signaler ce message',
    // R10 : le nom et l'icône d'une ruche, depuis sa page ou une invitation.
    hive: 'Signaler la ruche',
    target: {
      project: 'Le projet signalé',
      note: 'La note signalée',
      update: 'La mise à jour signalée',
      comment: 'Le commentaire signalé',
      member: 'Le profil signalé',
      call: 'L’appel signalé',
      message: 'Le message signalé',
      hive: 'La ruche signalée',
    },
    reasonLabel: 'Qu’est-ce qui ne va pas ?',
    reasons: {
      illegal: 'Contenu illégal',
      harassment: 'Harcèlement ou haine',
      sexualViolent: 'Contenu sexuel ou violent',
      scamSpam: 'Arnaque ou spam',
      impersonation: 'Usurpation d’identité',
      privacy: 'Une photo ou une information sur moi sans mon accord',
      // R9 : le 8e motif (A6, choix 2 du scénario).
      dangerousLink: 'Lien, démo ou prompt dangereux',
      other: 'Autre chose',
    },
    details: 'Ajoute un détail, facultatif',
    detailsHint: 'N’ajoute pas d’informations personnelles inutiles.',
    illegalDetails: 'Dis-nous pourquoi, obligatoire',
    illegalHint:
      'Dis-nous pourquoi ce contenu te semble illégal. En envoyant, tu confirmes que ton signalement est sincère et exact à ta connaissance.',
    anonymity:
      'La personne concernée ne saura pas que c’est toi. La modération voit qui signale, pour éviter les abus.',
    // R7b (juridique J3) : dans un fil à deux, l'autre peut deviner.
    anonymityThread:
      'Ton nom n’est pas transmis. Mais vous êtes les deux seules personnes à lire ce fil : {{name}} pourra deviner que le signalement vient de toi. La modération voit qui signale, pour éviter les abus.',
    danger:
      'Si quelqu’un est en danger maintenant, appelle le 112 : nous lisons les signalements, mais pas en temps réel.',
    submit: 'Envoyer le signalement',
    sent: 'Merci, ton signalement a été envoyé. La modération va le regarder.',
    back: 'Revenir',
    // Tranche 7a, décisions du 23/10 : la précision obligatoire pour un contenu dit illégal, le
    // quota de 20 par jour, et un contenu disparu entre l’ouverture de la page et l’envoi.
    illegalRequired: 'Dis-nous pourquoi ce contenu te semble illégal.',
    limited:
      'Tu as atteint la limite de {{max}} signalements en 24 heures. Pour un cas urgent, écris-nous : {{contactEmail}}',
    gone: 'Ce contenu n’est plus là.',
    // Tranche 7b : « Envoyer » dit pourquoi il ne part pas (design.md, À reprendre) ; après l'envoi,
    // bloquer l'auteur est proposé, jamais présélectionné (J14).
    reasonRequired: 'Choisis un motif pour envoyer ton signalement.',
    alsoBlock: 'Bloquer aussi @{{handle}}',
    alsoBlockHint: 'Tu ne verras plus ses contenus, et @{{handle}} ne verra plus les tiens.',
    // Ajouté après les tests : la phrase de bonne foi seule, qui reste sous l'erreur « Dis-nous
    // pourquoi… » (l'aide entière répéterait l'erreur, qui en est la première phrase).
    goodFaith:
      'En envoyant, tu confirmes que ton signalement est sincère et exact à ta connaissance.',
    // R9 : la feuille en deux étapes (la partie, puis le motif), ses états et ses sorties.
    comment: 'Signaler ce commentaire',
    partQuestion: 'Quelle partie ?',
    continue: 'Continuer',
    stepBack: 'Retour',
    cancel: 'Annuler',
    close: 'Fermer',
    // Le rappel en tête de la feuille : « Un projet d’Inès Haddad ».
    head: {
      project: 'Un projet {{nameOf}}',
      update: 'Une mise à jour {{nameOf}}',
      comment: 'Un commentaire {{nameOf}}',
      member: 'Le profil {{nameOf}}',
      call: 'Un appel à tester {{nameOf}}',
      message: 'Un message {{nameOf}}',
      hive: 'Une ruche {{nameOf}}',
    },
    // Le premier choix, « tout le contenu », choisi d'avance.
    whole: {
      project: 'Tout le projet',
      update: 'Toute la mise à jour',
      member: 'Tout le profil',
      call: 'Tout l’appel',
      message: 'Tout le message',
      hive: 'Toute la ruche (son nom et son icône)',
    },
    // Les parties, dans l'ordre de la feuille ; une photo se nomme par son rang (« La 2e photo »).
    parts: {
      title: 'Le titre',
      pitch: 'Le pitch',
      description: 'La description',
      category: 'La catégorie',
      tools: 'Les outils',
      demoUrl: 'Le lien de la démo',
      cover: 'La couverture',
      photo: 'La {{rank}} photo',
      photoDescription: 'La description de la {{rank}} photo',
      prompt: 'Le prompt de départ',
      text: 'Ce qui a changé',
      name: 'Le nom',
      handle: 'Le pseudo',
      bio: 'La bio',
      favoriteTools: 'Les outils favoris',
      avatar: 'La photo de profil',
      capture: 'La capture',
      callPhoto: 'La photo',
    },
    // Le rang d'une photo : « 1re », puis « 2e », « 3e »…
    rank: { first: '1re', other: '{{n}}e' },
    // « La 2e photo de Météo » (l'écran Envoyé, la modération).
    partOf: '{{part}} de {{title}}',
    reasonHints: { dangerousLink: 'Arnaque, virus, hameçonnage, prompt piégé' },
    detailsExample: {
      photo: 'Par exemple : ce que montre la photo',
      other: 'Par exemple : ce qui pose problème',
    },
    // La case avant l'envoi (décision des planches, 28/10), jamais cochée d'avance.
    alsoBlockNamed: 'Bloquer aussi {{name}} (@{{handle}})',
    sentTitle: 'Merci, ton signalement a été envoyé.',
    sentBody:
      'La modération va le regarder. Si le contenu est encore là, une notification te dira ce qu’elle a décidé.',
    sentRecap: '{{what}}, {{nameOf}} · {{reason}}',
    alsoBlocked: 'Tu as aussi bloqué {{name}}.',
    // Décision L4 de Louis (13/11/2026) : le blocage refusé après l'envoi.
    blockFailed:
      'Ton signalement a été envoyé, mais le blocage n’a pas pu être enregistré. Tu peux bloquer {{name}} depuis sa page.',
    discard: {
      title: 'Abandonner le signalement ?',
      body: 'Ce que tu as écrit dans cette feuille sera perdu.',
      keep: 'Continuer',
      confirm: 'Abandonner',
    },
    // Son propre contenu : la feuille le dit, sans rien attendre.
    own: {
      project: 'C’est ton projet : tu peux le modifier ou le supprimer.',
      update: 'C’est ta mise à jour : tu peux la modifier ou la supprimer.',
      comment: 'C’est ton commentaire : tu peux le modifier ou le supprimer.',
      member: 'C’est ton profil : tu peux le modifier dans Mon profil.',
      call: 'C’est ton appel à tester : tu peux le supprimer.',
      message: 'C’est ton message : tu peux le supprimer.',
      hive: 'C’est le nom que tu as donné à cette ruche : tu peux le changer dans ses réglages.',
      edit: 'Modifier',
    },
    alreadyReportedWhole: 'Tu as déjà signalé ce contenu. La modération va le regarder.',
    alreadyReportedPart: 'Tu as déjà signalé cette partie. La modération va la regarder.',
    // Le quota, dès l'ouverture : la phrase, puis l'adresse en lien (ContactLink).
    limitedLead:
      'Tu as atteint la limite de {{max}} signalements en 24 heures. Pour un cas urgent, écris-nous :',
    // R12 (planches R12-Visiteur-Signaler, R12-Visiteur-Signale) : un visiteur sans compte signale
    // un projet public, une de ses mises à jour ou une page publique ; pas de champ pour le nom
    // (Q13). Le titre après l'envoi reste sentTitle (R9).
    visitor: {
      email: 'Ton adresse e‑mail, facultative',
      emailHint: 'Pour recevoir la suite de ton signalement',
      emailPlaceholder: 'prenom@exemple.fr',
      // Dit qui lit, à la place de la phrase sur l'anonymat d'un membre (fausse pour un visiteur).
      moderationReads: 'La modération lit chaque signalement.',
      // Après l'envoi : avec une adresse, l'e-mail de la décision ; sans, la phrase de R9 sans la
      // notification (choix b4 des planches).
      sentBody: 'La modération va le regarder.',
      sentBodyEmail: 'La modération va le regarder. Un e‑mail te dira quand il aura été traité.',
      // Q14 : sans « tu » ciblé, l'adresse IP est partagée (même texte que errors.visitorReportQuota).
      limited:
        'Trop de signalements depuis cette connexion. Réessaie demain, ou écris-nous : {{contactEmail}}',
    },
  },
  // Le menu « … » (tranche 7b) : les actions secondaires d'une page, au lieu d'un bouton chacune.
  actionMenu: {
    label: 'Plus d’actions',
    close: 'Fermer le menu',
  },
  // Bloquer un membre (tranche 7b). Le dialogue dit vrai (J9) : ce qu'on ne verra plus, les
  // abonnements, que l'autre n'est pas prévenu mais peut le remarquer, et que la modération ne l'est
  // pas non plus.
  block: {
    action: 'Bloquer',
    title: 'Bloquer @{{handle}} ?',
    hidden:
      'Vous ne verrez plus les projets, les mises à jour et les commentaires l’un de l’autre, et vous ne pourrez plus interagir.',
    // Relecture juridique (R1) : ce qui reste visible malgré le blocage (règles 1 et 2 du plan).
    remains:
      'Les commentaires déjà écrits restent. @{{handle}} lit encore les tiens sur ses propres projets, ceux où tu as écrit son pseudo, et tes messages du coin des testeurs. Pour les retirer, supprime-les avant de bloquer.',
    follows:
      'Vos abonnements de l’un à l’autre sont retirés, comme vos inscriptions de testeur sur les projets de l’autre ; rien ne reviendra si tu débloques.',
    notTold: '@{{handle}} ne reçoit aucun message, mais pourra le remarquer.',
    // Tranche 7c : sans « signale-le », dont le trait d'union se coupait en fin de ligne à 390 px.
    notModeration:
      'Bloquer ne prévient pas la modération. Si un contenu pose problème, fais d’abord un signalement.',
    confirm: 'Bloquer',
    cancel: 'Annuler',
    done: 'Tu as bloqué @{{handle}}.',
    notice: 'Tu as bloqué @{{handle}}.',
    unblock: 'Débloquer',
    unblockTitle: 'Débloquer @{{handle}} ?',
    unblockMessage:
      'Vous verrez de nouveau les contenus l’un de l’autre. Les abonnements et les inscriptions de testeur retirés ne reviennent pas. Les notifications d’avant le blocage peuvent réapparaître, des deux côtés.',
    unblockConfirm: 'Débloquer',
    unblocked: 'Tu as débloqué @{{handle}}.',
    error: 'Le changement n’a pas pu être enregistré. Réessaie.',
    limited: 'Tu as atteint la limite de {{max}} blocages en 24 heures. Réessaie demain.',
    list: {
      title: 'Membres bloqués',
      hint: 'Vous ne voyez plus les contenus l’un de l’autre. La personne bloquée n’est pas prévenue.',
      empty: 'Tu n’as bloqué personne.',
      emptyHint: 'Pour bloquer un membre, ouvre le menu « … » de sa page.',
      blockedOn: 'Bloqué le {{date}}',
      /** R4 : la date relative après le verbe (« Bloqué hier », « Bloqué le 12 oct. » : jur-J2). */
      blockedWhen: 'Bloqué {{when}}',
      more: 'Afficher la suite',
      loadError: 'La liste n’a pas pu se charger.',
      // Ajoutés après les tests : le nom lu de « Débloquer » sur chaque ligne (toutes portent le
      // même mot), et la suite ratée de la liste.
      unblockLabel: 'Débloquer @{{handle}}',
      // La précision d'une ligne : le pseudo, puis la date (blockedOn).
      detail: '@{{handle}} · {{blockedOn}}',
      moreError: 'La suite de la liste n’a pas pu se charger.',
    },
    // Le quota des déblocages a son propre nombre (UNBLOCKS_PER_DAY) : « blocages » serait faux.
    unblockLimited: 'Tu as atteint la limite de {{max}} déblocages en 24 heures. Réessaie demain.',
    // R9 (planche R9-Bloquer) : le nom et le pseudo, un résumé en gras, quatre puces, puis le texte
    // complet d'aujourd'hui (rien du texte juridique ne disparaît).
    titleNamed: 'Bloquer {{name}} (@{{handle}}) ?',
    badge: 'bloqué',
    summary: '{{name}} et toi ne vous verrez plus.',
    bullets: {
      content: 'Vous ne verrez plus les contenus l’un de l’autre.',
      follows: 'Vos abonnements de l’un à l’autre sont retirés.',
      notTold: 'Aucun message ne lui est envoyé.',
      moderation: 'La modération n’est pas prévenue.',
      // R12 (Q19) : un projet public reste visible sans compte, donc aussi de la personne bloquée.
      publicProjects:
        'Tes projets publics et ta page publique, si tu en as, restent visibles de tous, même sans compte.',
    },
    fullText: 'Ce que change le blocage',
    alsoReport: 'Signaler aussi son profil',
  },
  moderation: {
    title: 'Modération',
    pending: 'À traiter',
    removed: 'Retirés',
    empty: 'Aucun signalement en attente.',
    emptyRemoved: 'Aucun contenu retiré.',
    // R12 (planche R12-Vitrine) : l'onglet qui choisit la vitrine de l'accueil et « À la une »
    // parmi les projets publics (Q9). L'auteur est prévenu dans Activité et peut la quitter.
    showcase: {
      tab: 'Vitrine de l’accueil',
      reportsTab: 'Signalements',
      title: 'Sur l’accueil',
      count: '{{count}} sur {{max}}',
      freeSlot: 'Une place libre',
      remove: 'Retirer',
      removeNamed: 'Retirer {{title}} de l’accueil',
      candidates: 'Projets publics',
      search: 'Chercher un projet public',
      feature: 'Mettre en avant',
      featureNamed: 'Mettre en avant {{title}}',
      limit:
        '{{max}} projets au plus. Chaque auteur est prévenu dans Activité et peut retirer son projet de l’accueil.',
      full: 'L’accueil est plein : retires-en un pour en mettre un autre.',
      empty: 'Aucun projet public pour l’instant.',
      searchEmpty: 'Aucun projet public ne correspond.',
      changed: 'Modifié depuis la mise en avant',
      errorTitle: 'La vitrine n’a pas pu se charger',
      error: 'Le changement n’a pas pu être enregistré. Réessaie.',
      // R12, planche R12-Vitrine : la ligne d'un projet public, sous son titre.
      byline: '{{name}} · public depuis le {{date}}',
      // Le nom du groupe des deux onglets du haut (« Signalements », « Vitrine de l'accueil ») : un
      // nom à lui, pas celui de la page (relecture de 7a).
      sections: 'Rubriques de la modération',
      // Relecture de design R12, point 1 : la place d'un projet retiré reste jusqu'au changement de
      // vue, avec ce résultat à la place de « Retirer » (rien ne glisse sous le doigt).
      removed: 'Retiré de l’accueil',
    },
    more: 'Afficher la suite',
    errorTitle: 'La modération n’a pas pu se charger',
    // R7a : « Note (ancien journal) » pour les décisions d'avant l'effacement des notes.
    kinds: {
      project: 'Projet',
      update: 'Mise à jour',
      note: 'Note (ancien journal)',
      comment: 'Commentaire',
      member: 'Profil',
      call: 'Appel à tester',
      message: 'Message d’un fil de testeur',
      hive: 'Ruche',
    },
    // Tranche 7b : la copie champ par champ, et ses images (jamais copiées, seulement suivies).
    fields: {
      text: 'Texte',
      name: 'Nom',
      handle: 'Pseudo',
      bio: 'Bio',
      favoriteTools: 'Outils favoris',
      title: 'Titre',
      pitch: 'Pitch',
      description: 'Description',
      prompt: 'Prompt',
      tools: 'Outils',
      demoUrl: 'Lien de démo',
      // R6a : la description d'une photo ; la copie dit de quelle photo il s'agit (jur-J13).
      photoDescription: 'Description d’une photo',
      photoDescriptionNumbered: 'Description de la photo {{n}}',
      // R7a : la version et chaque ligne de « Ce qui a changé » d'une mise à jour.
      version: 'Version',
      line: 'Changement',
      body: 'Texte',
    },
    images: {
      avatar: 'Photo de profil',
      cover: 'Couverture',
      photo: 'Photo',
      photoNumbered: 'Photo {{n}}',
      present: '{{image}} : toujours affichée',
      gone: '{{image}} : supprimée ou remplacée depuis',
    },
    snapshotsDiffer:
      'Le contenu a changé entre deux signalements : voici sa version la plus récente.',
    snapshot: 'Copie au moment du signalement',
    count_one: '{{count}} signalement',
    count_other: '{{count}} signalements',
    reasonCount: '{{reason}} : {{count}}',
    since: 'Premier signalement le {{date}}',
    removedOn: 'Retiré le {{date}}',
    concernsMe: 'Te concerne : un autre administrateur doit décider.',
    state: { removed: 'Déjà retiré', gone: 'Supprimé depuis par son auteur' },
    view: 'Voir',
    // Un contenu retiré : le projet qui le porte reste lisible (une note, un commentaire).
    viewProject: 'Voir le projet',
    // Ce qui relie chaque bouton d’une carte à son contenu, lu par le lecteur d’écran.
    describe: '{{kind}} : {{excerpt}}',
    // Le nom du groupe d’onglets (« En attente », « Retirés »).
    list: 'Liste affichée',
    remove: 'Retirer',
    dismiss: 'Classer sans suite',
    restore: 'Rétablir',
    removeTitle: 'Retirer ce contenu ?',
    removeMessage:
      'Les autres membres ne le verront plus. Son auteur sera prévenu, avec ton explication. Tu pourras le rétablir.',
    groundLabel: 'Fondement',
    grounds: { illegal: 'La loi', rules: 'Les règles de {{appName}}' },
    explanation: 'Explication',
    explanationHint:
      'Montrée à l’auteur. Dis quelle règle, ou quelle loi (droit à l’image…) ; ne nomme jamais qui a signalé.',
    confirmRemove: 'Retirer',
    cancel: 'Annuler',
    dismissed: 'Signalement classé sans suite.',
    removedDone: 'Contenu retiré.',
    restoredDone: 'Contenu rétabli.',
    // Le bas de la liste (ajouté en tranche 7a) : la suite a raté.
    moreError: 'La suite de la liste n’a pas pu se charger.',
    // Une copie longue se replie après trois champs (ajoutés en corrections 7b).
    showAll: 'Afficher tout',
    showLess: 'Replier',
    // Tranche 7c : les précisions des membres, sous leur propre libellé (distinctes de la copie).
    detailsLabel: 'Précisions des personnes qui ont signalé',
    // Un profil ne se retire pas en entier : la carte dit pourquoi elle n'a pas « Retirer ».
    profileNoRemove:
      'Un profil ne se retire pas en entier : classe le signalement, ou suspends le compte.',
    // L'historique des décisions (tranche 7c), troisième onglet.
    history: 'Historique',
    emptyHistory: 'Aucune décision pour l’instant.',
    historyFor: 'Décisions qui visent @{{handle}}',
    historyForGone: 'Décisions qui visent ce membre',
    historyAll: 'Tout voir',
    actions: {
      remove: 'Retrait',
      restore: 'Rétablissement',
      dismiss: 'Classement sans suite',
      suspend: 'Suspension',
      lift: 'Levée de la suspension',
    },
    decidedBy: 'Par {{name}}',
    decidedByGone: 'Par un administrateur dont le compte a été supprimé',
    decidedOn: 'Le {{date}}',
    memberLine: 'Membre visé : {{name}}',
    memberGone: 'Membre visé : compte supprimé',
    targetGone: 'Contenu supprimé depuis',
    durations: { '7d': '7 jours', '30d': '30 jours', indefinite: 'Sans fin' },
    // Le quota des décisions (J15) : pour une urgence, la procédure à la main reste possible.
    limited:
      'Tu as atteint la limite de {{max}} décisions en 24 heures. Pour une urgence, suis la procédure à la main du guide de modération.',
    durationLine: 'Durée : {{duration}}',
    // Dans l'historique, une suspension qui a suivi un signalement le dit (J2, Louis, 26/10/2026).
    afterReportLine: 'Après un signalement',
    // Ce que la modération a déjà décidé pour le membre visé, sur chaque carte de la file.
    record: {
      title: 'Déjà décidé pour ce membre',
      none: 'Aucune décision passée pour ce membre.',
      removals_one: '{{count}} retrait',
      removals_other: '{{count}} retraits',
      suspensions_one: '{{count}} suspension',
      suspensions_other: '{{count}} suspensions',
      suspendedNow: 'suspendu en ce moment',
    },
    suspendAction: 'Suspendre le compte',
    // Le mot de passe redemandé (tranche 7c) : suspension sans fin, ou trop de retraits d'affilée.
    password: {
      label: 'Ton mot de passe',
      // Relecture de sécurité (S11, S12, Louis, 26/10/2026).
      hint: 'Demandé pour une suspension sans fin, après {{suspensions}} suspensions en 24 heures, ou après {{removals}} retraits en une heure.',
      tooManyFailures:
        'Trop de mots de passe faux : les décisions qui le demandent attendront, pendant 24 heures au plus.',
      confirm: 'Confirmer',
    },
    suspend: {
      title: 'Suspendre le compte {{nameOf}}',
      intro:
        'Le compte passe en lecture seule : la personne lit tout, peut supprimer ses contenus, mais ne publie plus et n’interagit plus. Elle est prévenue par e‑mail et par notification, avec ton explication.',
      durationLabel: 'Durée',
      // Relecture juridique (J9) : les faits et la règle, jamais un jugement sur la personne.
      explanationHint:
        'Montrée au membre. Décris les faits et la règle, pas la personne ; si le fondement est la loi, dis laquelle. Ne nomme ni qui a signalé, ni le membre.',
      confirm: 'Suspendre le compte',
      done: 'Compte suspendu.',
      // Sous le bouton inactif : ce qu'il faut encore remplir (Louis, 26/10/2026).
      missing: 'Pour suspendre, choisis une durée et un fondement, et écris une explication.',
      // Le refus dit sa vraie raison (relecture juridique R3, 27/10/2026).
      notAllowedSelf: 'Tu ne peux pas suspendre ton propre compte.',
      notAllowedAdmin: 'Ce compte est celui d’un administrateur : il ne peut pas être suspendu.',
      errorTitle: 'La page n’a pas pu se charger',
      // R11 : sans session, la feuille dit sa vraie raison (l'ancienne phrase « Rien n'est visible
      // sans compte » servait d'erreur ici).
      signedOut: 'Connecte-toi pour suspendre un compte ou lever sa suspension.',
    },
    lift: {
      title: 'Lever la suspension {{nameOf}}',
      intro:
        'Le compte retrouve toutes ses actions. La personne est prévenue par une notification, avec ton explication.',
      current: 'Suspendu depuis le {{since}}, jusqu’au {{endsAt}} (heure de Paris).',
      currentIndefinite: 'Suspendu depuis le {{since}}, jusqu’à nouvel ordre.',
      explanationHint: 'Une phrase, gardée dans l’historique et montrée au membre.',
      // La levée dit sa raison (J10) : une suspension levée pour erreur ne pèse plus sur le membre.
      causeLabel: 'Pourquoi la lever maintenant ?',
      causes: { early: 'Plus tôt que prévu', error: 'C’était une erreur' },
      causeHint:
        'Une suspension levée pour erreur ne compte plus dans le rappel des décisions passées.',
      confirm: 'Lever la suspension',
      done: 'Suspension levée.',
      missing: 'Pour lever, choisis une raison et écris une explication.',
    },
    // Le menu « … » de la page d'un membre, pour un administrateur seulement.
    memberMenu: {
      suspend: 'Suspendre le compte',
      lift: 'Lever la suspension',
      history: 'Historique de modération',
    },
    // Un administrateur qui a bloqué le membre ne suspend ni ne lève : un autre décide (R3).
    blockedTarget: 'Tu as bloqué ce membre : un autre administrateur doit décider.',
    memberSuspended: 'Compte suspendu jusqu’au {{date}} à {{time}} (heure de Paris)',
    memberSuspendedIndefinite: 'Compte suspendu jusqu’à nouvel ordre',
    // R6b : les liens vers les pages du catalogue, sous les onglets de la Modération.
    catalogueLinksLabel: 'Le catalogue',
    toolsLink: 'Outils',
    categoriesLink: 'Catégories',
    // R6b : la page « Outils » de la Modération (/moderation/tools).
    catalogue: {
      title: 'Outils',
      tabPending: 'À vérifier',
      tabCatalogue: 'Catalogue',
      emptyPending: 'Aucun autre outil à vérifier.',
      /** Sous le nom d'un autre outil : son nombre de projets visibles des membres. */
      pendingProjects_one: 'Cité par {{count}} projet',
      pendingProjects_other: 'Cité par {{count}} projets',
      /** Un autre outil des seuls outils favoris : « Cité par 2 profils » (jur-J1). */
      pendingProfiles_one: 'Cité par {{count}} profil',
      pendingProfiles_other: 'Cité par {{count}} profils',
      /** Les deux à la fois, avec mergeProjects_* et mergeProfiles_* : « Cité par 3 projets et 2 profils ». */
      pendingBoth: 'Cité par {{projects}} et {{profiles}}',
      /** Un membre sur la carte d'un autre outil, qui l'a dans ses outils favoris. */
      profileOf: 'Profil {{nameOf}}',
      /** Un projet sur la carte d'un autre outil : « Quel papillon ?, de Hugo Lefèvre ». */
      projectBy: '{{title}}, par {{author}}',
      admit: 'Ajouter au catalogue',
      merge: 'Rattacher à un outil',
      dismiss: 'Laisser hors du catalogue',
      /** Le résultat d'une carte décidée, à la place de ses boutons. */
      admitted: 'Ajouté au catalogue.',
      merged: 'Rattaché à {{target}}.',
      dismissed: 'Laissé hors du catalogue.',
      searchCatalogue: 'Chercher dans le catalogue',
      createTool: 'Ajouter un outil',
      edit: 'Modifier',
      emptyCatalogue: 'Aucun outil ne correspond.',
      // La feuille d'un outil (ajouter, modifier ; relecture juridique jur-T7).
      formAdmitTitle: 'Ajouter au catalogue',
      formCreateTitle: 'Nouvel outil',
      formEditTitle: 'Modifier l’outil',
      name: 'Nom',
      family: 'Famille',
      /** Sous le groupe des familles, quand aucune n'est choisie (ui-C2). */
      familyRequired: 'Choisis une famille.',
      descriptionFr: 'Description en français',
      descriptionEn: 'Description en anglais',
      descriptionHint:
        'Une phrase neutre : ce que fait l’outil. Ni prix, ni superlatif, ni promesse, ni avis.',
      site: 'Site, facultatif',
      siteHint: 'L’adresse du site officiel, sans lien d’affiliation ni paramètre de suivi.',
      save: 'Enregistrer',
      cancel: 'Annuler',
      saved: 'Outil enregistré.',
      // Rattacher (relecture juridique jur-T5).
      mergeTitle: 'Rattacher « {{name}} »',
      mergeSearch: 'Chercher l’outil du catalogue',
      mergeConfirmTitle: 'Rattacher « {{name}} » à {{target}} ?',
      mergeConfirm:
        'Les {{projects}} et {{profiles}} qui le citent citeront {{target}}, projets privés compris. « {{name}} » deviendra un autre nom de {{target}} : qui le tapera choisira {{target}}. Cela ne s’annule pas dans l’appli.',
      mergeProjects_one: '{{count}} projet',
      mergeProjects_other: '{{count}} projets',
      mergeProfiles_one: '{{count}} profil',
      mergeProfiles_other: '{{count}} profils',
      mergeAction: 'Rattacher',
      // « Changements récents » (le journal du catalogue, gardé un an).
      changes: 'Changements récents',
      changesEmpty: 'Aucun changement pour l’instant.',
      change: {
        tool_admit: '{{admin}} a ajouté {{tool}} au catalogue',
        tool_create: '{{admin}} a créé {{tool}}',
        tool_edit: '{{admin}} a modifié {{tool}}',
        tool_merge: '{{admin}} a rattaché « {{merged}} » à {{tool}}',
        tool_dismiss: '{{admin}} a laissé « {{tool}} » hors du catalogue',
        category_create: '{{admin}} a créé la catégorie {{category}}',
        project_recategorize: '{{admin}} a rangé « {{project}} » dans {{category}}',
        project_recategorize_hidden: '{{admin}} a rangé un projet dans {{category}}',
      },
      /** Un administrateur dont le compte a été supprimé. */
      formerAdmin: 'Un ancien administrateur',
    },
    // R6b : la page « Catégories » de la Modération (/moderation/categories).
    categories: {
      title: 'Catégories',
      tabUncategorized: 'À ranger',
      tabCategories: 'Catégories',
      /** Le nom du groupe d'onglets (ui-S3) : il dit le choix, pas le titre de la page. */
      tabsLabel: 'Liste à afficher',
      emptyUncategorized: 'Aucun projet à ranger.',
      sort: 'Ranger dans une catégorie',
      sortTitle: 'Ranger « {{title}} »',
      sortChoice: 'La catégorie',
      sortAction: 'Ranger',
      sorted: 'Rangé dans {{category}}.',
      /** Sous le nom d'une catégorie : son nombre de projets. */
      projects_one: '{{count}} projet',
      projects_other: '{{count}} projets',
      create: 'Nouvelle catégorie',
      createTitle: 'Nouvelle catégorie',
      nameFr: 'Nom en français',
      nameEn: 'Nom en anglais',
      /** Sous chaque champ resté vide, et sous la grille sans icône (des-C3, ui-C2). */
      nameFrRequired: 'Écris le nom en français.',
      nameEnRequired: 'Écris le nom en anglais.',
      icon: 'Icône',
      iconRequired: 'Choisis une icône.',
      /** Relecture juridique jur-T15 (article 9 du RGPD). */
      createHint: 'Une catégorie décrit le sujet d’un projet, jamais la personne qui le publie.',
      preview: 'Aperçu',
      createAction: 'Créer',
      cancel: 'Annuler',
      created: 'Catégorie créée.',
      /** Le sens de chaque icône qu'on peut choisir, lu par les lecteurs d'écran. */
      iconName: {
        plant: 'Plante',
        'cooking-pot': 'Casserole',
        'users-three': 'Trois personnes',
        'graduation-cap': 'Toque de diplômé',
        'game-controller': 'Manette',
        'paint-brush': 'Pinceau',
        'music-notes': 'Notes de musique',
        'film-strip': 'Pellicule',
        heartbeat: 'Battement de cœur',
        'airplane-tilt': 'Avion',
        'piggy-bank': 'Tirelire',
        briefcase: 'Mallette',
        code: 'Code',
        'paw-print': 'Patte',
        planet: 'Planète',
        shapes: 'Formes',
        flower: 'Fleur',
        tree: 'Arbre',
        bicycle: 'Vélo',
        car: 'Voiture',
        house: 'Maison',
        'book-open': 'Livre ouvert',
        'chat-circle': 'Bulle de discussion',
        camera: 'Appareil photo',
        microphone: 'Micro',
        't-shirt': 'Tee-shirt',
        baby: 'Bébé',
        globe: 'Globe',
        lightbulb: 'Ampoule',
        robot: 'Robot',
        sparkle: 'Étincelle',
        heart: 'Cœur',
      },
      /**
       * R6b (U9) : sous « Autre », dans l'onglet « Catégories », pourquoi une catégorie créée se
       * place avant elle ; `projects` est le texte de `projects` (« 2 projets »).
       */
      otherDetail: 'Toujours en dernier · {{projects}}',
    },
    // R9 : l'écran en trois colonnes (ordinateur), ou la file puis le détail (téléphone).
    adminOnly: 'Réservé aux administrateurs',
    pendingCount: 'À traiter ({{count}})',
    reportedTimes_one: 'Signalé {{count}} fois',
    reportedTimes_other: 'Signalé {{count}} fois',
    // Les parties en minuscules, après le genre du contenu : « Projet · la photo 2 ».
    parts: {
      title: 'le titre',
      pitch: 'le pitch',
      description: 'la description',
      category: 'la catégorie',
      tools: 'les outils',
      demoUrl: 'le lien de démo',
      cover: 'la couverture',
      photo: 'la photo {{n}}',
      photoDescription: 'la description de la photo {{n}}',
      prompt: 'le prompt de départ',
      text: 'ce qui a changé',
      name: 'le nom',
      handle: 'le pseudo',
      bio: 'la bio',
      favoriteTools: 'les outils favoris',
      avatar: 'la photo de profil',
      capture: 'la capture',
      callPhoto: 'la photo',
    },
    kindPart: '{{kind}} · {{part}}',
    contextLine: '{{title}}, {{nameOf}}',
    authorOn: '{{name}}, sur {{title}}',
    // Le détail d'un signalement (la colonne du milieu, ou sa page sur téléphone).
    detail: {
      commentOn: 'Un commentaire sur {{title}}',
      // R10 : le nom d'une ruche signalé (le titre n'a pas de projet à citer), puis ce que la
      // modération voit d'elle en plus du nom : « 4 membres, animée par Papi Jean ».
      hiveName: 'Le nom d’une ruche',
      hiveLine: '{{members}}, animée par {{name}}',
      partOf: '{{part}} de {{title}}',
      seeInContext: 'Voir en contexte',
      firstReport: 'Premier signalement',
      at: '{{relative}}, {{exact}}',
      written: {
        project: 'Projet publié',
        update: 'Mise à jour publiée',
        comment: 'Commentaire écrit',
        member: 'Profil créé',
        call: 'Appel lancé',
        message: 'Message écrit',
        hive: 'Ruche créée',
      },
      snapshotAt: 'Copie gardée à {{time}}',
      reasons: 'Motifs',
      removeHint: 'Retirer demande un fondement et une explication, montrés à l’auteur.',
      accountOf: 'Le compte {{nameOf}}',
      suspendHint: 'La suspension s’ouvre dans une fenêtre : durée, fondement, explication.',
      suspend: 'Suspendre',
      unknown: 'Ce signalement n’est plus dans la file.',
      backToQueue: 'Retour à la file',
    },
    // La fiche de l'auteur, que les administrateurs seuls voient.
    authorCard: {
      recent: 'Compte récent',
      joined: 'Inscription le {{date}}',
      projects_one: '{{count}} projet',
      projects_other: '{{count}} projets',
      noProject: 'aucun projet',
      comments_one: '{{count}} commentaire',
      comments_other: '{{count}} commentaires',
      noComment: 'aucun commentaire',
      decided: 'Déjà décidé : {{record}}',
      seeDecisions: 'Voir ses décisions',
      liftedSuspensions_one: '{{count}} suspension levée',
      liftedSuspensions_other: '{{count}} suspensions levées',
    },
    // L'historique récent, une ligne courte par décision, avec sa couleur.
    recent: {
      title: 'Historique',
      phoneTitle: 'Décisions récentes',
      all: 'Voir tout l’historique',
      what: {
        project: 'un projet',
        update: 'une mise à jour',
        note: 'une note',
        comment: 'un commentaire',
        member: 'un profil',
        call: 'un appel à tester',
        message: 'un message',
        hive: 'une ruche',
      },
      remove: 'a retiré {{what}}',
      removePart: 'a retiré {{part}} d’{{what}}',
      restore: 'a rétabli {{what}}',
      restorePart: 'a rétabli {{part}} d’{{what}}',
      dismiss: 'a classé un signalement sans suite',
      suspend: 'a suspendu un compte pour {{duration}}',
      suspendIndefinite: 'a suspendu un compte sans fin',
      lift: 'a levé une suspension',
      liftError: 'a levé une suspension : c’était une erreur',
    },
    // La fenêtre « Retirer » d'une partie (planche R9-Retirer).
    removeSheet: {
      title: 'Retirer {{part}} de « {{title}} » ?',
      message:
        'Les autres membres ne verront plus cette partie. Son auteur sera prévenu, avec ton explication, et pourra la remplacer ou la supprimer. Tu pourras la rétablir.',
      what: 'Que retirer ?',
      onlyPart: 'Seulement cette partie : {{part}}',
      rest: {
        project: 'Le reste du projet reste affiché.',
        update: 'Le reste de la mise à jour reste affiché.',
        member: 'Le reste du profil reste affiché.',
        call: 'Le reste de l’appel reste affiché.',
        message: 'Le reste du message reste affiché.',
        hive: 'La ruche garde son icône et ses membres ; elle s’appelle « Ruche sans nom » jusqu’à ce que son animateur en choisisse un autre.',
      },
      whole: {
        project: 'Tout le projet',
        update: 'Toute la mise à jour',
        call: 'Tout l’appel',
        message: 'Tout le message',
      },
      wholeHint: {
        project: 'Il n’apparaît plus nulle part pour les autres membres.',
        update: 'Elle n’apparaît plus nulle part pour les autres membres.',
        call: 'Il n’apparaît plus nulle part pour les autres membres.',
        message: 'Il n’apparaît plus nulle part pour les autres membres.',
      },
      shownTo: 'Montrée à {{name}}',
      preview: 'Ce que lira {{name}}',
      dsa: 'Le règlement européen sur les services numériques (DSA, article 17) demande de dire à l’auteur ce qui est retiré, pourquoi, et comment contester.',
      confirmPart: 'Retirer {{part}}',
      // Le menu du fondement, avant un choix ; et ce qui manque encore, sous le bouton inactif.
      groundNone: 'À choisir',
      missing: 'Pour retirer, choisis un fondement et écris une explication.',
    },
    // La fenêtre « Suspendre » (planche R9-Suspendre).
    suspendSheet: {
      subtitle: '@{{handle}} · inscription le {{date}} · déjà décidé : {{record}}',
      afterReport:
        'La suspension suit ce signalement : l’historique et la notification le disent. Les signalements ouverts restent dans la file.',
      // Rien encore de décidé pour ce membre : le sous-titre sans son rappel.
      subtitleNew: '@{{handle}} · inscription le {{date}}',
    },
    // Quitter la feuille « Suspendre » avec une explication écrite ou une durée choisie : la
    // fenêtre demande d'abord (même forme que `report.discard`).
    discard: {
      title: 'Abandonner la décision ?',
      body: 'Ce que tu as écrit ou choisi dans cette feuille sera perdu.',
      keep: 'Continuer',
      confirm: 'Abandonner',
    },
  },
  // Le compte suspendu, tel que son membre le lit (tranche 7c, article 17 du DSA) : la mesure, sa
  // durée, le fondement, l'explication, ce qui reste possible, et comment contester.
  suspension: {
    title: 'Ton compte est suspendu',
    // Le bandeau replié (Louis, 27/10/2026) : la mesure et sa fin sur une ligne forte, le reste
    // sous « Détails ».
    headline: 'Ton compte est suspendu jusqu’au {{date}} à {{time}} (heure de Paris)',
    headlineIndefinite: 'Ton compte est suspendu jusqu’à nouvel ordre',
    details: 'Détails',
    // Qui a décidé, puis le fondement : une seule phrase, dont une autre langue peut changer
    // l’ordre.
    decisionLine: '{{decision}} {{ground}}',
    // Qui a décidé, et après quoi (DSA art. 17.3, J2) : jamais qui a signalé.
    afterReport:
      'Après un signalement, une personne de la modération a décidé de suspendre ton compte.',
    direct: 'Une personne de la modération a décidé de suspendre ton compte.',
    explanation: 'Explication : {{explanation}}',
    canStill:
      'Tu peux toujours tout lire, supprimer tes projets, tes mises à jour, tes commentaires, tes appels et tes retours, passer un projet en privé, retirer ta bio, tes outils favoris et ta photo, quitter les testeurs d’un projet, exporter tes données, régler ton compte, bloquer et signaler. Tu ne peux plus publier, commenter, réagir, suivre ni rejoindre les testeurs.',
    // Les recours (J3, formulation à faire valider par un professionnel).
    // Suivi de l’adresse, en lien qui ouvre la messagerie (Louis, 27/10/2026).
    contest: 'Pour contester : écris à {{contactEmail}}. Tu peux aussi saisir la justice.',
    contestLead: 'Pour contester, écris à la modération :',
    contestCourt: 'Tu peux aussi saisir la justice.',
    // À la place d'un formulaire de projet, et sur « Mon profil ».
    formBody:
      'Pendant la suspension, tu ne peux ni publier ni modifier un projet. Tu peux le passer en privé ou le supprimer.',
    profileLocked:
      'Pendant la suspension, tu peux seulement retirer ta bio, tes outils favoris et ta photo.',
    // R9 (relecture juridique jur-B4) : un nom ou un pseudo provisoire se remplace même suspendu.
    profileLockedProvisional:
      'Pendant la suspension, tu peux seulement retirer ta bio, tes outils favoris et ta photo, et remplacer ton nom ou ton pseudo provisoire.',
    // Le titre de la page qui remplace le formulaire de projet (C, 7c) : le bandeau dit
    // déjà « Ton compte est suspendu », le titre ne le répète pas.
    formTitle: 'Publication impossible pour l’instant',
    // R9 (jur-R5, J14, L6) : ce qu'un compte suspendu peut retirer, et le passage en privé.
    removeBio: 'Retirer ma bio',
    removeTools: 'Retirer mes outils',
    removeAvatar: 'Retirer ma photo',
    bioRemoved: 'Bio retirée.',
    toolsRemoved: 'Outils retirés.',
    avatarRemoved: 'Photo retirée.',
    makePrivate: 'Rendre privé',
    makePrivateTitle: 'Rendre « {{title}} » privé ?',
    makePrivateBody:
      'Il ne sera plus visible que de toi. Pendant la suspension, tu ne pourras pas le rendre de nouveau visible.',
    madePrivate: 'Projet passé en privé.',
    // R9 : l'échec de « Rendre privé », lu dans sa fenêtre, qui reste ouverte.
    makePrivateError: 'Le projet n’a pas pu passer en privé. Réessaie.',
  },
  removal: {
    // Ce que lit l'auteur d'un contenu retiré (article 17 du DSA) : quoi, que c'est visible de
    // lui seul, après un signalement ou non, qu'une personne a décidé, le fondement, l'explication,
    // et comment contester.
    banner: 'Retiré par la modération',
    onlyYou: 'Les autres membres ne voient plus ce contenu, jusqu’à un éventuel rétablissement.',
    afterReport:
      'Après un signalement, une personne de la modération a décidé de retirer ce contenu.',
    direct: 'Une personne de la modération a décidé de retirer ce contenu.',
    grounds: {
      illegal: 'Fondement : la loi.',
      rules: 'Fondement : les règles de {{appName}}.',
    },
    explanation: 'Explication : {{explanation}}',
    contest: 'Pour contester : {{contactEmail}}',
    // R9 (7d, décision L2 de Louis) : une partie retirée, vue par son auteur seul : le fondement,
    // l'explication, la date, « Contester » avec l'adresse écrite, et la justice.
    part: {
      titles: {
        description: 'La description a été retirée par la modération',
        tools: 'Les outils ont été retirés par la modération',
        demoUrl: 'Le lien de la démo a été retiré par la modération',
        cover: 'La couverture a été retirée par la modération',
        photo: 'La photo {{n}} a été retirée par la modération',
        photoDescription: 'La description de la photo {{n}} a été retirée par la modération',
        prompt: 'Le prompt de départ a été retiré par la modération',
        name: 'Ton nom a été retiré par la modération',
        handle: 'Ton pseudo a été retiré par la modération',
        bio: 'Ta bio a été retirée par la modération',
        favoriteTools: 'Tes outils favoris ont été retirés par la modération',
        avatar: 'Ta photo de profil a été retirée par la modération',
        capture: 'La capture a été retirée par la modération',
        callPhoto: 'La photo a été retirée par la modération',
      },
      onlyYou:
        'Les autres membres ne voient plus cette partie, jusqu’à un éventuel rétablissement.',
      rest: {
        project: 'Le reste du projet reste affiché.',
        update: 'Le reste de la mise à jour reste affiché.',
        member: 'Le reste de ton profil reste affiché.',
        call: 'Le reste de l’appel reste affiché.',
        message: 'Le reste du message reste affiché.',
        hive: 'Ta ruche garde son icône et ses membres : choisis-lui un autre nom dans ses réglages.',
      },
      // R10, relecture juridique (C2) : pour qui a écrit le nom retiré sans animer la ruche.
      restHiveWriter:
        'La ruche garde son icône et ses membres ; son animateur peut lui choisir un autre nom.',
      date: 'Retiré le {{date}}',
      contestLead: 'Pour contester :',
      court: 'Tu peux aussi saisir la justice.',
      replace: 'Remplacer',
      delete: 'Supprimer',
      // Le nom ou le pseudo remplacés d'office (planche R9-Partie-Retiree).
      provisionalHandle:
        'En attendant, il est provisoirement @{{handle}}, partout. Choisis-en un autre : la raison est dans Activité.',
      provisionalName:
        'En attendant, il est provisoirement « {{name}} », partout. Choisis-en un autre : la raison est dans Activité.',
      chooseHandle: 'Choisir mon pseudo',
      chooseName: 'Choisir mon nom',
      // R9 : « Supprimer » d'une photo retirée, réussi (bulle) ou refusé (sous la partie).
      // R9 (relectures) : la confirmation avant de supprimer une photo retirée, pour de bon.
      deleteConfirmTitle: 'Supprimer cette photo ?',
      deleteConfirmBody:
        'Elle disparaîtra de ton projet pour de bon : tu ne pourras pas la récupérer.',
      photoDeleted: 'Photo supprimée.',
      deleteError: 'La photo n’a pas pu être supprimée. Réessaie.',
    },
    // L'objet de l'e-mail de « Contester » nomme la décision (J12) : « Contestation : retrait de la
    // photo 2 de « Météo » du 12 nov. ».
    contestSubject: 'Contestation : {{decision}} du {{date}}',
    contestDecision: {
      project: 'retrait de mon projet « {{title}} »',
      update: 'retrait de ma mise à jour de « {{title}} »',
      comment: 'retrait de mon commentaire sur « {{title}} »',
      call: 'retrait de mon appel à tester « {{title}} »',
      message: 'retrait de mon message sur « {{title}} »',
      part: 'retrait de {{part}} de « {{title}} »',
      profilePart: 'retrait de {{part}} de mon profil',
      suspension: 'suspension de mon compte',
    },
    // Le nom donné d'office quand la modération retire celui d'un membre (R9), dans la langue de
    // son compte ; il le garde jusqu'à ce qu'il en choisisse un autre.
    provisionalNameValue: 'Membre',
  },
  member: {
    /** R12b : sous le nom d’un compte d’exemples, sur sa page. */
    exampleNote:
      'Les projets de ce compte sont fictifs : l’équipe de {{appName}} les a créés pour montrer à quoi ressemble un projet.',
    // {{nameOf}} : « d’Inès », « de Léa » (nameOf de @ruche/i18n, tranche 6c).
    open: 'Voir la page {{nameOf}}',
    handle: '@{{handle}}',
    favoriteTools: 'Outils favoris',
    projects: 'Projets',
    /** R3 : le nombre à côté de « Projets » ou « Mes projets », dans le nom lu. */
    projectCount_one: '{{count}} projet',
    projectCount_other: '{{count}} projets',
    /** Au plafond de la liste (PROJECT_LIST_MAX) : « 50 projets ou plus ». */
    projectCountMore: '{{max}} projets ou plus',
    empty: 'Pas encore de projet visible des membres.',
    emptyMine: 'Tu n’as encore rien publié.',
    private: 'Privé',
    notFoundTitle: 'Ce membre est introuvable',
    notFound: 'Son compte a peut-être été supprimé, ou le lien est incorrect.',
  },
  // Les mentions « @pseudo » dans les commentaires (tranche 6b).
  mentions: {
    /** Le nom de la liste des membres proposés après « @ », lu par les lecteurs d'écran. */
    suggestions: 'Membres à mentionner',
    /** Un membre proposé : son nom, puis son pseudo. */
    option: '{{name}}, @{{handle}}',
    /** R5b : le titre de la liste, au-dessus des suggestions. */
    title: 'Mentionner quelqu’un',
    /** R5b (D3) : la pastille d'une mention, lue avec le nom seul (le pseudo écrit peut être périmé). */
    pill: '{{name}}, ouvre son profil',
  },
  tag: {
    emptyTitle: 'Encore aucun projet ici',
    empty: 'Le tien sera peut-être le premier.',
  },
  // R3 : la navigation. La barre d'onglets du téléphone (Fil · Explorer · + · Ruches · Moi) et la
  // barre du haut de l'ordinateur partagent ces noms.
  nav: {
    /** Le nom de la région de navigation, lu par les lecteurs d'écran. */
    label: 'Navigation principale',
    feed: 'Fil',
    explore: 'Explorer',
    /** Le rond miel « + » de la barre du bas, et le bouton de la barre du haut. */
    publish: 'Publier',
    hives: 'Ruches',
    me: 'Moi',
    moderation: 'Modération',
    /** La roue dentée de la page « Moi ». */
    settings: 'Réglages',
    /**
     * Le bouton loupe de la barre du haut en largeur moyenne, qui ouvre la recherche. Un autre nom
     * que celui du champ (`search.label`, « Rechercher ») : la loupe ouvre la page, le champ cherche.
     */
    search: 'Ouvrir la recherche',
  },
  // R3 : l'onglet Explorer (planches R3-Explorer*), qui reprend « Découvrir ».
  explore: {
    title: 'Explorer',
    testers: 'Ils cherchent des testeurs',
    /** « Tester », posé sur la photo d'une carte ; la flèche « ↗ » est dessinée, pas lue. */
    test: 'Tester',
    /** Le nom lu du lien « Tester » : le projet, puis « ouvre un site externe » (common.externalSite). */
    testProject: 'Tester {{title}}',
    /** Le nom lu du carrousel. */
    carousel: 'Projets qui cherchent des testeurs',
    /** Les flèches du carrousel, sur ordinateur. */
    previous: 'Projets précédents',
    next: 'Projets suivants',
    popularTools: 'Outils populaires',
    /** Les flèches du carrousel « Outils populaires », sur ordinateur. */
    previousTools: 'Outils précédents',
    nextTools: 'Outils suivants',
    allTools: 'Tous les outils',
    recent: 'Récents',
    /** L'échec d'une section d'Explorer se dit dans la section, avec son propre texte. */
    testersError: 'Les projets qui cherchent des testeurs n’ont pas pu se charger.',
    recentError: 'Les projets récents n’ont pas pu se charger.',
    toolsError: 'Les outils populaires n’ont pas pu se charger.',
    // R6b : les catégories en filtre, au-dessus de « Récents ».
    categoriesLabel: 'Catégories des projets récents',
    allCategories: 'Toutes',
    categoryEmpty: 'Aucun projet dans « {{name}} » pour l’instant.',
    /** Sous une catégorie vide : retire le filtre (des-C4). */
    seeAllProjects: 'Voir tous les projets',
    // R12 (planche R12-A-La-Une) : en tête d'Explorer, les projets de la vitrine de l'accueil ; ni
    // sous-titre ni aide. Sans projet mis en avant, la rangée n'apparaît pas.
    featured: 'À la une',
    featuredPrevious: 'Projets à la une précédents',
    featuredNext: 'Projets à la une suivants',
    categoriesError: 'Les catégories n’ont pas pu se charger.',
  },
  // R3 : la recherche par mots (planche R3-Recherche). Les nombres affichés (« 2 », « 20+ ») restent
  // hors du nom lu, qui passe par les pluriels ci-dessous.
  search: {
    title: 'Recherche',
    /** Le nom du champ, lu par les lecteurs d'écran, et son texte d'attente. */
    label: 'Rechercher',
    placeholder: 'Un projet, une personne, un outil',
    clear: 'Effacer la recherche',
    tabs: { all: 'Tout', projects: 'Projets', members: 'Membres', tools: 'Outils' },
    /** Le nom lu d'un onglet avec son nombre : « Projets, 2 résultats ». */
    tabWithCount: '{{tab}}, {{results}}',
    results_one: '{{count}} résultat',
    results_other: '{{count}} résultats',
    resultsMore: '{{max}} résultats ou plus',
    /** Ce que la région d'état annonce quand les résultats arrivent : « 3 projets, 1 membre, 0 outil ». */
    summary: '{{projects}}, {{members}}, {{tools}}',
    projects_one: '{{count}} projet',
    projects_other: '{{count}} projets',
    projectsMore: '{{max}} projets ou plus',
    members_one: '{{count}} membre',
    members_other: '{{count}} membres',
    membersMore: '{{max}} membres ou plus',
    tools_one: '{{count}} outil',
    tools_other: '{{count}} outils',
    toolsMore: '{{max}} outils ou plus',
    /** L'extrait d'une description, entre guillemets. */
    excerpt: '« {{excerpt}} »',
    /** Sous le nom d'un membre : son pseudo et ses abonnés (« @camille_ot · 12 abonnés »). */
    memberMeta: '@{{handle}} · {{followers}}',
    searching: 'Recherche en cours…',
    /** Sous 2 caractères, rien n'est cherché : le champ le dit. */
    typeMore: 'Tape au moins deux caractères.',
    emptyTitle: 'Aucun résultat pour « {{q}} »',
    empty: 'Essaie un mot plus court, ou le nom d’un outil comme « Claude ».',
    tooManyTitle: 'Trop de recherches d’un coup',
    tooMany: 'Réessaie dans un instant.',
    /** Sous 3 lettres, seuls les membres suivis sortent (relecture juridique de R3, C1). */
    shortQuery: 'À partir de 3 lettres, tu trouves aussi les membres que tu ne suis pas.',
    errorTitle: 'La recherche n’a pas pu aboutir',
    /** Le nom lu du groupe d'onglets « Tout · Projets · Membres · Outils ». */
    tabsLabel: 'Résultats à montrer',
    /** Le nom lu d'un projet trouvé : son titre et sa pastille (« Carnet de cafés, Testable »). */
    projectWithStatus: '{{title}}, {{status}}',
    // R6b : le filtre par catégorie, sur le groupe Projets.
    allCategories: 'Toutes les catégories',
    categoryChosen: 'Catégorie : {{name}}',
    /** Une catégorie de l'adresse dont le nom n'est pas encore lu : jamais « Toutes les catégories ». */
    category: 'Catégorie',
    /** L'onglet « Projets » vidé par la catégorie choisie, et de quoi la retirer. */
    categoryEmpty: 'Aucun projet trouvé dans cette catégorie.',
    clearCategory: 'Chercher dans toutes les catégories',
  },
  // R3 : « Tous les outils » (planche R3-Outils, sans le catalogue normé, qui vient en R6).
  tools: {
    // R6b : le catalogue (planche R3-Outils). « projets » sans « publics » : depuis R6a, un projet
    // des membres de Waiggle n'est pas public (choix 1 du plan, scénario R6b).
    title: 'Outils',
    projects_one: '{{count}} projet',
    projects_other: '{{count}} projets',
    /** Un outil du catalogue sans projet (0 serait « 0 projet » au singulier en français). */
    noProjects: 'Aucun projet pour l’instant',
    /** Le nom lu d'un outil avec son nombre : « Claude, 41 projets ». */
    withCount: '{{label}}, {{projects}}',
    /** Sous le nom d'un outil : sa famille et son nombre (« Assistant IA · 41 projets »). */
    detail: '{{family}} · {{projects}}',
    search: 'Chercher un outil',
    /** Le nom lu du groupe des pastilles de familles. */
    familiesLabel: 'Familles d’outils',
    all: 'Tous',
    mostUsed: 'Les plus utilisés',
    aToZ: 'De A à Z',
    noMatch: 'Aucun outil ne correspond.',
    others: 'Pas encore dans le catalogue',
    othersHint:
      'Des outils ajoutés par les membres avec « Autre ». Les administrateurs les relisent et peuvent les ajouter au catalogue.',
    emptyTitle: 'Encore aucun outil',
    empty: 'Les outils apparaîtront ici dès qu’un projet en citera un.',
    errorTitle: 'Les outils n’ont pas pu se charger',
    /** Une famille, au singulier, sous le nom d'un outil. */
    family: {
      assistant: 'Assistant IA',
      creation: 'Création',
      'no-code': 'Sans code',
      development: 'Développement',
      automation: 'Automatisation',
      'smart-home': 'Maison connectée',
      hardware: 'Matériel et objets',
    },
    /** Une famille, en court, sur les pastilles de « Outils ». */
    familyPill: {
      assistant: 'IA',
      creation: 'Création',
      'no-code': 'Sans code',
      development: 'Développement',
      automation: 'Automatisation',
      'smart-home': 'Maison connectée',
      hardware: 'Objets',
    },
  },
  // R6b : la page d'un outil du catalogue (planches R6-Outil, R6-Outil-Desktop).
  tool: {
    statusLabel: 'Où en sont les projets',
    statusAll: 'Tous',
    statusTestable: 'Testables',
    statusDone: 'Terminés',
    categoryLabel: 'Catégorie',
    allCategories: 'Toutes les catégories',
    /** La pastille de toutes les catégories, sur ordinateur. */
    all: 'Toutes',
    /** Le nom lu du bouton des catégories, une fois l'une choisie : « Catégorie : Cuisine ». */
    categoryChosen: 'Catégorie : {{name}}',
    /** Une catégorie avec son nombre, lue : « Cuisine, 3 projets ». */
    categoryWithCount: '{{name}}, {{projects}}',
    categorySheetTitle: 'Catégories',
    close: 'Fermer',
    emptyTitle: 'Encore aucun projet ici',
    empty: 'Le tien sera peut-être le premier.',
    emptyFiltered: 'Aucun projet ici pour l’instant.',
    clearFilters: 'Voir tous les projets',
    more: 'Afficher la suite',
    edit: 'Modifier',
    notFoundTitle: 'Outil introuvable',
    notFound: 'Cet outil n’est pas dans le catalogue, ou son adresse a changé.',
    seeAllTools: 'Voir tous les outils',
    /** Sous la description (relecture juridique jur-T7). */
    disclaimer: 'Description écrite par {{appName}}, sans lien avec l’éditeur de l’outil.',
    /** Le nom lu du lien du site : son nom, puis la page d'avertissement. */
    siteLink: '{{host}}, s’ouvre après une page d’avertissement',
    /** Un « Autre » sur une pastille, et ce qu'en lit un lecteur d'écran. */
    otherBadge: 'Autre',
    otherSpoken: '{{name}}, autre outil, pas encore dans le catalogue',
    errorTitle: 'Cet outil n’a pas pu se charger',
  },
  // R10 : les ruches, des groupes de proches (scénario R10, planches R10-*). Le nom d'une ruche est
  // écrit par un membre : il passe toujours en paramètre ({{hive}}), jamais dans une phrase traduite.
  hives: {
    title: 'Ruches',
    mine: 'Mes ruches',
    // R11 (« Moins de mots », U4) : seulement sous l'état vide ; le sous-titre de la liste disparaît.
    intro: 'On y entre par une invitation.',
    emptyTitle: 'Pas encore de ruche',
    create: 'Créer une ruche',
    // Sous « Créer une ruche » grisé (scénario : « au-delà, le bouton explique pourquoi »).
    createdLimit:
      'Tu as créé 10 ruches, le plus possible. Supprimes-en une pour en créer une autre.',
    joinedLimit:
      'Tu fais partie de 20 ruches, le plus possible. Quittes-en une pour en créer ou en rejoindre une autre.',
    loadError: 'Tes ruches n’ont pas pu se charger.',
    // Le nom retiré par la modération.
    unnamed: 'Ruche sans nom',
    // Dans une phrase qui dit déjà « la ruche » : « Rejoindre la ruche sans nom ».
    unnamedInline: 'sans nom',
    // Le nom lu de l'alvéole ; l'icône est décorative.
    badge: 'Ruche {{hive}}',
    // R11 (U4) : « Ma ruche » quitte l'écran ; le nom lu ne dit plus un mot absent.
    myHiveNamed: 'Ruche {{hive}}',
    members_one: '{{count}} membre',
    members_other: '{{count}} membres',
    animatedBy: 'animée par {{name}}',
    news_one: '{{count}} nouveauté',
    news_other: '{{count}} nouveautés',
    newsNone: 'rien de neuf',
    // Le nom lu d'une ligne : « Famille, 4 membres, animée par Papi Jean, 2 nouveautés ».
    rowName: '{{hive}}, {{members}}, animée par {{animator}}, {{news}}',
    rowNameNoAnimator: '{{hive}}, {{members}}, {{news}}',
    // Les icônes de l'alvéole, nommées par leur sens (jamais par leur code).
    icons: {
      'house-line': 'Maison',
      heart: 'Cœur',
      'users-three': 'Groupe',
      baby: 'Bébé',
      coffee: 'Café',
      'book-open': 'Livre',
      'game-controller': 'Manette de jeu',
      'music-notes': 'Musique',
      'rocket-launch': 'Fusée',
      leaf: 'Feuille',
      camera: 'Appareil photo',
      code: 'Code',
    },
    invitations: {
      title: 'Invitations',
      count_one: '{{count}} invitation',
      count_other: '{{count}} invitations',
      line: '{{name}} t’invite dans la ruche {{hive}}',
      // L'inviteur a supprimé son compte : l'invitation reste valable.
      lineNoInviter: 'Une invitation t’attend dans la ruche {{hive}}',
      when: '{{members}} · {{relative}}',
      accept: 'Rejoindre la ruche',
      acceptNamed: 'Rejoindre la ruche {{hive}}',
      refuse: 'Refuser',
      // {{nameOf}} : « de Nora Benali », « d’Inès » (nameOf de @ruche/i18n).
      refuseNamed: 'Refuser l’invitation {{nameOf}}',
      refuseNamedNoInviter: 'Refuser l’invitation dans la ruche {{hive}}',
      refuseHint: 'Refuser ne prévient personne.',
      // Elle reste à sa place jusqu'au prochain passage (relecture du plan, interface 14).
      refused: 'Invitation refusée.',
      // Les trois promesses, sur l'invitation reçue (relecture du plan, juridique C1).
      promiseFaces: 'Les membres de la ruche verront ton nom et ta photo dans la ruche.',
      promiseProjects: 'Tu verras les projets réservés à la ruche.',
      promiseLeave: 'Tu pourras quitter la ruche quand tu veux.',
      more: 'Plus d’options pour l’invitation dans la ruche {{hive}}',
      report: 'Signaler la ruche {{hive}}',
      expiredTitle: 'Cette invitation n’est plus valable.',
      expired: 'Elle a expiré après 30 jours.',
      close: 'Fermer',
      acceptError: 'L’invitation n’a pas pu être acceptée. Réessaie.',
      refuseError: 'L’invitation n’a pas pu être refusée. Réessaie.',
    },
    createSheet: {
      title: 'Créer une ruche',
      name: 'Nom de la ruche',
      namePlaceholder: 'Famille',
      nameHint: '40 caractères au plus.',
      nameRequired: 'Donne un nom à la ruche.',
      icon: 'Icône de la ruche',
      preview: 'Aperçu',
      submit: 'Créer',
      cancel: 'Annuler',
      error: 'La ruche n’a pas pu être créée. Réessaie.',
    },
    // La ruche juste créée, seule, sur « Inviter des proches » (planche R10-Creer).
    ready: {
      title: 'Ta ruche est prête',
      body: 'Ils deviennent membres s’ils acceptent.',
      action: 'Inviter des proches',
    },
    page: {
      tabsLabel: 'Parties de la ruche',
      activity: 'Actualité',
      projects: 'Projets',
      // « Projets · 5 » à l'écran, « Projets, 5 projets » à l'oreille.
      projectsCount: 'Projets · {{count}}',
      projectsSpoken_one: 'Projets, {{count}} projet',
      projectsSpoken_other: 'Projets, {{count}} projets',
      members: 'Membres',
      invite: 'Inviter',
      // La ruche pleine (option 9 des planches).
      full: '50 membres au plus, invitations comprises.',
      membersAndInvited: '{{members}} et {{invited}}',
      invited_one: '{{count}} invité',
      invited_other: '{{count}} invités',
      animatorOnly: 'Dans cette ruche, seul l’animateur invite.',
      menu: 'Plus d’options pour la ruche {{hive}}',
      settings: 'Réglages de la ruche',
      report: 'Signaler la ruche',
      leave: 'Quitter la ruche',
      pinnedBy: 'Épinglé par {{name}}',
      pinned: 'Épinglé',
      pin: 'Épingler',
      pinNamed: 'Épingler {{title}}',
      unpin: 'Retirer l’épingle',
      pinError: 'L’épingle n’a pas pu changer. Réessaie.',
      seekingOne: '{{name}} cherche des testeurs',
      seekingMany: 'Ils cherchent des testeurs',
      test: 'Tester',
      testNamed: 'Tester {{title}}',
      // La pastille d'un projet réservé.
      reserved: 'Réservé à {{hive}}',
      published: '<b>{{name}}</b> a publié <b>{{title}}</b>',
      updated: '<b>{{name}}</b> a mis à jour <b>{{title}}</b>',
      updatedVersion: '<b>{{name}}</b> a mis à jour <b>{{title}}</b> · {{version}}',
      pinnedLine: '<b>{{name}}</b> a épinglé <b>{{title}}</b>',
      activityEmpty: 'Rien de neuf dans la ruche ces 30 derniers jours.',
      projectsEmpty: 'Aucun projet réservé à la ruche pour l’instant.',
      more: 'Afficher la suite',
      moreError: 'La suite n’a pas pu se charger.',
      membersPhrase:
        'L’animateur épingle un projet, choisit qui peut inviter et peut retirer un membre. Les membres d’une ruche se voient entre eux, jamais les autres membres de {{appName}}.',
      animator: 'Animateur',
      inviteOne: 'Inviter un proche',
      remove: 'Retirer de la ruche',
      removeNamed: 'Retirer {{name}} de la ruche',
      loadError: 'Cette ruche n’a pas pu se charger.',
      // Le « … » d'une tuile de l'onglet Projets, pour l'animateur (« Épingler ») : nommé par le
      // projet, chaque tuile ayant le sien.
      projectMenu: 'Plus d’options pour {{title}}',
    },
    // « Ne pas me proposer aux autres » : dans l'onglet Membres et dans Mes données.
    hideFromSuggestions: 'Ne pas me proposer aux autres',
    hideFromSuggestionsHint:
      'Tu n’apparais plus dans « Proches à suivre ». Tu restes dans la recherche et dans les membres de tes ruches.',
    hideFromSuggestionsError: 'Ce choix n’a pas pu s’enregistrer. Réessaie.',
    invite: {
      title: 'Inviter dans {{hive}}',
      search: 'Chercher un membre',
      searchPlaceholder: 'Nom ou pseudo',
      searchHint: 'Tape au moins 2 lettres.',
      phrase:
        'Tu invites des membres de {{appName}}. Ils deviennent membres seulement s’ils acceptent ; un refus ne prévient personne.',
      invite: 'Inviter',
      inviteNamed: 'Inviter {{name}}',
      sent: 'Invitation envoyée',
      member: 'Déjà membre',
      empty: 'Aucun membre trouvé.',
      searchError: 'La recherche n’a pas pu se faire. Réessaie.',
      error: 'L’invitation n’a pas pu partir. Réessaie.',
      previewTitle: 'Ce que reçoit {{name}}',
      previewTitleAnyone: 'Ce que reçoit la personne invitée',
      close: 'Fermer',
      // Les places qui restent dans la ruche : 50 au plus, invitations en attente comprises.
      placesLeft_one: 'Encore {{count}} place dans la ruche.',
      placesLeft_other: 'Encore {{count}} places dans la ruche.',
      // Relecture du design de R10 : le quota court sur 24 h ; {{count}}, celui du contrat
      // (HIVE_LIMITS.invitationsPerDay).
      dailyLimit:
        'Tu as envoyé tes {{count}} invitations du jour : les suivantes pourront partir demain.',
      // Sous 3 lettres, seulement les membres suivis et ceux de ses ruches (relecture du plan, A3).
      shortQuery: 'À partir de 3 lettres, tu trouves aussi les autres membres de {{appName}}.',
      // 404 : un membre inconnu, ou un blocage entre les deux (l'API répond pareil).
      notFound: 'Ce membre ne peut pas être invité.',
      // Le nombre de résultats, lu après chaque recherche.
      results_one: '{{count}} membre trouvé',
      results_other: '{{count}} membres trouvés',
    },
    settings: {
      title: 'Réglages de la ruche',
      name: 'Nom',
      nameError: 'Le nom n’a pas pu s’enregistrer. Réessaie.',
      icon: 'Icône',
      changeIcon: 'Changer l’icône',
      iconSheet: 'Choisir une icône',
      policy: 'Qui peut inviter ?',
      policyMembers: 'Tous les membres',
      policyAnimator: 'Seulement moi',
      policyError: 'Ce choix n’a pas pu s’enregistrer. Réessaie.',
      handOver: 'Confier l’animation',
      handOverHint: 'Tu en resteras membre.',
      delete: 'Supprimer la ruche',
      // La précision de la ligne « Confier l'animation » (planche R10-Reglages-Ruche).
      // La feuille « Confier l'animation » quand l'animateur est seul dans la ruche.
      handOverNone: 'Personne d’autre n’est membre de la ruche pour l’instant.',
      iconError: 'L’icône n’a pas pu s’enregistrer. Réessaie.',
    },
    dialogs: {
      cancel: 'Annuler',
      quitTitle: 'Quitter la ruche {{hive}} ?',
      quitBody: 'Tes projets réservés à la ruche redeviennent privés.',
      // Q2 de la relecture du plan (choix de Louis du 14/11/2026).
      quitComments: 'Tes commentaires sur ses projets restent lisibles par ses membres.',
      quitSuccessor: '{{name}} animera la ruche.',
      quitLast: 'Tu en es le dernier membre : la ruche sera supprimée.',
      quit: 'Quitter',
      quitError: 'Tu n’as pas pu quitter la ruche. Réessaie.',
      removeTitle: 'Retirer {{name}} de la ruche ?',
      // Option 5 des planches.
      removeBody:
        'Ses projets réservés à la ruche redeviennent privés. Son Activité le lui dira, sans dire qui.',
      remove: 'Retirer',
      removeError: 'Ce membre n’a pas pu être retiré. Réessaie.',
      deleteTitle: 'Supprimer la ruche {{hive}} ?',
      deleteBody_one: 'Son projet réservé redevient privé, pour son auteur. Ça ne s’annule pas.',
      deleteBody_other:
        'Ses {{count}} projets réservés redeviennent privés, pour leurs auteurs. Ça ne s’annule pas.',
      deleteBodyNone: 'Ça ne s’annule pas.',
      delete: 'Supprimer',
      deleteError: 'La ruche n’a pas pu être supprimée. Réessaie.',
      handOverTitle: 'Confier l’animation à {{name}} ?',
      handOverBody: '{{name}} animera la ruche ; tu en resteras membre.',
      handOver: 'Confier',
      handOverError: 'L’animation n’a pas pu être confiée. Réessaie.',
    },
    // Le sélecteur du Fil (F-Fil13) : des onglets.
    pills: {
      label: 'Ruches du fil',
      all: 'Tout',
    },
    // La colonne de droite du Fil, sur ordinateur (F-Fil11).
    side: 'Tes ruches',
  },
  // R3 : l'onglet Moi, sa propre page de membre (planche R3-Moi).
  me: {
    editProfile: 'Modifier mon profil',
    myProjects: 'Mes projets',
  },
  // R11 (planche R11-Mes-Commentaires) : tous ses commentaires et réponses, depuis « Mes données ».
  // La fenêtre de suppression est celle du fil d'un projet (`project.comments.deleteTitle`,
  // `deleteBody`, `deleteBodyReplies` pour une racine qui a des réponses, U5) ; ses marques aussi
  // (`hiddenByAuthor`, `removedPlaceholder`).
  myComments: {
    title: 'Mes commentaires',
    empty: 'Tu n’as encore écrit aucun commentaire.',
    // U5 : un projet que le membre ne voit plus ne nomme personne.
    projectGone: 'Projet qui n’est plus visible',
    /** Au-dessus d'une réponse ; jamais le nom de qui a écrit le commentaire d'origine (S-C3). */
    reply: 'Réponse',
    // Le nom lu d'une ligne qui ouvre le commentaire à sa place dans le fil du projet.
    open: 'Ton commentaire sur {{title}} : {{excerpt}}',
    openReply: 'Ta réponse sur {{title}} : {{excerpt}}',
    delete: 'Supprimer',
    // U5 : « Supprimer » décrit par son extrait.
    deleteNamed: 'Supprimer le commentaire : {{excerpt}}',
    more: 'Afficher la suite',
    moreError: 'La suite de tes commentaires n’a pas pu se charger.',
    loadError: 'Tes commentaires n’ont pas pu se charger.',
  },
  // R11 (planche R11-Mes-Retours) : ses retours et messages du coin des testeurs, groupés par projet,
  // coins fermés compris (lecture seule), jamais les messages de l'auteur d'un coin fermé.
  myFeedback: {
    title: 'Mes retours envoyés',
    empty: 'Tu n’as encore envoyé aucun retour.',
    projectGone: 'Projet qui n’est plus visible',
    openCorner: 'Ouvrir le coin',
    openCornerNamed: 'Ouvrir le coin des testeurs de {{title}}',
    closed: 'Coin fermé',
    // Option 9 des planches : qui voit quoi.
    closedNote: 'Seuls tes messages restent ici.',
    delete: 'Supprimer',
    deleteNamed: 'Supprimer le message : {{excerpt}}',
    // La fenêtre de suppression, quand l'auteur n'est plus nommé (projet qui n'est plus visible) ;
    // sinon celle du coin (`project.testers.thread.deleteBody`).
    deleteBody: 'Il disparaîtra, avec sa capture.',
    // Le même, pour un message retiré par la modération (relecture juridique de R11, T4).
    deleteBodyRemoved:
      'Il disparaîtra, avec sa capture. La décision de la modération et la copie du signalement restent gardées jusqu’à un an après la décision.',
    more: 'Afficher la suite',
    moreError: 'La suite de tes retours n’a pas pu se charger.',
    loadError: 'Tes retours n’ont pas pu se charger.',
  },
  states: {
    errorTitle: 'Cette page n’a pas pu se charger',
    signedOutTitle: 'Réservé aux membres',
    notFoundTitle: 'Page introuvable',
    notMineTitle: 'Ce projet n’est pas à toi',
    back: 'Revenir',
    home: 'Retour à l’accueil',
    seeProject: 'Voir le projet',
    expired: 'Ta session a expiré. Reconnecte-toi pour continuer.',
    /** Le lien posé à côté de « Ta session a expiré » (tranche 6c). */
    signIn: 'Me reconnecter',
  },
  // La page ouverte depuis le lien « Ne plus recevoir… » d'un e-mail (tranche 6c), sans connexion.
  // Ouvrir la page ne change rien : seul « Confirmer » coupe les e-mails. Aucune donnée du membre.
  unsubscribe: {
    title: 'Tes e‑mails',
    askRecap: 'Ne plus recevoir le récap de la semaine ?',
    askMentions: 'Ne plus recevoir les e‑mails de mentions et de réponses ?',
    confirm: 'Confirmer',
    keep: 'Garder mes e‑mails',
    doneRecap: 'Tu ne recevras plus le récap de la semaine.',
    doneMentions: 'Tu ne recevras plus d’e‑mail tout de suite quand on te mentionne ou te répond.',
    // R8 : le lien d'un e-mail « tout de suite » (planche R8-Email-TdS) : « Dans le récap » coché.
    titleInstant: 'Tes e‑mails tout de suite',
    askInstant:
      'Les types que tu as réglés sur « Tout de suite » t’arrivent par e‑mail dès qu’il se passe quelque chose. Que deviennent-ils ?',
    choiceDigest: 'Dans le récap',
    choiceDigestHint: 'Le dimanche à 10 h, avec le reste de ta semaine.',
    choiceNever: 'Jamais',
    choiceNeverHint: 'Tout reste dans l’Activité de l’appli.',
    onlyConfirm: 'Ouvrir cette page ne change rien : seul « Confirmer » change tes choix.',
    doneInstantDigest:
      'C’est fait : ces types ne partent plus tout de suite, ils passent dans le récap.',
    doneInstantNever: 'C’est fait : plus aucun e‑mail pour ces types. Tout reste dans l’Activité.',
    allOff: 'Tout couper',
    allDone: 'Tu ne recevras plus aucun e‑mail de notification.',
    accountEmails:
      'Les e‑mails liés à ton compte, comme la vérification de ton adresse, continuent.',
    manage: 'Gérer mes e‑mails',
    // R11 (planche R11-Decouvertes) : le lien du récap propose aussi de couper seulement les
    // découvertes. Ouverte hors de l'appli, la page dit ce qu'elles sont (option 8).
    recapAll: 'Couper tout le récap',
    recapDiscoveries: 'Couper les découvertes',
    discoveriesHint:
      'Le récap garde le reste, sans les nouveaux projets de tes proches ni « Ils cherchent des testeurs ».',
    doneDiscoveries:
      'C’est fait : ton récap garde le reste, sans les nouveaux projets de tes proches ni « Ils cherchent des testeurs ».',
    invalidTitle: 'Lien invalide',
    invalid:
      'Ce lien ne permet pas de te désinscrire. Connecte-toi pour gérer tes e‑mails dans Mon profil.',
  },
  // L'éventail des réactions (R5a, F-Re1) : appui long sur la capsule, clic droit ou touche Menu.
  reactions: {
    fan: {
      title: 'Les réactions',
      mine: 'Ta réaction',
      remove: 'Retirer',
      removeNamed: 'Retirer {{name}}',
      // L'aide en deux temps, comme sur la planche : la 1re phrase en gras (`helpLead`), puis la suite.
      helpLead: 'Touche une réaction pour la poser.',
      help: 'Un appui long sur la capsule ouvre cet éventail, avec le nom de chacune.',
      helpOk: 'J’ai compris',
      // L'indice lu sur la capsule (ui-4) : dit qu'il existe une autre façon de l'ouvrir.
      open: 'Voir les réactions et leurs noms',
    },
  },
  // La galerie de photos d'un projet (R5a, F-Pr7).
  gallery: {
    label: 'Photos du projet',
    photoOf: 'Photo {{index}} sur {{count}}',
    // R6a : une photo décrite est lue par sa description, avec sa place (ui-M2).
    photoDescribed: '{{description}}, photo {{index}} sur {{count}}',
    count: '{{index}} sur {{count}}',
    previous: 'Photo précédente',
    next: 'Photo suivante',
    // R7b : une image d'un membre (la capture d'un retour, la photo d'un appel) s'ouvre en entier
    // au toucher ; le nom du bouton dit ce qu'il fait, puis l'image qu'il ouvre.
    enlarge: 'Voir en grand : {{description}}',
    // R9 : une photo marquée (« Retiré par la modération », vue de son auteur seul) : sa place, puis
    // la marque, dans ce que le lecteur d'écran entend.
    marked: '{{photo}}. {{mark}}',
  },
  // Partager un projet ou une page de membre (R5a, F-Pr1, F-Mb1). Le lien ne contient que l'adresse.
  share: {
    action: 'Partager',
    title: '{{title}} sur {{appName}}',
    membersOnly: 'Seuls les membres de {{appName}} pourront l’ouvrir.',
    hiveOnly: 'Seuls les membres de {{hive}} pourront l’ouvrir.',
    privateOnly: 'Ce projet est privé : le lien ne s’ouvrira que pour toi.',
    // R12 (Q18) : un projet public, ou une page publique.
    everyone: 'Tout le monde pourra l’ouvrir.',
    system: 'Partager…',
    copy: 'Copier le lien',
    copiedMembers: 'Lien copié : seuls les membres de {{appName}} pourront l’ouvrir.',
    copiedHive: 'Lien copié : seuls les membres de {{hive}} pourront l’ouvrir.',
    copiedPrivate: 'Lien copié : il ne s’ouvrira que pour toi.',
    copiedEveryone: 'Lien copié : tout le monde pourra l’ouvrir.',
    copyFailed: 'Impossible de copier le lien. Réessaie.',
    // Le menu de l'appareil a échoué (pas une annulation) : on propose l'autre chemin.
    systemFailed: 'Impossible d’ouvrir le partage. Copie le lien à la place.',
  },
  leaving: {
    title: 'Tu quittes {{appName}}',
    // R5a, le portail (F-Out1, F-Out2, jur-8, sec-B5) : le nom du site en gras suit `to`.
    to: 'Tu quittes {{appName}} pour',
    // Le titre lu de la page (h1) : la phrase entière, nom du site compris (R5a ui A2).
    toHost: 'Tu quittes {{appName}} pour {{host}}',
    from: 'La démo de {{title}}, ajoutée par {{name}}',
    warningTitle: 'Ce site n’est pas sur {{appName}}',
    warningBody:
      '{{appName}} ne vérifie ni son contenu ni qui le gère. N’y saisis jamais ton mot de passe {{appName}}, et n’y entre des informations personnelles que si tu sais à qui tu les confies.',
    open: 'Ouvrir le site',
    stay: 'Rester sur {{appName}}',
    invalid:
      'Ce lien ne peut pas être ouvert : seules les adresses https vers un site public sont acceptées.',
  },
  email: {
    // Les e-mails de notification (tranche 6c). Un membre y est nommé avec son pseudo ; aucun
    // texte d'un autre membre dans l'objet (visible sur un écran verrouillé). Chaque e-mail dit
    // pourquoi on le reçoit, et son lien de désinscription nomme ce qu'il coupe.
    manage: 'Gérer mes e‑mails',
    // Ce qui remplace une adresse écrite par un membre (`defangLinks`), dans la langue de l'e-mail.
    link: '[lien]',
    recap: {
      subject: 'Du nouveau sur {{appName}}',
      // R8 (planche R8-Recap) : le récap habillé du dimanche.
      heading: 'Ta semaine sur {{appName}}, {{name}}',
      intro: 'Voici ce qui a bougé chez toi et chez tes proches.',
      // Juridique (relecture du plan R8, décision de Louis du 12/11/2026), tel quel.
      first:
        'C’est ton premier récap. Il arrive le dimanche et montre aussi les projets publiés par les membres que tu suis, et ceux qui cherchent des testeurs. Il est activé par défaut ; tu peux le régler ou le couper dans tes réglages.',
      // Une seule fois, dans le premier récap de R8 d'un membre qui le recevait déjà.
      news: 'Nouveau : ton récap arrive le dimanche et montre aussi les projets publiés par les membres que tu suis, et ceux qui cherchent des testeurs. Tu peux le régler ou le couper dans tes réglages.',
      yourProjects: 'Tes projets',
      pillReactions_one: '{{count}} réaction',
      pillReactions_other: '{{count}} réactions',
      pillComments_one: '{{count}} commentaire',
      pillComments_other: '{{count}} commentaires',
      pillFollows_one: '{{count}} nouvel abonné',
      pillFollows_other: '{{count}} nouveaux abonnés',
      readComments: 'Lire les commentaires',
      // Titre et nom seuls, jamais l'accroche (décision de Louis du 12/11/2026).
      friendsTitle: 'Nouveaux projets de tes proches',
      viewProject: 'Voir le projet',
      testersWanted: 'Ils cherchent des testeurs',
      // Mène à la page du projet, jamais à la démo (relecture du plan sec-A4).
      tryDemo: 'Tester la démo',
      comment: '{{name}} (@{{handle}}) a commenté « {{title}} »',
      reply: '{{name}} (@{{handle}}) a répondu à ton commentaire sur « {{title}} »',
      mention: '{{name}} (@{{handle}}) parle de toi dans un commentaire sur « {{title}} »',
      more_one: 'Et {{count}} autre notification',
      more_other: 'Et {{count}} autres notifications',
      alsoLabel: 'Et aussi :',
      reactions_one: '{{count}} réaction à tes projets',
      reactions_other: '{{count}} réactions à tes projets',
      // Les nouveaux abonnés au compte, sur une ligne à part : en pastille sous le dernier projet,
      // ils se lisaient comme les abonnés de ce projet (relecture de design de R8, Louis 12/11/2026).
      // La phrase d'Activité.
      follows_one: '{{count}} personne de plus te suit',
      follows_other: '{{count}} personnes de plus te suivent',
      // R7a (juridique P4) : chaque projet mis à jour dans la semaine, son nombre et un lien. Jamais
      // le texte d'une mise à jour (sécurité A9).
      updatesTitle: 'Les projets que tu suis ou que tu testes',
      updates_one: '« {{title}} » : {{count}} mise à jour',
      updates_other: '« {{title}} » : {{count}} mises à jour',
      updatesMore_one: 'Et {{count}} autre projet',
      updatesMore_other: 'Et {{count}} autres projets',
      // R7b (juridique J12) : par projet, un nombre et un lien, jamais de texte.
      testersTitle: 'Le coin des testeurs',
      testers_one: '« {{title}} » : {{count}} nouveauté dans le coin des testeurs',
      testers_other: '« {{title}} » : {{count}} nouveautés dans le coin des testeurs',
      testersMore_one: 'Et {{count}} autre projet',
      testersMore_other: 'Et {{count}} autres projets',
      // R10 (planche R10-Recap) : le nom de la ruche en texte simple, jamais en lien ; aucune
      // vignette d'un projet réservé ; une invitation sans le nom de la ruche.
      hivesTitle: 'Dans tes ruches',
      hiveName: 'Ruche {{hive}}',
      hiveUnnamed: 'Ruche sans nom',
      hivePublished: '{{name}} a publié « {{title}} »',
      hiveUpdated: '{{name}} a mis à jour « {{title}} »',
      hiveMore_one: 'Et {{count}} autre nouveauté',
      hiveMore_other: 'Et {{count}} autres nouveautés',
      hiveInvitationsTitle: 'Invitations en attente',
      hiveInvitation: '{{name}} t’invite dans une ruche',
      hiveInvitationNoInviter: 'Une invitation dans une ruche t’attend',
      viewHives: 'Voir mes ruches',
      button: 'Voir mes notifications',
      last: 'Ce récap est le dernier pour l’instant : le prochain partira après ta prochaine visite.',
      // Juridique (relecture du plan R8), tel quel.
      reason:
        'Tu reçois ce récap le dimanche, parce qu’il est activé dans tes réglages. Il ne parle que de projets que tu peux voir dans l’appli.',
      unsubscribe: 'Ne plus recevoir ce récap',
    },
    mentions: {
      // Objet et titre vrais même quand l'e-mail ne contient que des réponses (relecture juridique).
      subject: 'Mentions et réponses sur {{appName}}',
      heading: 'Mentions et réponses',
      mention: '{{name}} (@{{handle}}) parle de toi dans un commentaire sur « {{title}} » :',
      reply: '{{name}} (@{{handle}}) a répondu à ton commentaire sur « {{title}} » :',
      button: 'Voir mes notifications',
      reason: 'Tu reçois cet e‑mail parce que tu as activé les e‑mails de mentions et de réponses.',
      unsubscribe: 'Ne plus recevoir les e‑mails de mentions et de réponses',
    },
    // R8 (planche R8-Email-TdS) : un seul e-mail regroupe tous les types réglés sur « Tout de
    // suite ». L'objet ne nomme jamais un retour du coin ; un appel ou un message du coin ne donne
    // aucun texte (le fil est privé, une messagerie le garderait).
    instant: {
      subjectComment: '{{name}} a commenté « {{title}} »',
      subjectReply: '{{name}} a répondu à ton commentaire sur « {{title}} »',
      subjectMention: '{{name}} parle de toi dans un commentaire sur « {{title}} »',
      subjectTesterCall: '{{name}} lance un appel à tester « {{title}} »',
      subjectHiveInvited: '{{name}} t’invite dans une ruche',
      subjectMore_one: '{{first}} et {{count}} autre nouveauté',
      subjectMore_other: '{{first}} et {{count}} autres nouveautés',
      // Quand la première ligne est un message du coin : un objet sans nom ni titre.
      subjectNews_one: 'Une nouveauté pour toi sur {{appName}}',
      subjectNews_other: '{{count}} nouveautés pour toi sur {{appName}}',
      heading_one: 'Une nouveauté pour toi',
      heading_other: '{{count}} nouveautés pour toi',
      intro: 'Bonjour {{name}}, voici ce qui vient d’arriver sur {{appName}}.',
      labels: {
        comment: 'Commentaire',
        reply: 'Réponse',
        mention: 'Mention',
        testers: 'Coin des testeurs',
        hives: 'Ruches',
      },
      // « Commentaire · 18 h 02 » : l'heure de Paris.
      when: '{{label}} · {{time}}',
      comment: '{{name}} (@{{handle}}) a commenté « {{title}} » :',
      reply: '{{name}} (@{{handle}}) a répondu à ton commentaire sur « {{title}} » :',
      mention: '{{name}} (@{{handle}}) parle de toi dans un commentaire sur « {{title}} » :',
      testerCall: '{{name}} (@{{handle}}) lance un appel à tester « {{title}} ».',
      testerFeedback: '{{name}} (@{{handle}}) t’a envoyé un retour sur « {{title}} ».',
      testerReplyToTester: '{{name}} (@{{handle}}) a répondu à ton retour sur « {{title}} ».',
      testerReplyToAuthor: '{{name}} (@{{handle}}) a répondu sur « {{title}} ».',
      feedbackSettled: '{{name}} (@{{handle}}) a réglé ton retour sur « {{title}} ».',
      // R10 : jamais le nom de la ruche, écrit par un membre (choix 7 du scénario).
      hiveInvited: '{{name}} (@{{handle}}) t’invite dans une ruche sur {{appName}}.',
      hiveInvitedExplain:
        'Une ruche, c’est un groupe de proches. Avant d’accepter ou de refuser, tu vois dans l’appli son nom, son icône et son nombre de membres ; ses membres et ses projets, seulement si tu la rejoins.',
      openHives: 'Voir l’invitation',
      private: 'Le fil du coin des testeurs est privé : son texte reste dans l’appli.',
      callPrivate: 'L’appel reste dans le coin des testeurs : son texte ne sort pas de l’appli.',
      seeInContext: 'Voir en contexte',
      readFeedback: 'Lire le retour',
      readReply: 'Lire la réponse',
      readCall: 'Lire l’appel',
      openCorner: 'Ouvrir le coin des testeurs',
      // {{types}} : les noms des types entre guillemets, joints par l'API (« A », « B » et « C »).
      reason_one:
        'Tu reçois cet e‑mail parce que {{types}} est réglé sur « Tout de suite » dans tes réglages. Au plus un e‑mail par heure ; ce qu’il contient ne revient pas dans le récap.',
      reason_other:
        'Tu reçois cet e‑mail parce que {{types}} sont réglés sur « Tout de suite » dans tes réglages. Au plus un e‑mail par heure ; ce qu’il contient ne revient pas dans le récap.',
      unsubscribe: 'Ne plus recevoir ces e‑mails',
    },
    // R8 : le lien vers les réglages, dans le récap et l'e-mail « tout de suite ».
    changePreferences: 'Changer mes préférences',
    footer: '{{appName}}, le réseau des projets IA entre proches. Contact : {{contactEmail}}',
    moderationAlert: {
      // Sans aucun extrait : le nombre en attente et le lien, rien de plus ne part chez l'envoyeur.
      subject: 'Signalements en attente sur {{appName}}',
      heading: 'Signalements en attente',
      body_one: '{{count}} signalement attend une décision.',
      body_other: '{{count}} signalements attendent une décision.',
      button: 'Ouvrir la modération',
      reason:
        'Tu reçois cet e‑mail parce que tu es administrateur de {{appName}}. Au plus un par heure.',
    },
    // R6b : le récap des « Autre » aux administrateurs, le lundi. Des nombres et deux liens, rien de
    // plus : ni nom d'outil, ni titre, ni auteur (relecture juridique jur-T1, option A).
    otherRecap: {
      subject: 'Les « Autre » de la semaine sur {{appName}}',
      heading: 'Les « Autre » de la semaine',
      tools_one: '{{count}} autre outil à vérifier',
      tools_other: '{{count}} autres outils à vérifier',
      projects_one: '{{count}} projet à ranger dans une catégorie',
      projects_other: '{{count}} projets à ranger dans une catégorie',
      older_one: 'Et {{count}} autre en attente depuis plus d’une semaine.',
      older_other: 'Et {{count}} autres en attente depuis plus d’une semaine.',
      toolsButton: 'Voir les outils',
      projectsButton: 'Voir les projets à ranger',
      reason:
        'Tu reçois cet e‑mail parce que tu es administrateur de {{appName}}. Le lundi, seulement s’il y a des « Autre » à voir.',
    },
    greeting: 'Bonjour {{name}},',
    verify: {
      subject: 'Active ton compte {{appName}}',
      body: 'Clique sur le bouton ci-dessous pour confirmer ton adresse et activer ton compte.',
      button: 'Activer mon compte',
      expires: 'Ce lien est valable une heure.',
      ignore: 'Si tu n’as pas créé de compte, ignore simplement ce message.',
    },
    // Vrai pour une inscription et pour un changement d'adresse avant vérification (R2, jur-B2).
    existingAccount: {
      subject: 'Quelqu’un a utilisé ton adresse sur {{appName}}',
      body: 'Quelqu’un vient d’essayer d’utiliser ton adresse pour un compte {{appName}}. Tu as déjà un compte : il te suffit de te connecter.',
      button: 'Me connecter',
      ignore: 'Si ce n’était pas toi, tu n’as rien à faire : ton compte est en sécurité.',
    },
    // R2 : le lien pour choisir un nouveau mot de passe. Il peut partir vers une adresse jamais
    // vérifiée : la salutation ne porte pas de nom (jur-2). L'adresse du lien ne contient que le jeton.
    resetPassword: {
      subject: 'Choisis un nouveau mot de passe sur {{appName}}',
      heading: 'Choisis un nouveau mot de passe',
      greeting: 'Bonjour,',
      body: 'Une demande vient d’arriver pour changer le mot de passe de ton compte {{appName}}. Pour en choisir un nouveau, utilise le bouton ci-dessous.',
      button: 'Choisir un nouveau mot de passe',
      // La durée vient du réglage du serveur (jur-4) ; la conséquence est dite avant le geste (jur-3).
      // {{duration}} est `oneHour` pour une heure, `hours` au-delà : la durée s'écrit en toutes
      // lettres (décision du 30/10/2026).
      expires:
        'Ce lien est valable {{duration}} et ne sert qu’une fois. Une fois le mot de passe changé, tous tes appareils seront déconnectés.',
      oneHour: 'une heure',
      hours: '{{hours}} heures',
      ignore: 'Si tu n’as rien demandé, ignore cet e‑mail : ton mot de passe ne change pas.',
      // Un e-mail de sécurité : il dit pourquoi il arrive, et qu'il arrive toujours (jur-1).
      reason:
        'Tu reçois cet e‑mail parce qu’une demande a été faite sur {{appName}} avec ton adresse. Les e‑mails de sécurité du compte arrivent toujours.',
      // La version texte n'a pas de bouton : ce libellé, puis l'adresse du lien en dessous.
      textLink: 'Choisir un nouveau mot de passe :',
      // R8 : la version texte ne parle pas d'un bouton.
      textBody:
        'Une demande vient d’arriver pour changer le mot de passe de ton compte {{appName}}. Pour en choisir un nouveau, ouvre le lien ci-dessous.',
    },
    // R2 : après tout changement de mot de passe (lien ou réglages), sans jamais le mot de passe.
    passwordChanged: {
      subject: 'Ton mot de passe {{appName}} a changé',
      heading: 'Ton mot de passe a changé',
      body: 'Le mot de passe de ton compte {{appName}} vient d’être changé. Tes autres appareils ont été déconnectés : il leur faudra le nouveau mot de passe.',
      // « Ce n'est pas toi ? » : d'abord reprendre la main, puis nous écrire (jur-5).
      notYou:
        'Ce n’est pas toi ? Change ton mot de passe tout de suite (Réglages, Sécurité) ou, si tu ne peux plus te connecter, choisis-en un nouveau depuis « Mot de passe oublié ? ». Puis écris-nous à {{contactEmail}}.',
      button: 'Ouvrir mes réglages',
      reason:
        'Tu reçois cet e‑mail parce que le mot de passe de ton compte a changé. Les e‑mails de sécurité du compte arrivent toujours.',
    },
    // Tranche « adresse » : le premier lien part vers l'ancienne adresse, qui doit donner son accord.
    changeEmail: {
      subject: 'Changement d’adresse sur {{appName}}',
      // La nouvelle adresse s'écrit seule sur la ligne suivante, telle que saisie (relecture J6).
      body: 'Tu as demandé à remplacer l’adresse de ton compte par :',
      // Les conséquences d'abord, la consigne ensuite, juste avant la durée et le bouton (des-E5).
      next: 'Une fois l’adresse changée, ton adresse actuelle ne servira plus à te connecter et ne recevra plus rien de {{appName}}. Confirme avec le bouton ci-dessous : un second lien partira ensuite vers la nouvelle adresse.',
      // R8 : la version texte ne parle pas d'un bouton.
      textNext:
        'Une fois l’adresse changée, ton adresse actuelle ne servira plus à te connecter et ne recevra plus rien de {{appName}}. Confirme avec le lien ci-dessous : un second lien partira ensuite vers la nouvelle adresse.',
      textLink: 'Confirmer le changement :',
      button: 'Confirmer le changement',
      expires: 'Ce lien est valable une heure.',
      // Un paragraphe normal sous le bouton, l'adresse de contact en gras (des-E4, 26/10/2026).
      // R2 (jur-5) : d'abord reprendre la main sur le compte, puis nous écrire.
      ignore:
        'Ce n’est pas toi ? Ne clique pas : rien ne changera. Mais quelqu’un connaît ton mot de passe : change-le tout de suite (Réglages, Sécurité), puis écris-nous à {{contactEmail}}.',
    },
    // … puis le second vers la nouvelle adresse, pour la vérifier.
    newEmail: {
      subject: 'Confirme ta nouvelle adresse sur {{appName}}',
      // R8 : l'e-mail a un titre.
      heading: 'Confirme ta nouvelle adresse',
      textBody:
        'Ouvre le lien ci-dessous, sur un appareil où ta session {{appName}} est ouverte, pour que cette adresse devienne celle de ton compte.',
      // Ni nom ni ancienne adresse : avec une faute de frappe, cet e-mail part chez un inconnu (S6).
      greeting: 'Bonjour,',
      body: 'Clique sur le bouton ci-dessous, sur un appareil où ta session {{appName}} est ouverte, pour que cette adresse devienne celle de ton compte.',
      button: 'Confirmer cette adresse',
      expires: 'Ce lien est valable une heure.',
      ignore:
        'Si tu n’as rien demandé, ne clique pas et ignore ce message : cette adresse ne sera rattachée à aucun compte.',
      // La version texte n'a pas de bouton : ce libellé, puis l'adresse du lien en dessous (des-E6).
      textLink: 'Confirmer cette adresse :',
    },
    // Le dernier e-mail, à l'ancienne adresse, une fois le changement fait (décision du 25/10/2026).
    emailChanged: {
      subject: 'L’adresse de ton compte {{appName}} a changé',
      body: 'L’adresse de ton compte est désormais :',
      after: 'Cette adresse-ci ne sert plus à te connecter et ne recevra plus rien de {{appName}}.',
      help: 'Ce n’était pas toi, ou tu t’es trompé·e d’adresse ? Écris-nous vite à {{contactEmail}}.',
    },
    // Tranche 7c : un seul e-mail, à la pose d'une suspension (article 17 du DSA). Ni le nom de
    // l'administrateur, ni qui a signalé.
    suspension: {
      subject: 'Ton compte {{appName}} est suspendu',
      heading: 'Ton compte est suspendu',
      body: 'Une personne de la modération a décidé de suspendre ton compte {{appName}}.',
      bodyAfterReport:
        'Après un signalement, une personne de la modération a décidé de suspendre ton compte {{appName}}.',
      until: 'La suspension dure jusqu’au {{date}} à {{time}} (heure de Paris).',
      // J5 : le texte reste vrai si la suspension est levée plus tôt.
      earlier: 'Si elle est levée plus tôt, {{appName}} te le dira.',
      indefinite:
        'La suspension dure jusqu’à nouvel ordre : la modération peut la lever à tout moment.',
      grounds: {
        illegal: 'Fondement : la loi.',
        rules: 'Fondement : les règles de {{appName}}.',
      },
      explanation: 'Explication : {{explanation}}',
      meanwhile:
        'Pendant la suspension, tu peux tout lire, supprimer tes projets, tes mises à jour, tes commentaires, tes appels et tes retours, passer un projet en privé, retirer ta bio, tes outils favoris et ta photo, quitter les testeurs d’un projet, exporter tes données ou supprimer ton compte. Tu ne peux plus publier, commenter, réagir, suivre ni rejoindre les testeurs.',
      contest:
        'Pas d’accord ? Écris-nous à {{contactEmail}} : une personne relira la décision et te répondra. Tu peux aussi saisir la justice.',
      // La salutation, sans le nom : l'e-mail ne cite que la décision (7c).
      greeting: 'Bonjour,',
    },
    // R11 (J3) : l'e-mail d'un compte sans visite depuis près de 3 ans, un mois avant sa
    // suppression. Un e-mail de service, sans promotion, envoyé même si le membre a coupé les
    // autres : il dit pourquoi, la date, que se connecter suffit, l'export, et ce qui reste chez les
    // autres. Ni jeton ni export dans l'e-mail : l'adresse a pu changer de main (S-C2) ; le bouton
    // mène à la connexion. {{date}} : la date de suppression, calculée par une seule fonction.
    inactive: {
      subject: 'Ton compte {{appName}} sera supprimé le {{date}}',
      heading: 'Ton compte sera bientôt supprimé',
      body: 'Personne ne s’est connecté à ton compte {{appName}} depuis près de 3 ans. Pour ne pas garder de données sans raison, un compte sans visite pendant 3 ans est supprimé.',
      date: 'Sans connexion d’ici là, ton compte sera supprimé le {{date}}.',
      keep: 'Pour le garder, il suffit de te connecter : rien d’autre à faire.',
      export:
        'Pour garder une copie de tes données, connecte-toi, puis ouvre Réglages, « Mes données », « Télécharger mes données ».',
      goes: 'La suppression est la même que si tu supprimais ton compte toi-même : ton profil, tes projets, tes commentaires et tes retours de testeur disparaissent.',
      remains:
        'Ce qui reste chez les autres : les réponses à tes commentaires, sans ton nom ; le nom des ruches que tu as créées, tant qu’elles ont des membres ; tes signalements, sans ton nom, jusqu’à un an après leur traitement.',
      button: 'Me connecter',
      // La version texte n'a pas de bouton : ce libellé, puis l'adresse du lien en dessous.
      textLink: 'Me connecter :',
      reason:
        'Tu reçois cet e‑mail parce que ton compte {{appName}} n’a pas servi depuis près de 3 ans. C’est un e‑mail de service : il part même si tu as coupé les autres, une seule fois avant la suppression.',
    },
    // R12 (Q14, planche R12-Visiteur-Signale) : les deux e-mails d'un visiteur qui a donné son
    // adresse en signalant : l'accusé de réception, puis la décision ; deux au plus. Aucun texte ni
    // lien venu d'un membre : la nature du contenu, le motif, la date. Personne n'est nommé
    // (« Bonjour, ») : l'adresse n'est rattachée à aucun compte.
    visitorReport: {
      greeting: 'Bonjour,',
      // Le rappel du signalement : {{kind}} est l'une des natures de `kinds`, {{reason}} un motif de
      // `report.reasons`, {{date}} et {{time}} l'envoi à l'heure de Paris.
      kind: 'Contenu : {{kind}}',
      reason: 'Motif : {{reason}}',
      sentAt: 'Envoyé le {{date}} à {{time}}',
      kinds: {
        project: 'un projet',
        update: 'une mise à jour',
        member: 'un profil',
      },
      ignore: 'Si tu n’as rien signalé, ignore cet e‑mail.',
      reasonWhy:
        'Tu reçois cet e‑mail parce que cette adresse a été donnée en signalant un contenu sur {{appName}}.',
      received: {
        subject: 'Ton signalement est bien arrivé',
        heading: 'Ton signalement est bien arrivé',
        body: 'Merci. La modération de {{appName}} va regarder ce que tu nous as signalé.',
        next: 'Un second e‑mail te dira ce qui a été décidé. Ensuite, ton adresse sera effacée.',
      },
      decided: {
        subject: 'Ton signalement a été traité',
        heading: 'Ton signalement a été traité',
        // L'issue seulement, comme la notification d'un membre (notifications.reportHandled) ;
        // `part` quand le signalement visait une partie du contenu.
        outcome: {
          project: {
            removed: 'Le projet que tu as signalé a été retiré.',
            dismissed: 'Après examen, le projet que tu as signalé n’a pas été retiré.',
          },
          update: {
            removed: 'La mise à jour que tu as signalée a été retirée.',
            dismissed: 'Après examen, la mise à jour que tu as signalée n’a pas été retirée.',
          },
          member: {
            removed: 'La modération est intervenue sur le profil que tu as signalé.',
            dismissed: 'Après examen, rien n’a changé sur le profil que tu as signalé.',
          },
          part: {
            removed: 'La partie que tu as signalée a été retirée.',
            dismissed: 'Après examen, la partie que tu as signalée n’a pas été retirée.',
          },
        },
        contest: 'Pas d’accord ? Écris à {{contactEmail}} ; tu peux aussi saisir la justice.',
        // Q14 : l'adresse est effacée une fois cet e-mail envoyé.
        erased:
          'Ton adresse est maintenant effacée : c’est le dernier e‑mail de {{appName}} sur ce signalement.',
      },
    },
    // R11 : le pied commun des e-mails ajoute l'adresse de la page Confidentialité, en texte.
    privacy: 'Confidentialité : {{url}}',
  },
  // R8 (planche R8-Reglages) : l'écran « Notifications » des réglages.
  notificationSettings: {
    title: 'Notifications',
    // L'exemple en tête, sans nom (A3) ; « {{appName}} · maintenant » imite l'en-tête d'une
    // notification du téléphone.
    exampleSource: '{{appName}} · maintenant',
    exampleText: '12 réactions sur <b>Raconte-moi un tableau</b>',
    inApp: 'Dans l’appli, tout arrive dans l’Activité. Réactions et abonnés : combien, jamais qui.',
    phone: 'Sur ce téléphone',
    soon: 'Bientôt',
    byEmail: 'Par e‑mail',
    types: {
      reactions: 'Réactions',
      comments: 'Commentaires sur tes projets',
      replies: 'Réponses et mentions',
      follows: 'Nouveaux abonnés',
      updates: 'Mises à jour suivies',
      testers: 'Coin des testeurs',
      hives: 'Ruches',
      // R11 (planche R11-Decouvertes, option 8) : les nouveaux projets des proches et « Ils
      // cherchent des testeurs », dans le récap ; « Dans le récap » ou « Jamais », sans phrase d'aide.
      discoveries: 'Découvertes',
    },
    choices: { now: 'Tout de suite', digest: 'Dans le récap', never: 'Jamais' },
    // Le nom lu d'une ligne de choix : son libellé, puis son choix actuel.
    rowName: '{{label}}, {{choice}}',
    recap: 'Le récap',
    recapHint: 'Le dimanche à 10 h, s’il y a du nouveau',
    // Sous un type « Dans le récap » quand le récap est coupé ; son choix ne change pas.
    recapOff: 'Le récap est coupé : rien ne part',
    security: 'Les e‑mails de sécurité du compte arrivent toujours.',
    saveError: 'Ce choix n’a pas pu s’enregistrer. Réessaie.',
    loadError: 'Tes réglages d’e‑mail n’ont pas pu se charger.',
  },
  feed: {
    label: 'Le fil',
    errorTitle: 'Le fil n’a pas pu se charger',
    nobodyTitle: 'Tu ne suis personne pour l’instant',
    nobodyBody: 'Suis des membres depuis leur page : leurs nouveaux projets arriveront ici.',
    // R3 : « Découvrir » est devenu l'onglet Explorer ; le fil vide y mène.
    nobodyAction: 'Explorer les projets',
    discoverEmpty: 'Aucun projet publié pour l’instant.',
    testersEmpty: 'Aucun projet ne cherche de testeurs pour l’instant.',
    testersCaption:
      'Les projets à essayer : les personnes qui les ont publiés attendent tes retours.',
    more: 'Afficher la suite',
    moreError: 'La suite du fil n’a pas pu se charger.',
    news_one: '{{count}} nouveauté',
    news_other: '{{count}} nouveautés',
    newsMany: '{{max}} nouveautés ou plus',
    // R4 (F-Fil4) : le bouton des nouveautés dit ce qui est arrivé ; « nouveautés » quand il y a
    // des projets et des notes. Au plafond de la liste, « ou plus » (relecture de l'interface).
    newProjects_one: '{{count}} nouveau projet',
    newProjects_other: '{{count}} nouveaux projets',
    newProjectsMany: '{{max}} nouveaux projets ou plus',
    // R7a : « 2 mises à jour » ; « nouveautés » quand il y a aussi de nouveaux projets.
    newUpdates_one: '{{count}} mise à jour',
    newUpdates_other: '{{count}} mises à jour',
    newUpdatesMany: '{{max}} mises à jour ou plus',
    // R7a : la carte remontée par sa mise à jour (planche R7-MAJ-Fil) ; « Mis à jour » seul sans
    // version. « et 2 autres changements » ne se coupe jamais (interface A7).
    updated: 'Mis à jour · {{version}}',
    updatedPlain: 'Mis à jour',
    moreChanges_one: 'et {{count}} autre changement',
    moreChanges_other: 'et {{count}} autres changements',
    newMixed_one: '{{count}} nouveauté',
    newMixed_other: '{{count}} nouveautés',
    newMixedMany: '{{max}} nouveautés ou plus',
    /** Le titre du Fil (R4), posé par `Screen`, avec le bouton des nouveautés à côté sur ordinateur. */
    title: 'Fil',
    // R4 (F-Fil5, planche R4-Fil-AJour) : la sphère de miel, avant le premier élément déjà vu.
    upToDate: {
      title: 'Tu es à jour',
      /** Un bouton secondaire : le message reste « tu peux t'arrêter » (jur-J9). */
      action: 'Explorer d’autres projets',
      hint: 'Les nouveautés s’afficheront en haut du fil.',
    },
    // R4 (F-Fil9, planche R4-Fil-Premier) : un membre qui ne suit encore personne.
    firstRun: {
      hello: 'Bonjour {{name}} !',
      body: 'Suis des proches pour voir leurs projets ici.',
    },
    /** Les rubriques de la colonne de droite, sur ordinateur (F-Fil11). */
    side: {
      suggestions: 'Proches à suivre',
      testers: 'Ils cherchent des testeurs',
    },
  },
  // R4 (F-Fil10) : « Proches à suivre ». Aucune preuve sociale sur une ligne (ni « suivi par », ni
  // nombre d'abonnés : jur-J5). « Suivre » reprend follow.member et follow.memberFollowing.
  suggestions: {
    title: 'Proches à suivre',
    /** Le nom lu du « × » d'une ligne. */
    dismiss: 'Ne plus suggérer {{name}}',
    /** Le texte du bouton une fois le membre suivi, avec sa coche. */
    following: 'Tu suis',
    /** Le message après « × », avec « Annuler » pendant 5 secondes (jur-J8, Louis, 31/10/2026). */
    dismissed: 'Tu ne verras plus {{name}} ici.',
    undo: 'Annuler',
    dismissError: 'La suggestion n’a pas pu être retirée. Réessaie.',
    loadError: 'Les proches à suivre n’ont pas pu se charger.',
  },
  // R4 : l'encart en pointillés sous « Proches à suivre », au premier lancement.
  publishPrompt: {
    title: 'Ou publie ton premier projet.',
    action: 'Publier',
  },
  // R4 (F-Fil3) : les dates relatives, à l'heure de Paris. Au-delà de 7 jours, la date courte vient
  // d'`Intl` (« 12 oct. ») ; le jour de la semaine aussi (« mardi »).
  dates: {
    now: 'à l’instant',
    minutes_one: 'il y a {{count}} min',
    minutes_other: 'il y a {{count}} min',
    hours_one: 'il y a {{count}} h',
    hours_other: 'il y a {{count}} h',
    yesterday: 'hier',
    // La forme posée après un verbe (« publié mardi », « publié le 12 oct. » : relecture ui-B2).
    onDay: '{{day}}',
    onDate: 'le {{date}}',
  },
  // R4 (F-Fil2) : la carte du fil. « ✦ 49 » se lit ainsi ; le symbole n'est pas lu.
  card: {
    reactions_one: '{{count}} réaction',
    reactions_other: '{{count}} réactions',
    // R6a : la catégorie de la carte, lue dans la description du lien (ui-I5).
    category: 'Catégorie : {{category}}',
  },
  follow: {
    follow: 'Suivre',
    following: 'Suivi',
    member: 'Suivre {{name}}',
    // R3 (planches) : « Tu suis Nora », dans la pastille d'Explorer comme sur sa page.
    memberFollowing: 'Tu suis {{name}}',
    project: 'Suivre ce projet',
    projectFollowing: 'Projet suivi',
    followers_one: '{{count}} abonné',
    followers_other: '{{count}} abonnés',
    error: 'L’abonnement n’a pas pu être enregistré. Réessaie.',
  },
  // Tranche 6b : les notifications dans l'appli. Jamais le nom de qui a réagi ou suit.
  notifications: {
    // R8 : la page s'appelle « Activité » ; la cloche garde son nom.
    title: 'Activité',
    bell: 'Notifications',
    bellNew_one: 'Notifications, {{count}} nouvelle',
    bellNew_other: 'Notifications, {{count}} nouvelles',
    bellNewMany: 'Notifications, plus de {{max}} nouvelles',
    new: 'Nouveau',
    emptyTitle: 'Pas encore de notification',
    empty:
      'Les commentaires, les réactions et les mises à jour des projets que tu suis arriveront ici.',
    // Un compte suspendu ne publie pas : l'état vide propose de lire (7c).
    emptyActionSuspended: 'Explorer les projets',
    emptyAction: 'Publier un projet',
    // R8 (planche R8-Activite-Vide) : le second bouton de l'état vide.
    emptyExplore: 'Explorer des projets',
    // R8 : les sections, en jours de Paris (décision de Louis du 12/11/2026).
    sections: { today: 'Aujourd’hui', week: 'Cette semaine', earlier: 'Plus tôt' },
    // Sur ordinateur : éteint tout de suite le miel de la page.
    markAllRead: 'Tout marquer comme lu',
    // Lu par les lecteurs d'écran après l'appui, sans être montré : seul le miel s'éteint à l'œil
    // (relecture de l'interface de R8, Louis 12/11/2026).
    allMarkedRead: 'Tout est marqué comme lu.',
    // La roue de la barre du haut (bouton à icône seule : ce texte est son nom).
    settings: 'Régler les notifications',
    // R8 : chaque phrase est une seule clé ; <b>…</b> marque ce qui s'écrit en gras (noms, titres),
    // <v>…</v> une version. L'appli découpe ces marques (notifications/marks.ts), qu'aucun texte de
    // membre ne peut contenir : les noms et titres remplissent {{…}} après le découpage.
    updateMore_one: '{{line}}, et {{count}} autre changement',
    updateMore_other: '{{line}}, et {{count}} autres changements',
    // R8 : les deux notifications du catalogue, signées par l'équipe, jamais par l'administrateur.
    projectCategory:
      'L’équipe de {{appName}} a rangé « <b>{{title}}</b> » dans <b>{{category}}</b>',
    toolAdded: '« <b>{{name}}</b> » fait maintenant partie des outils de {{appName}}',
    toolMerged: '« <b>{{name}}</b> » s’affiche maintenant comme « <b>{{tool}}</b> »',
    // R10 : les lignes des ruches (planche R10-Activite).
    hiveInvited: '<b>{{name}}</b> t’invite dans la ruche <b>{{hive}}</b>',
    hiveInvitedNoInviter: 'Une invitation t’attend dans la ruche <b>{{hive}}</b>',
    hiveJoined: '<b>{{name}}</b> a rejoint <b>{{hive}}</b>',
    hiveRemoved: 'Tu ne fais plus partie de la ruche <b>{{hive}}</b>.',
    hiveAnimator: 'Tu animes maintenant la ruche <b>{{hive}}</b>.',
    hiveDeleted: 'La ruche <b>{{hive}}</b> a été supprimée.',
    // Option 7 des planches : la seconde ligne du retrait et de la suppression.
    hivePrivateAgain: 'Tes projets réservés à la ruche sont redevenus privés.',
    // R12 (planche R12-Vitrine, encart) : un projet mis sur l'accueil par la modération ; son auteur
    // peut l'en retirer (Q9). Signé de {{appName}}, jamais de l'administrateur.
    showcaseAdded: '<b>{{title}}</b> est sur l’accueil de {{appName}}',
    // Relecture juridique R12, point 1 : la même ligne, au passé, quand le projet n'est plus sur
    // l'accueil (refus de l'auteur, retrait, sortie de « Public ») : un texte d'état change avec lui.
    showcaseWas: '<b>{{title}}</b> a été sur l’accueil de {{appName}}',
    showcaseLeave: 'Retirer de l’accueil',
    showcaseLeft: 'Ton projet a quitté l’accueil. Il reste public.',
    showcaseLeaveError: 'Le projet n’a pas pu quitter l’accueil. Réessaie.',
    // R8 : la colonne de droite sur ordinateur.
    emailColumn: {
      title: 'Ce que tu reçois par e‑mail',
      settings: 'Régler les notifications',
    },
    // La phrase de la colonne (email/summary.ts) : {{types}} est une liste comme « les réponses et
    // les mentions », dont l'appli met la première lettre en capitale.
    summary: {
      nowAndRest: '{{types}} tout de suite ; le reste dans le récap du dimanche, à 10 h.',
      nowAndSome:
        '{{types}} tout de suite ; une partie du reste dans le récap du dimanche, à 10 h.',
      nowOnly: '{{types}} tout de suite ; le reste seulement dans l’Activité.',
      recapAll: 'Tout dans le récap du dimanche, à 10 h.',
      recapSome:
        'Une partie dans le récap du dimanche, à 10 h ; le reste seulement dans l’Activité.',
      nothing: 'Aucun e‑mail de notification : tout reste dans l’Activité.',
      // Le récap activé apporte toujours les nouveaux projets des proches, même quand aucun type n'y
      // passe : « rien ne part » serait faux (relecture juridique de R8, Louis 12/11/2026).
      nothingFriends:
        'Aucun e‑mail pour tes notifications ; le récap du dimanche t’apporte seulement les nouveaux projets de tes proches.',
      nowFriends:
        '{{types}} tout de suite ; le récap du dimanche t’apporte seulement les nouveaux projets de tes proches.',
      // R10, relecture juridique (C3) : « Dans tes ruches » part dans le récap dès que « Ruches »
      // n'est pas à « Jamais », même à « Tout de suite », qui ne vaut que pour les invitations.
      nowFriendsHives:
        '{{types}} tout de suite ; le récap du dimanche t’apporte seulement les nouveaux projets de tes proches et les nouveautés de tes ruches.',
      hivesNow:
        'Pour les ruches, « Tout de suite » ne vaut que pour les invitations : leurs nouveautés vont dans le récap du dimanche.',
      hivesNowRecapOff:
        'Pour les ruches, « Tout de suite » ne vaut que pour les invitations : le récap coupé, leurs nouveautés ne partent pas par e‑mail.',
      types: {
        reactions: 'les réactions',
        comments: 'les commentaires sur tes projets',
        replies: 'les réponses et les mentions',
        follows: 'les nouveaux abonnés',
        updates: 'les mises à jour suivies',
        testers: 'le coin des testeurs',
        hives: 'les ruches',
      },
    },
    more: 'Afficher la suite',
    moreError: 'La suite des notifications n’a pas pu se charger.',
    errorTitle: 'Les notifications n’ont pas pu se charger',
    reactions_one: '{{count}} réaction sur <b>{{title}}</b>',
    reactions_other: '{{count}} réactions sur <b>{{title}}</b>',
    reactionCount: '{{reaction}} ×{{count}}',
    comment: '<b>{{name}}</b> a commenté <b>{{title}}</b>',
    mention: '<b>{{name}}</b> parle de toi dans un commentaire sur <b>{{title}}</b>',
    reply: '<b>{{name}}</b> a répondu à ton commentaire sur <b>{{title}}</b>',
    // R7a : une mise à jour d'un projet qu'on suit ou qu'on teste ; sa première ligne en dessous.
    // R8 (planche R8-Activite) : une icône, le projet nommé, pas l'auteur.
    projectUpdate: '<b>{{title}}</b> a une mise à jour',
    projectUpdateVersion: '<b>{{title}}</b> a une mise à jour <v>{{version}}</v>',
    // R7b : le coin des testeurs.
    testerCall: '<b>{{name}}</b> lance un appel à tester <b>{{title}}</b>',
    testerFeedback: '<b>{{name}}</b> t’a envoyé un retour sur <b>{{title}}</b>',
    testerReplyToTester: '<b>{{name}}</b> a répondu à ton retour sur <b>{{title}}</b>',
    testerReplyToAuthor: '<b>{{name}}</b> a répondu sur <b>{{title}}</b>',
    feedbackSettled: '<b>{{name}}</b> a réglé ton retour sur <b>{{title}}</b>',
    feedbackSettledVersion:
      '<b>{{name}}</b> a réglé ton retour dans la <v>{{version}}</v> de <b>{{title}}</b>',
    feedbackSettledUpdate:
      '<b>{{name}}</b> a réglé ton retour dans la mise à jour du {{date}} de <b>{{title}}</b>',
    memberFollows_one: '{{count}} personne de plus te suit',
    memberFollows_other: '{{count}} personnes de plus te suivent',
    projectFollows_one: '{{count}} personne de plus suit <b>{{title}}</b>',
    projectFollows_other: '{{count}} personnes de plus suivent <b>{{title}}</b>',
    hidden:
      'Ton commentaire sur <b>{{title}}</b> a été masqué par la personne qui a publié le projet. Il reste visible pour toi et pour cette personne.',
    handle: 'Ton pseudo est @{{handle}}, tiré de ton nom. Tu peux le changer dans Mon profil.',
    removed: {
      project: 'Ton projet <b>{{title}}</b> a été retiré par la modération',
      note: 'Ta note sur <b>{{title}}</b> a été retirée par la modération',
      // juridique (T1 de R7a), mot pour mot (R8 : le titre en gras plutôt qu'entre guillemets).
      update: 'Ta mise à jour de <b>{{title}}</b> a été retirée par la modération',
      comment: 'Ton commentaire sur <b>{{title}}</b> a été retiré par la modération',
      // Tranche 7b, règle 9 : sur le projet d'un membre qui t'a bloqué, ni titre ni lien.
      commentElsewhere: 'Ton commentaire a été retiré par la modération',
      // R7b.
      call: 'Ton appel à tester <b>{{title}}</b> a été retiré par la modération',
      message: 'Ton message sur <b>{{title}}</b> a été retiré par la modération',
      hive: 'Le nom de ta ruche a été retiré par la modération',
      // R10, relecture juridique (C2) : la ruche renommée depuis se nomme par son nom actuel.
      hiveRenamed: 'L’ancien nom de ta ruche <b>{{hive}}</b> a été retiré par la modération',
    },
    reportHandled: {
      // L'issue seulement : ni titre, ni extrait, ni auteur (relecture de sécurité du plan 7a).
      project: {
        removed: 'Ton signalement d’un projet a été traité : le projet a été retiré.',
        dismissed: 'Ton signalement d’un projet a été traité : nous ne l’avons pas retiré.',
      },
      note: {
        removed: 'Ton signalement d’une note a été traité : la note a été retirée.',
        dismissed: 'Ton signalement d’une note a été traité : nous ne l’avons pas retirée.',
      },
      // R7a : « note » reste pour les signalements d'avant l'effacement des notes.
      update: {
        removed: 'Ton signalement d’une mise à jour a été traité : la mise à jour a été retirée.',
        dismissed: 'Ton signalement d’une mise à jour a été traité : nous ne l’avons pas retirée.',
      },
      comment: {
        removed: 'Ton signalement d’un commentaire a été traité : le commentaire a été retiré.',
        dismissed: 'Ton signalement d’un commentaire a été traité : nous ne l’avons pas retiré.',
      },
      member: {
        removed: 'Ton signalement d’un profil a été traité : la modération est intervenue.',
        dismissed: 'Ton signalement d’un profil a été traité : nous n’avons rien changé.',
      },
      // R7b.
      call: {
        removed: 'Ton signalement d’un appel à tester a été traité : l’appel a été retiré.',
        dismissed: 'Ton signalement d’un appel à tester a été traité : nous ne l’avons pas retiré.',
      },
      message: {
        removed: 'Ton signalement d’un message a été traité : le message a été retiré.',
        dismissed: 'Ton signalement d’un message a été traité : nous ne l’avons pas retiré.',
      },
      // R10.
      hive: {
        removed: 'Ton signalement d’une ruche a été traité : son nom a été retiré.',
        dismissed: 'Ton signalement d’une ruche a été traité : nous n’avons rien changé.',
      },
      // R9 (relectures, 14/11/2026) : le signalement ne visait qu'une partie du contenu.
      part: {
        removed: 'Ton signalement a été traité : la partie que tu as signalée a été retirée.',
        dismissed:
          'Ton signalement a été traité : nous n’avons pas retiré la partie que tu as signalée.',
      },
      contest: 'Pas d’accord ? Écris-nous : {{contactEmail}}',
    },
    // Tranche 7c : la suspension de son compte, et sa fin.
    suspended: 'Ton compte a été suspendu jusqu’au {{date}} à {{time}} (heure de Paris)',
    suspendedIndefinite: 'Ton compte a été suspendu jusqu’à nouvel ordre',
    suspensionEnded: {
      ended: 'Ta suspension a pris fin : tu peux de nouveau publier et interagir.',
      lifted: 'Ta suspension a été levée : tu peux de nouveau publier et interagir.',
      // R9 (jur-R6, décision L1 de Louis, 13/11/2026).
      liftedError:
        'Ta suspension a été levée : c’était une erreur de la modération. Tu peux de nouveau publier et interagir.',
    },
    // R9 : une partie retirée, une partie du profil retirée, un rétablissement (signé l'équipe).
    removedPart: {
      description: 'La description de <b>{{title}}</b> a été retirée par la modération',
      tools: 'Les outils de <b>{{title}}</b> ont été retirés par la modération',
      demoUrl: 'Le lien de la démo de <b>{{title}}</b> a été retiré par la modération',
      cover: 'La couverture de <b>{{title}}</b> a été retirée par la modération',
      photo: 'La {{rank}} photo de <b>{{title}}</b> a été retirée par la modération',
      photoDescription:
        'La description de la {{rank}} photo de <b>{{title}}</b> a été retirée par la modération',
      prompt: 'Le prompt de départ de <b>{{title}}</b> a été retiré par la modération',
      updatePhoto:
        'Une photo de ta mise à jour de <b>{{title}}</b> a été retirée par la modération',
      capture: 'La capture de ton message sur <b>{{title}}</b> a été retirée par la modération',
      callPhoto: 'La photo de ton appel à tester <b>{{title}}</b> a été retirée par la modération',
    },
    profileRemoved: {
      name: 'Ton nom a été retiré : tu t’appelles <b>{{replacedBy}}</b> jusqu’à ce que tu en choisisses un autre',
      handle:
        'Ton pseudo a été retiré : tu es <b>@{{replacedBy}}</b> jusqu’à ce que tu en choisisses un autre',
      bio: 'Ta bio a été retirée par la modération',
      favoriteTools: 'Tes outils favoris ont été retirés par la modération',
      avatar: 'Ta photo de profil a été retirée par la modération',
    },
    chooseHandle: 'Choisir un pseudo',
    chooseName: 'Choisir un nom',
    contest: 'Contester',
    restored: {
      project: 'Ton projet <b>{{title}}</b> est de nouveau visible',
      update: 'Ta mise à jour de <b>{{title}}</b> est de nouveau visible',
      comment: 'Ton commentaire sur <b>{{title}}</b> est de nouveau visible',
      commentElsewhere: 'Ton commentaire est de nouveau visible',
      call: 'Ton appel à tester <b>{{title}}</b> est de nouveau visible',
      message: 'Ton message sur <b>{{title}}</b> est de nouveau visible',
      hive: 'Le nom de ta ruche <b>{{hive}}</b> est de nouveau visible',
      part: '{{part}} de <b>{{title}}</b> est de nouveau visible',
      bio: 'Ta bio est de nouveau visible',
      favoriteTools: 'Tes outils favoris sont de nouveau visibles',
      avatar: 'Ta photo de profil est de nouveau visible',
      // Décision L3 de Louis (13/11/2026).
      handleBack: 'La modération a annulé le retrait de ton pseudo : @{{handle}} t’est rendu.',
      handleNotBack:
        'La modération a annulé le retrait de ton pseudo. L’ancien ne peut pas revenir : tu gardes @{{handle}}, que tu peux changer dans ton profil.',
      nameBack: 'La modération a annulé le retrait de ton nom : il t’est rendu.',
      nameNotBack:
        'La modération a annulé le retrait de ton nom. L’ancien ne peut pas revenir : tu gardes celui que tu as choisi, que tu peux changer dans ton profil.',
    },
    team: 'L’équipe de {{appName}}',
    // R19 (planche R19-Activite) : les avis de la récolte, dans l'Activité seulement (jamais
    // d'e-mail immédiat ni de notification poussée), coupés par le réglage « Ma récolte ».
    gameLevel: 'Tu passes au niveau {{level}}',
    gameSeal: 'Nouveau sceau : <b>{{seal}}</b>',
    // Le nom de la ruche se lit à l'affichage (relecture juridique du plan, J2) : retiré par la
    // modération, la ligne ne le nomme plus.
    gameHiveChallenge: 'La ruche <b>{{hive}}</b> a réussi son défi',
    gameHiveChallengeUnnamed: 'Une de tes ruches a réussi son défi',
    // La seconde ligne, pour qui y a participé ; les autres lisent le défi seul, sans le dire.
    gameHiveChallengeHoney: '{{challenge}} · +{{honey}} miel',
    gameHoneyGift: '<b>{{name}}</b> t’a offert du miel pour <b>{{title}}</b>',
    // Relecture juridique du plan (J1) : une fois par compte. « Les membres qui te suivent » : le
    // classement des proches liste ceux qu'on suit (décision de Louis du 23/11/2026).
    gameIntro:
      'Nouveau : ta récolte. Tes gestes rapportent du pollen ; ton niveau, ton titre et tes sceaux se voient sur ton profil. Ton pollen de la semaine paraît dans les classements des membres qui te suivent et de tes ruches ; tu peux t’en retirer dans Réglages, « Apparence », « Classements ».',
  },
  // R19 (scénario « La gamification », planches R19-* validées par Louis le 23/11/2026) : la
  // récolte d'un membre. Les titres ont deux formes en français (_f par défaut, _m au choix du
  // réglage « Forme ») ; en anglais, les deux clés portent la même forme. Rien ne culpabilise :
  // jamais « 0 », jamais « tu vas perdre », et aucune phrase ne promet que le pollen « ne baisse
  // jamais » sans l'exception de la modération (relecture juridique du plan, J5). Le pollen et le
  // miel ne prennent pas de « s » : « 85 pollen », « 35 miel ».
  game: {
    titles: {
      forager_f: 'Butineuse',
      forager_m: 'Butineur',
      builder_f: 'Bâtisseuse',
      builder_m: 'Bâtisseur',
      keeper_f: 'Gardienne',
      keeper_m: 'Gardien',
      dancer_f: 'Danseuse',
      dancer_m: 'Danseur',
      // Réservé aux Éclaireuses (R20) : jamais attribué en R19.
      scout_f: 'Éclaireuse',
      scout_m: 'Éclaireur',
    },
    // Option a15 des planches : sur « Ma récolte », les familles se nomment par leurs gestes ; les
    // titres restent au profil. Bâtisseuse compte aussi ce qui est reçu sur ses projets.
    families: {
      forager: 'Commentaires et réactions',
      builder: 'Projets et mises à jour',
      keeper: 'Tests et retours',
      dancer: 'Ruches et invitations',
    },
    // Le panneau du niveau (HarvestPanel), sur le profil et « Ma récolte » ; « Niveau 5 » est aussi
    // l'annonce polie du passage de niveau.
    level: 'Niveau {{level}}',
    toNext: '{{count}} pollen avant le niveau {{next}}',
    honey: '{{amount}} miel',
    // Option a10 : jusqu'à la visite suivante, sans félicitation.
    new: 'Nouveau',
    weeks_one: '{{count}} semaine butinée',
    weeks_other: '{{count}} semaines butinées',
    hibernating: 'La série hiverne',
    // Option a11 : un nouveau membre, à la place de la série.
    newcomer: 'Tester, commenter, encourager un proche : chaque geste rapporte du pollen.',
    // Le rayon (HoneyComb), une barre de progression : son nom, et la valeur lue sur la page d'un
    // proche, qui ne montre pas la phrase de pollen (option a5).
    comb: {
      mine: 'Mon rayon',
      theirs: 'Son rayon',
      cells_one: '{{count}} alvéole sur 10 vers le niveau {{next}}',
      cells_other: '{{count}} alvéoles sur 10 vers le niveau {{next}}',
    },
    // La pastille près du bouton du geste (cachée au lecteur d'écran), puis son annonce polie.
    gain: '+{{amount}} pollen',
    gained_one: '{{count}} pollen gagné.',
    gained_other: '{{count}} pollen gagnés.',
    // La page « Ma récolte », rubriques dans l'ordre de la planche R19-Recolte.
    harvest: {
      title: 'Ma récolte',
      loadError: 'Ta récolte n’a pas pu se charger.',
      week: {
        title: 'Cette semaine',
        foraged: 'Semaine butinée',
        total: '{{amount}} pollen',
        // Le nom lu d'une barre de FamilyBars.
        family: '{{family}}, {{amount}} pollen',
        // J5 : un contenu retiré par la modération reprend son pollen, le niveau peut donc baisser.
        help: 'Le pollen fait monter de niveau. Il ne se perd pas, sauf celui d’un contenu retiré par la modération.',
      },
      // Le défi perso : choisi toute la semaine (Louis, 23/11) ; la puce dit le miel, sans aide qui
      // le redise (relecture d'interface du plan, UI-5).
      challenge: {
        title: 'Mon défi',
        chooseTitle: 'Choisis ton défi',
        price: '{{amount}} miel',
        reward: '+{{amount}} miel',
        confirm: 'Choisir ce défi',
        skip: 'Pas cette semaine',
        none: 'Pas de défi cette semaine.',
        chooseAgain: 'Choisir un défi',
        progress: '{{progress}} sur {{target}}',
        done: 'Défi réussi',
        error: 'Ce choix n’a pas pu s’enregistrer. Réessaie.',
      },
      hives: 'Défis de mes ruches',
      rankings: {
        title: 'Classement de la semaine',
        open: 'Voir le classement',
        // Option b6 : retiré, la phrase remplace la rubrique, et « Changer ce choix » mène aux réglages.
        off: 'Tu as choisi de ne pas apparaître dans les classements : tu ne les vois pas non plus. Ton pollen et ton niveau restent.',
        change: 'Changer ce choix',
      },
      honey: {
        title: 'Mon miel',
        help: '5 par semaine butinée, 10 par défi réussi.',
        offer: 'Offrir du miel',
        offerHint: '5 miel, au projet d’un proche',
        decorate: 'Décorer mon rayon',
        decorateHint: 'Une teinte, un motif de cire',
      },
      seals: {
        mine: 'Mes sceaux · {{count}}',
        theirs: 'Ses sceaux · {{count}}',
        // Option a4 : pas de vitrine des sceaux manquants, une ligne sobre.
        more: 'D’autres sceaux restent à découvrir.',
        earned: 'Gagné le {{date}}',
      },
    },
    // Les défis, par leur code (packages/contracts/src/game.ts).
    challenges: {
      personal: {
        feedback: 'Fais un retour sur un projet',
        update: 'Publie une mise à jour',
        test: 'Teste le projet d’un proche',
        comment_3: 'Commente 3 projets de tes proches',
        react_5: 'Réagis à 5 projets',
      },
      hive: {
        feedback_5: '5 retours entre vous',
        updates_3: '3 mises à jour entre vous',
        tested_3: '3 projets testés entre vous',
        reactions_10: '10 réactions entre vous',
        comments_5: '5 commentaires entre vous',
      },
      // La carte de la page d'une ruche (titre de niveau 2), qui ne dit jamais qui n'a rien fait.
      hiveTitle: 'Défi de la semaine',
    },
    // Les sceaux, par leur code. Noms neutres (Louis, 23/11) : « Cuisine explorée », jamais
    // « Exploratrice ». Un sceau de catégorie par catégorie de départ, « Autre » exclue ; une
    // catégorie créée ensuite par un administrateur prend `categoryOther`.
    seals: {
      first_project: 'Premier envol',
      first_update: 'Première mise à jour',
      first_feedback: 'Premier retour',
      first_settled: 'Premier retour réglé',
      tested_10: '10 projets testés',
      feedback_10: '10 retours',
      first_hive: 'Première ruche',
      hive_5: 'Ruche de 5',
      invitations_5: '5 invitations acceptées',
      weeks_10: '10 semaines butinées',
      weeks_25: '25 semaines butinées',
      category: {
        'home-garden': 'Jardin exploré',
        cooking: 'Cuisine explorée',
        family: 'Familles explorées',
        learning: 'Savoir exploré',
        games: 'Jeux explorés',
        art: 'Arts explorés',
        music: 'Musique explorée',
        'photo-video': 'Image explorée',
        'health-sport': 'Sport et santé explorés',
        travel: 'Voyages explorés',
        money: 'Budgets explorés',
        work: 'Travail exploré',
        code: 'Code exploré',
        animals: 'Animaux explorés',
        science: 'Sciences explorées',
      },
      categoryOther: 'Catégorie explorée : {{category}}',
    },
    // La page du classement (planche R19-Classement).
    rankings: {
      title: 'Classement de la semaine',
      // Le nom du menu quand il y a plus de 3 ruches.
      scope: 'Classement',
      close: 'Proches',
      // Seuls les trois premiers ont leur rang (option b4), à l'œil comme au lecteur d'écran.
      rank: { first: '1er', second: '2e', third: '3e' },
      row: '{{name}}, {{amount}} pollen',
      rowRanked: '{{rank}}, {{name}}, {{amount}} pollen',
      // « toi » n'existe que pour le lecteur d'écran.
      you: '{{name}}, toi',
      pollen: '{{amount}} pollen',
      footnote: 'Seuls ceux qui ont gagné du pollen cette semaine y figurent. Tout repart lundi.',
      empty: 'La semaine commence. Le classement se remplit au premier pollen.',
      loadError: 'Le classement n’a pas pu se charger.',
    },
    // La feuille « Décorer mon rayon » (planche R19-Miel) : un achat vaut pour toujours.
    decoration: {
      title: 'Décorer mon rayon',
      preview: 'Aperçu',
      tint: 'Teinte',
      pattern: 'Motif',
      tints: { honey: 'Miel', amber: 'Ambre', pollen: 'Pollen' },
      patterns: { smooth: 'Lisse', waffle: 'Gaufré', striped: 'Rayé', dotted: 'Pointillé' },
      owned: 'À toi',
      price: '{{amount}} miel',
      balance: 'Ton miel : {{amount}}',
      buy: 'Décorer pour {{amount}} miel',
      // Rien à acheter : le choix parmi ce qu'on a déjà.
      apply: 'Décorer',
      done: 'Rayon décoré.',
      error: 'La décoration n’a pas pu s’enregistrer. Réessaie.',
    },
    // Offrir du miel au projet d'un autre membre, une fois par projet (Louis, 23/11).
    offer: {
      button: 'Offrir du miel',
      given: 'Miel offert',
      title: 'Offrir du miel à {{title}}',
      notice: '{{author}} verra « {{name}} t’a offert du miel » dans son Activité.',
      balance: 'Ton miel : {{balance}}. Il t’en restera {{after}}.',
      confirm: 'Offrir {{amount}} miel',
      toast: 'Miel offert. Il te reste {{amount}} miel.',
      error: 'Le miel n’a pas pu être offert. Réessaie.',
    },
    // Option b9 : le solde court, à l'offre comme à la décoration, sans rouge ni reproche.
    short: {
      body: 'Il faut {{needed}} miel ; tu en as {{balance}}.',
      how: 'Chaque semaine butinée en rapporte 5, chaque défi réussi 10.',
    },
    // Sur ordinateur, la ligne en tête de la colonne du Fil, lien vers « Ma récolte » (option b16).
    side: {
      title: 'Ta semaine',
      active: '{{amount}} pollen · défi {{progress}} sur {{target}}',
      done: '{{amount}} pollen · défi réussi',
      pollen: '{{amount}} pollen',
      challenge: 'Défi {{progress}} sur {{target}}',
      // Le lundi avant le premier pollen : jamais « 0 pollen ».
      monday: 'Nouveaux défis',
      empty: 'Ma récolte',
    },
    // Réglages (planche R19-Reglages) : « Classements » sous Apparence, « Ma récolte » en tête des
    // Notifications, « Mon titre » et « Forme » dans Mon profil (« Forme » absente en anglais).
    settings: {
      rankings: 'Classements',
      inRankings: 'Apparaître dans les classements',
      inRankingsHint:
        'Coupé, tu ne vois plus les classements et tu n’y apparais plus. Ton pollen et ton niveau restent.',
      notices: 'Ma récolte',
      noticesHint: 'Niveaux, sceaux, défis et miel offert, dans l’Activité et le récap',
      title: 'Mon titre',
      titleAuto: 'Selon mes gestes',
      titleHint: 'Celui des 4 dernières semaines : aujourd’hui, {{title}}.',
      // Un membre sans famille encore : pas de titre à citer.
      titleNone: 'Ton titre viendra avec tes premiers gestes.',
      form: 'Forme',
      saveError: 'Ce choix n’a pas pu s’enregistrer. Réessaie.',
    },
    // Le récap du dimanche (planche R19-Recap) : le bloc « Ta semaine » après « Tes projets »,
    // seulement s'il y a quelque chose à dire, jamais « 0 pollen » ; les défis sous « Dans tes ruches ».
    recap: {
      lead: 'Ta semaine :',
      pollen: '+{{amount}} pollen.',
      pollenDone: '+{{amount}} pollen, défi réussi.',
      newChallenges: 'Nouveaux défis lundi.',
      button: 'Voir ma récolte',
      hive: 'Défi de la semaine : {{challenge}}, {{progress}} sur {{target}}.',
      // Un défi neuf, sans avancée : jamais « 0 sur 5 » (option a14).
      hiveNew: 'Défi de la semaine : {{challenge}}.',
      hiveDone: 'Défi de la semaine réussi : {{challenge}}.',
      // J1 : une seule fois, dans le premier récap qui porte « Ta semaine ».
      news: 'Nouveau : ta récolte. Tes gestes rapportent du pollen ; ton niveau, ton titre et tes sceaux se voient sur ton profil. Ton pollen de la semaine paraît dans les classements des membres qui te suivent et de tes ruches ; tu peux t’en retirer dans Réglages, « Apparence », « Classements ».',
      reason: 'Ta semaine et les défis suivent ton réglage « Ma récolte ».',
    },
    // Relecture juridique du plan (B2) : les phrases « proches » de la colonne « Ce que tu reçois
    // par e-mail » (notifications.summary), quand « Ma récolte » est allumé.
    emailSummary: {
      nothingFriends:
        'Aucun e‑mail pour tes notifications ; le récap du dimanche t’apporte seulement les nouveaux projets de tes proches et ta récolte de la semaine.',
      nowFriends:
        '{{types}} tout de suite ; le récap du dimanche t’apporte seulement les nouveaux projets de tes proches et ta récolte de la semaine.',
      nowFriendsHives:
        '{{types}} tout de suite ; le récap du dimanche t’apporte seulement les nouveaux projets de tes proches, les nouveautés de tes ruches et ta récolte de la semaine.',
    },
  },
  errors: {
    notFound: 'Cette page n’existe pas.',
    validation: 'Certaines informations sont invalides.',
    unauthorized: 'Connecte-toi pour continuer.',
    forbidden: 'Cette action n’est pas autorisée.',
    rateLimited: 'Trop de demandes. Réessaie dans quelques minutes.',
    payloadTooLarge: 'Ce fichier est trop lourd.',
    unsupportedMediaType: 'Ce type de fichier n’est pas accepté.',
    unavailable: '{{appName}} reçoit beaucoup de demandes en ce moment. Réessaie dans un instant.',
    tooManyVisuals: 'Six photos au plus par projet. Retires-en une pour en ajouter une autre.',
    cannotFollowOwn: 'Tu ne peux pas te suivre toi-même, ni suivre tes propres projets.',
    cannotReactOwn: 'Tu ne peux pas réagir à ton propre projet.',
    handleTaken: 'Ce pseudo est déjà pris. Choisis-en un autre.',
    handleChangeLimit: 'Tu as changé de pseudo plusieurs fois aujourd’hui. Réessaie demain.',
    unsubscribeInvalid: 'Ce lien ne permet pas de te désinscrire.',
    internal: 'Une erreur inattendue est survenue. Réessaie dans un instant.',
    ownContent: 'Tu ne peux pas signaler ton propre contenu, ni décider de ce qui te concerne.',
    alreadyReported: 'Tu as déjà signalé ce contenu. La modération va le regarder.',
    alreadyDecided: 'Une décision a déjà été prise sur ce contenu entre-temps.',
    removed: 'Ce contenu a été retiré par la modération : il ne peut plus être modifié.',
    cannotBlockOwn: 'Tu ne peux pas te bloquer toi-même.',
    blockedMention: 'Tu ne peux pas mentionner un membre que tu as bloqué.',
    alreadyExamined:
      'Tu as déjà signalé ce contenu, et la modération l’a déjà examiné. Il n’a pas changé depuis.',
    // Tranche 7c.
    suspended: 'Ton compte est suspendu : cette action n’est pas possible pour l’instant.',
    passwordRequired: 'Retape ton mot de passe pour confirmer cette décision.',
    wrongPassword: 'Mot de passe incorrect.',
    cannotSuspendAdmin: 'Un administrateur ne peut pas être suspendu : retire d’abord son rôle.',
    // Tranche R2.
    alreadyVerified: 'Cette adresse est déjà vérifiée : connecte-toi.',
    network: 'Impossible de joindre {{appName}}. Vérifie ta connexion et réessaie.',
    // Tranche R6a.
    categoryRequired: 'Choisis d’abord une catégorie principale.',
    sameCategory: 'La seconde catégorie doit être différente de la principale.',
    // Tranche R6b.
    unknownCategory: 'Cette catégorie n’existe pas ou plus. Choisis-en une autre.',
    toolNameTaken: 'Ce nom est déjà celui d’un outil du catalogue, ou un autre de ses noms.',
    categoryNameTaken: 'Une catégorie porte déjà ce nom.',
    tooManyOtherTools: 'Tu as ajouté beaucoup d’autres outils aujourd’hui. Réessaie demain.',
    ownProject: 'C’est ton projet : sa catégorie se change depuis sa page.',
    // Tranche R7a.
    invalidPhotos: 'Une des photos n’est plus disponible. Retire-la, puis ajoute-la de nouveau.',
    cannotTestOwn: 'Tu ne peux pas rejoindre les testeurs de ton propre projet.',
    notTestable: 'Tu ne peux pas rejoindre les testeurs de ce projet.',
    testersFull: 'Ce projet ne prend plus de nouveaux testeurs.',
    updatePhotosFull:
      'Ce projet a atteint 100 photos de mises à jour. Supprime une ancienne mise à jour pour en ajouter.',
    // Tranche R7b.
    cornerClosed: 'Ce coin des testeurs est fermé : rien ne peut y être écrit pour l’instant.',
    threadClosed: 'Tu ne peux pas répondre dans ce fil.',
    invalidPhoto: 'L’image n’est plus disponible. Ajoute-la de nouveau.',
    invalidFeedback:
      'Un des retours cochés n’est plus à traiter : la liste est à jour, vérifie-la puis publie.',
    testerMediaFull: 'Ce fil ou ce coin a atteint 100 images. Supprimes-en une pour en ajouter.',
    // Tranche R9.
    partWholeOnly: 'Cette partie ne se retire pas seule : retire tout le contenu.',
    partNotReported: 'Aucun signalement ouvert ne vise cette partie.',
    // Tranche R10.
    hiveFull: 'Cette ruche est pleine : 50 membres au plus, invitations comprises.',
    hivesCreatedLimit:
      'Tu as créé 10 ruches, le plus possible. Supprimes-en une pour en créer une autre.',
    hivesJoinedLimit:
      'Tu fais partie de 20 ruches, le plus possible. Quittes-en une pour en rejoindre une autre.',
    alreadyHiveMember: 'Ce membre fait déjà partie de la ruche.',
    alreadyInvited: 'Ce membre a déjà une invitation dans cette ruche.',
    invitationExpired: 'Cette invitation n’est plus valable.',
    // Relecture du design de R10 : la 21e invitation du jour (`hive_invitations_limited`).
    hiveInvitationsLimited:
      'Tu as envoyé toutes tes invitations du jour : les suivantes pourront partir demain.',
    pinNotVisible: 'Ce projet ne peut pas être épinglé : toute la ruche ne peut pas le voir.',
    // Tranche R11 : une inscription envoyée sans l'un des deux accords (RULES_NOT_ACCEPTED,
    // AGE_NOT_DECLARED ; pour l'âge, la phrase neutre de la case), puis une écriture refusée tant
    // que la version en cours des règles n'est pas acceptée (`rules_required`, comme `suspended`).
    rulesNotAccepted: 'Accepte les règles de {{appName}} pour créer ton compte.',
    ageNotDeclared: '{{appName}} est ouvert à partir de 15 ans.',
    // Tranche R12 (Q14) : le quota des signalements d'un visiteur, par adresse IP
    // (`visitor_report_quota`) ; sans « tu » ciblé, l'adresse est partagée.
    visitorReportQuota:
      'Trop de signalements depuis cette connexion. Réessaie demain, ou écris-nous : {{contactEmail}}',
    // R12 (relecture juridique du plan) : la mise en avant d'un projet que son auteur a retiré de
    // l'accueil (`author_declined`).
    authorDeclined: 'L’auteur a retiré ce projet de l’accueil.',
    // Tranche R19 (la récolte) : sans reproche, comme la feuille du solde court.
    honeyShort: 'Il manque un peu de miel pour ça.',
    honeyAlready: 'Tu as déjà offert du miel à ce projet.',
    rankingsOff:
      'Tu as choisi de ne pas apparaître dans les classements : tu ne les vois pas non plus.',
    invalidChallenge: 'Ce défi ne peut pas être choisi cette semaine.',
    invalidLevelSeen: 'Ce niveau n’est pas encore atteint.',
    familyNotObtained: 'Ce titre n’est pas encore à toi : choisis-en un que tu as déjà obtenu.',
    rulesRequired: 'Accepte d’abord les règles de {{appName}} : cette action attend ton accord.',
  },
} as const
