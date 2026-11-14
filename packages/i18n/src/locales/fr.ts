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
    // R2 (décision D2) : vrai tant que rien n'est public ; R12 dira « Rien n’est public sans ton accord. »
    membersOnly: 'Rien n’est visible sans compte, ni trouvé par un moteur de recherche.',
    openSource: '{{appName}} est un logiciel libre.',
    seeCode: 'Voir le code',
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
      done: 'C’est bon, ton mot de passe est assez long.',
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
      subtitle: 'Connecte-toi pour retrouver les projets de tes proches.',
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
      intro: 'Indique ton adresse : nous t’envoyons un lien pour choisir un nouveau mot de passe.',
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
      locked: 'Tant que tu n’as pas ouvert ce lien, tu ne peux pas te connecter.',
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
        intro:
          'Une faute de frappe ? Indique la bonne adresse et ton mot de passe : un nouveau lien y partira, et l’ancien ne marchera plus.',
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
    },
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
    },
    appearance: {
      title: 'Apparence',
      auto: 'Automatique',
      day: 'Jour',
      night: 'Nuit',
      hint: 'Sur cet appareil seulement. « Automatique » suit le réglage de ton appareil.',
    },
    // Les réglages d'e-mail vivent au profil : « Mon compte » y mène (design, 24/10/2026).
    emails: { title: 'E‑mails', row: 'Choisir les e‑mails reçus' },
    data: { title: 'Mes données' },
    safety: { title: 'Sécurité' },
    export: {
      button: 'Télécharger mes données',
      done: 'Tes données ont été téléchargées.',
    },
    section: { title: 'Compte' },
    contact: {
      label: 'Nous écrire',
      spoken: 'Nous écrire : {{contactEmail}}',
      hint: 'En français ou en anglais. Pour une question, un contenu à signaler ou tes données.',
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
      intro:
        'Ta nouvelle adresse servira à te connecter et à recevoir les e‑mails de {{appName}}. Les autres membres ne la voient pas.',
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
      remains: {
        title: 'Ce qui reste',
        reports: 'Tes signalements restent, sans ton nom, jusqu’à un an après leur traitement',
        removals: 'Une trace des retraits de tes contenus reste un an',
        // Tranche 7b (relecture juridique, J11) : au conditionnel, l'écran s'affiche pour tous.
        reportCopies:
          'Si tes contenus ou ton profil ont été signalés, la copie de leurs textes reste 30 jours (un an s’ils ont été retirés)',
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
    // Ce que contient chaque rubrique, sous son nom dans la liste du téléphone.
    hints: {
      profile: 'Photo, nom, pseudo et présentation',
      notifications: 'Les e‑mails que tu reçois',
      language: 'Celle de l’appli et de tes e‑mails',
      appearance: 'Jour, nuit ou automatique',
      data: 'Télécharger tes données',
      security: 'Mot de passe, membres bloqués',
      account: 'Adresse e‑mail, déconnexion, suppression',
      about: 'Le code source et sa licence',
      moderation: 'Les signalements à traiter',
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
        'Les membres te voient sous @pseudo sur ta page. Il a été tiré de ton nom et ne change pas avec lui. {{min}} à {{max}} caractères : lettres sans accent, chiffres et « _ ».',
      bio: 'Bio',
      tools: 'Outils favoris',
      // R6b : les favoris se choisissent dans le catalogue ; l'aide dit qui les voit (jur-T3).
      toolsHint: 'Visibles de tous les membres sur ta page.',
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
  },
  project: {
    // R6a : la feuille de publication et de modification (planches R6-*). Les textes marqués
    // « juridique » viennent de la relecture du plan (8/11/2026) et remplacent ceux des planches.
    // Les blocs `new`, `edit`, `fields`, `visuals` et `preview` disparaîtront avec l'ancien écran.
    form: {
      newTitle: 'Nouveau projet',
      newIntro: 'Montre à tes proches ce que tu construis. Tu pourras tout modifier ensuite.',
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
        'Les administrateurs pourront ranger ton projet dans une catégorie qui lui va. Tu pourras la modifier comme le reste du projet.',
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
      membersHint: 'Toute personne qui a un compte.',
      private: 'Privé',
      // juridique (jur-J6).
      privateHint: 'Un brouillon : aucun autre membre ne le voit.',
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
      previewHint: 'Il suit ce que tu écris.',
      previewLight:
        'La lumière autour de la carte vient de ta première photo. Change-la, elle change aussi.',
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
      empty:
        'Pas encore de mise à jour. Raconte ce qui change : tes abonnés et tes testeurs seront prévenus.',
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
      linesHint: 'Une ligne par changement, 5 au plus. Pas besoin de tout dire.',
      versionField: 'Numéro de version, facultatif',
      versionPlaceholder: 'v1.3',
      photos: 'Photos',
      addPhotos: 'Ajouter',
      beforeAfterSwitch: 'Avant / après',
      // juridique (P5), mot pour mot : qui la lira, qui est prévenu.
      hintPublic:
        'Tous les membres pourront la lire. Les abonnés et les testeurs de ce projet seront prévenus.',
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
        emptyAuthor:
          'Aucun retour pour l’instant. Tes testeurs peuvent t’en envoyer depuis ce coin.',
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
        'Ta réponse s’affichera au bout de ce fil. Tous les membres connectés la liront ; la personne qui a publié le projet peut la masquer.',
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
    target: {
      project: 'Le projet signalé',
      note: 'La note signalée',
      update: 'La mise à jour signalée',
      comment: 'Le commentaire signalé',
      member: 'Le profil signalé',
      call: 'L’appel signalé',
      message: 'Le message signalé',
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
    },
    // Le premier choix, « tout le contenu », choisi d'avance.
    whole: {
      project: 'Tout le projet',
      update: 'Toute la mise à jour',
      member: 'Tout le profil',
      call: 'Tout l’appel',
      message: 'Tout le message',
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
    sentBody: 'La modération va le regarder. Une notification te dira quand il aura été traité.',
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
      edit: 'Modifier',
    },
    alreadyReportedWhole: 'Tu as déjà signalé ce contenu. La modération va le regarder.',
    alreadyReportedPart: 'Tu as déjà signalé cette partie. La modération va la regarder.',
    // Le quota, dès l'ouverture : la phrase, puis l'adresse en lien (ContactLink).
    limitedLead:
      'Tu as atteint la limite de {{max}} signalements en 24 heures. Pour un cas urgent, écris-nous :',
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
    toolsLinkHint: 'Les autres outils à vérifier, et le catalogue',
    categoriesLink: 'Catégories',
    categoriesLinkHint: 'Les projets à ranger, et les catégories',
    // R6b : la page « Outils » de la Modération (/moderation/tools).
    catalogue: {
      title: 'Outils',
      subtitle:
        'Les autres outils tapés par les membres, et le catalogue. Chaque changement entre dans « Changements récents ».',
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
      dismissHint:
        'Pour un nom qui n’est pas un outil. Il reste sur ses projets et profils, en texte simple.',
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
      subtitle:
        'Les projets classés « Autre », et les catégories. Chaque changement entre dans « Changements récents ».',
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
    subtitle: 'Les signalements des membres arrivent ici. Chaque décision entre dans l’historique.',
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
      order: 'Du plus récent au plus ancien',
      all: 'Voir tout l’historique',
      what: {
        project: 'un projet',
        update: 'une mise à jour',
        note: 'une note',
        comment: 'un commentaire',
        member: 'un profil',
        call: 'un appel à tester',
        message: 'un message',
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
      'Il ne sera plus visible que de toi. Pendant la suspension, tu ne pourras pas le rendre de nouveau public.',
    madePrivate: 'Projet passé en privé.',
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
      },
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
  },
  member: {
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
    /** Le sous-titre, sur ordinateur (Louis, 30/10/2026). */
    subtitle: 'Les projets de tous les membres : à tester, à suivre, pour t’inspirer.',
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
    subtitle:
      'Le catalogue des outils d’IA, de développement et de projets numériques, et les projets des membres qui s’en servent.',
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
  // R3 : l'onglet Ruches existe avant les ruches (R10 ; Louis, 30/10/2026). Ni date, ni promesse,
  // ni « Préviens-moi » (relecture juridique, jur-J9).
  hives: {
    title: 'Ruches',
    soonTitle: 'Les ruches arrivent bientôt',
    soonBody1: 'Une ruche, c’est un groupe de proches, comme « Ma ruche Famille ».',
    soonBody2: 'On y suit les projets des siens, on les teste et on s’encourage.',
  },
  // R3 : l'onglet Moi, sa propre page de membre (planche R3-Moi).
  me: {
    editProfile: 'Modifier mon profil',
    myProjects: 'Mes projets',
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
    choiceNeverHint: 'Plus aucun e‑mail pour ces types. Tout reste dans l’Activité de l’appli.',
    onlyConfirm: 'Ouvrir cette page ne change rien : seul « Confirmer » change tes choix.',
    doneInstantDigest:
      'C’est fait : ces types ne partent plus tout de suite, ils passent dans le récap.',
    doneInstantNever: 'C’est fait : plus aucun e‑mail pour ces types. Tout reste dans l’Activité.',
    allOff: 'Tout couper',
    allDone: 'Tu ne recevras plus aucun e‑mail de notification.',
    accountEmails:
      'Les e‑mails liés à ton compte, comme la vérification de ton adresse, continuent.',
    manage: 'Gérer mes e‑mails',
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
      hint: 'Tu peux en poser plusieurs, une de chaque.',
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
  },
  // Partager un projet ou une page de membre (R5a, F-Pr1, F-Mb1). Le lien ne contient que l'adresse.
  share: {
    action: 'Partager',
    title: '{{title}} sur {{appName}}',
    membersOnly: 'Seuls les membres de {{appName}} pourront l’ouvrir.',
    privateOnly: 'Ce projet est privé : le lien ne s’ouvrira que pour toi.',
    system: 'Partager…',
    copy: 'Copier le lien',
    copiedMembers: 'Lien copié : seuls les membres de {{appName}} pourront l’ouvrir.',
    copiedPrivate: 'Lien copié : il ne s’ouvrira que pour toi.',
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
      button: 'Voir mes notifications',
      last: 'Ce récap est le dernier pour l’instant : le prochain partira après ta prochaine visite.',
      // Juridique (relecture du plan R8), tel quel.
      reason:
        'Tu reçois ce récap le dimanche, parce qu’il est activé dans tes réglages. Il ne parle que de projets visibles des membres.',
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
    discoverEmpty: 'Aucun projet public pour l’instant.',
    testersEmpty: 'Aucun projet ne cherche de testeurs pour l’instant.',
    followingCaption:
      'Les nouveaux projets des personnes que tu suis, et les mises à jour de leurs projets et des projets que tu suis.',
    discoverCaption: 'Les derniers projets publiés par les membres.',
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
      title: 'Ton fil t’attend',
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
    caption: 'Des membres qui ont publié récemment',
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
    body: 'Une idée, un essai, ça compte.',
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
    // R8 : la colonne de droite sur ordinateur.
    emailColumn: {
      title: 'Ce que tu reçois par e‑mail',
      settings: 'Régler les notifications',
      counts: 'On ne voit nulle part qui a réagi ou qui te suit : seulement des nombres.',
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
      types: {
        reactions: 'les réactions',
        comments: 'les commentaires sur tes projets',
        replies: 'les réponses et les mentions',
        follows: 'les nouveaux abonnés',
        updates: 'les mises à jour suivies',
        testers: 'le coin des testeurs',
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
  },
} as const
