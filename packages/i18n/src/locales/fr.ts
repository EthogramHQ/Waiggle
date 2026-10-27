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
    remove: 'Retirer {{item}}',
    showPassword: 'Afficher le mot de passe',
    hidePassword: 'Masquer le mot de passe',
    /** Le titre de l'écran de secours, au-dessus de « Cette page n’a pas pu s’afficher. ». */
    crashedTitle: 'Un problème est survenu',
  },
  home: {
    title: 'Bienvenue sur {{appName}}',
    tagline: 'Montre à tes proches ce que tu construis avec l’IA.',
    greeting: 'Bonjour {{name}} !',
    signUp: 'Créer un compte',
    signIn: 'Me connecter',
    haveAccount: 'J’ai déjà un compte',
    account: 'Mon compte',
    publish: 'Publier un projet',
    publishShort: 'Publier',
    myProjects: 'Mes projets',
    membersOnly: 'Les projets et les profils ne sont visibles que par les membres connectés.',
    openSource: '{{appName}} est un logiciel libre.',
    seeCode: 'Voir le code',
  },
  auth: {
    // L'adresse de contact, lisible sans compte (une personne photographiée, une autorité).
    contact:
      'Une question, un contenu à signaler ? Écris-nous à {{contactEmail}}, en français ou en anglais.',
    fields: {
      name: 'Nom affiché',
      nameHint: 'Ton @pseudo en sera tiré ; tu pourras le changer dans Mon profil.',
      email: 'Adresse e-mail',
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
    signUp: {
      title: 'Créer un compte',
      subtitle: 'Tes proches te reconnaîtront à ton nom affiché.',
      submit: 'Créer un compte',
      haveAccount: 'J’ai déjà un compte',
    },
    signIn: {
      title: 'Te revoilà',
      subtitle: 'Connecte-toi pour retrouver les projets de tes proches.',
      submit: 'Me connecter',
      noAccount: 'Pas encore de compte ?',
      createOne: 'Créer un compte',
    },
    checkEmail: {
      title: 'Vérifie ta boîte mail',
      body: 'Nous avons envoyé un lien à {{email}}. Clique dessus pour activer ton compte.',
      bodyNoEmail: 'Nous t’avons envoyé un lien par e-mail. Clique dessus pour activer ton compte.',
      locked: 'Tant que tu n’as pas ouvert ce lien, tu ne peux pas te connecter.',
      expires:
        'Sans vérification dans les {{days}} jours qui suivent l’inscription, elle est effacée.',
      back: 'Retour à la connexion',
    },
    verified: {
      title: 'Adresse vérifiée',
      body: 'Ton compte est actif : bienvenue sur {{appName}} !',
      continue: 'Continuer',
    },
    errors: {
      nameRequired: 'Indique un prénom ou un pseudo.',
      invalidEmail: 'Cette adresse e-mail n’est pas valide.',
      passwordTooShort: 'Le mot de passe doit faire au moins {{min}} caractères.',
      passwordTooLong: 'Le mot de passe doit faire au plus {{max}} caractères.',
      invalidCredentials: 'Adresse e-mail ou mot de passe incorrect.',
      emailNotVerified:
        'Ton adresse n’est pas encore vérifiée : nous venons de te renvoyer le lien par e-mail.',
      tooManyAttempts: 'Trop de tentatives. Réessaie dans quelques minutes.',
      inviteRequired: 'Indique le code d’invitation que tu as reçu.',
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
    editProfile: 'Modifier mon profil',
    language: {
      title: 'Langue',
      hint: 'Tes e-mails te sont aussi envoyés dans cette langue.',
    },
    appearance: {
      title: 'Apparence',
      auto: 'Automatique',
      day: 'Jour',
      night: 'Nuit',
      hint: 'Sur cet appareil seulement. « Automatique » suit le réglage de ton appareil.',
    },
    // Les réglages d'e-mail vivent au profil : « Mon compte » y mène (design, 24/10/2026).
    emails: { title: 'E-mails', row: 'Choisir les e-mails reçus' },
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
      label: 'Adresse e-mail',
      // Le nom lu de la ligne : l'action, puis l'adresse affichée (sinon le lecteur d'écran la tait).
      spoken: 'Changer d’adresse e-mail : {{email}}',
    },
    // Tranche « adresse » : la page où l'on demande le changement (deux liens à suivre).
    changeEmail: {
      // Trait d'union insécable (U+2011) dans « e‑mail » : le titre ne se coupe plus entre « e- » et
      // « mail » sur un petit téléphone (relecture de design, 360 et 390 px).
      title: 'Changer d’adresse e‑mail',
      current: 'Ton adresse actuelle : {{email}}',
      intro:
        'Ta nouvelle adresse servira à te connecter et à recevoir les e-mails de {{appName}}. Les autres membres ne la voient pas.',
      steps:
        'Elle ne change qu’après deux confirmations : un lien envoyé à ton adresse actuelle, puis un lien envoyé à la nouvelle.',
      newEmail: 'Nouvelle adresse e-mail',
      password: 'Confirme avec ton mot de passe',
      submit: 'Envoyer le lien',
      sending: 'Envoi…',
      noAccess: 'Tu n’as plus accès à ton adresse actuelle ? Écris-nous à {{contactEmail}}.',
      sentTitle: 'Regarde ta boîte mail actuelle',
      sentBody: 'Un lien vient de partir vers {{email}}. Il est valable une heure.',
      sentNext:
        'Rien ne change tant que tu n’as pas suivi ce lien, puis celui que tu recevras sur ta nouvelle adresse.',
      sentNone: 'Rien reçu après quelques minutes ? Regarde dans les indésirables.',
      back: 'Retour à Mon compte',
    },
    // Les pages où mènent les deux liens des e-mails.
    emailChange: {
      confirmedTitle: 'Plus qu’une étape',
      confirmedBody:
        'Si ta nouvelle adresse peut être utilisée, un second lien vient d’y partir. Ouvre-le pour terminer : il est valable une heure.',
      confirmedNone:
        'Rien reçu ? Regarde dans les indésirables. Aucun lien ne part si l’adresse est déjà celle d’un autre compte, ni après trois liens dans l’heure.',
      doneTitle: 'Adresse changée',
      doneBody: 'Ton adresse est maintenant {{email}}. Connecte-toi désormais avec elle.',
      doneSignedOut: 'Connecte-toi avec ta nouvelle adresse et ton mot de passe habituel.',
      doneDevices: 'Tes appareils déjà connectés le restent.',
      signIn: 'Me connecter',
      toAccount: 'Aller à Mon compte',
      errorTitle: 'Ce lien ne marche plus',
      errorBody:
        'Il a expiré, il a déjà servi, une autre demande l’a remplacé, un autre compte est connecté sur cet appareil, ou ta nouvelle adresse ne peut plus être utilisée. Tu peux recommencer depuis Mon compte.',
      restart: 'Recommencer depuis Mon compte',
    },
    delete: {
      title: 'Supprimer mon compte',
      screenTitle: 'Supprimer ton compte',
      intro: 'Voici ce qui disparaît avec lui.',
      profileItem: 'Ton profil et ta photo',
      projectsItem: 'Tes projets',
      projectsDetail:
        'Avec leur description, leur recette, leurs prompts, leurs photos, leurs notes et leurs commentaires',
      followsItem: 'Tes abonnements et tes abonnés',
      handleItem: 'Ton pseudo',
      handleDetail:
        '@{{handle}}, et l’ancien s’il t’est réservé : ils redeviennent libres aussitôt',
      reactionsItem: 'Tes réactions et tes commentaires',
      reactionsDetail:
        'Un commentaire qui a reçu des réponses devient « Commentaire supprimé » : ton texte et ton nom en sont effacés, les réponses des autres restent.',
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
      toolsLimit: '{{max}} au plus',
      toolsPlaceholder: 'Ajouter un outil',
    },
    save: 'Enregistrer',
    saved: 'Profil enregistré.',
    // Les réglages d'e-mail (tranche 6c) : chacun s'enregistre dès qu'on le touche.
    emails: {
      title: 'E-mails',
      weeklyRecap: 'Le récap de la semaine',
      weeklyRecapHint: 'Le lundi matin, seulement s’il y a du nouveau.',
      mentionEmails: 'Un e-mail quand on me mentionne ou me répond',
      mentionEmailsHint: 'Un quart d’heure après, si tu ne l’as pas déjà vu. Un par heure au plus.',
      saved: 'Réglage enregistré.',
      accountEmails:
        'Les e-mails liés à ton compte, comme la vérification de ton adresse, arrivent toujours.',
      // Ces réglages ne passent pas par « Enregistrer » : la phrase le dit (relecture de design, 6c).
      instant: 'Chaque réglage s’enregistre dès que tu le touches.',
      loadError: 'Tes réglages d’e-mail n’ont pas pu se charger.',
    },
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
  },
  project: {
    new: {
      title: 'Nouveau projet',
      subtitle: 'Montre à tes proches ce que tu construis. Tu pourras tout modifier ensuite.',
      submit: 'Publier',
    },
    edit: {
      title: 'Modifier le projet',
      submit: 'Enregistrer',
    },
    fields: {
      title: 'Titre',
      pitch: 'Le pitch, en une phrase',
      description: 'Description',
      descriptionHint: 'Mise en forme Markdown : **gras**, *italique*, listes, [liens](https://…).',
      status: 'Où en est-il ?',
      public: 'Public',
      publicHint:
        'Visible par les membres connectés. En privé, il te sert de brouillon : les commentaires et les réactions reçus sont gardés, mais personne ne les voit.',
      demoUrl: 'Lien de démo (facultatif)',
      demoUrlHint: 'Une adresse https, par exemple https://monprojet.vercel.app',
      demoUrlOk: 'C’est bon : un site public en https.',
      recipe: 'Ajouter la recette',
      recipeHint: 'Outils, temps passé, prompts clés : facultatif',
      tools: 'Outils et modèles utilisés',
      toolsLimit: '{{max}} au plus',
      toolsPlaceholder: 'Ajouter un outil',
      timeSpent: 'Temps passé',
      prompts: 'Prompts clés (facultatif)',
      promptsHint: '{{max}} au plus. Ils sont affichés tels quels.',
      prompt: 'Prompt {{number}}',
      addPrompt: 'Ajouter un prompt',
      removePrompt: 'Retirer le prompt {{number}}',
    },
    status: {
      idea: 'Idée',
      building: 'En construction',
      testable: 'Testable',
      done: 'Terminé',
      paused: 'En pause',
    },
    timeSpent: {
      unknown: 'Non précisé',
      hour: 'Moins d’une heure',
      evening: 'Une soirée',
      weekend: 'Un week-end',
      weeks: 'Quelques semaines',
      months: 'Plusieurs mois',
    },
    preview: {
      title: 'Aperçu dans le fil',
      hint: 'Il suit ce que tu écris.',
      now: 'à l’instant',
      untitled: 'Ton projet',
      noPitch: 'Ton pitch apparaîtra ici.',
    },
    visuals: {
      gallery: 'Photos',
      galleryHintNew:
        '{{max}} au plus. La première sert de couverture. Elles partent à la publication.',
      galleryHintEdit:
        '{{max}} au plus. La première sert de couverture. Chaque changement s’enregistre tout de suite.',
      cover: 'Couverture',
      add: 'Ajouter une photo',
      earlier: 'Avancer la photo {{number}}',
      later: 'Reculer la photo {{number}}',
      makeCover: 'Mettre la photo {{number}} en couverture',
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
      uploadFailed:
        'Le projet est publié, mais certaines photos n’ont pas pu être envoyées. Ajoute-les à nouveau ici.',
    },
    notes: {
      title: 'Journal',
      empty:
        'Pas encore de note. Raconte où en est ton projet : tes abonnés la verront dans leur fil.',
      add: 'Publier une note',
      field: 'Ta note',
      hint: 'Ce qui a changé, ce que tu prépares, ce que tu cherches. Tes abonnés la verront dans leur fil.',
      hintPrivate:
        'Ce projet est privé : personne d’autre que toi ne voit ses notes. Si tu le rends public, elles seront visibles de tous les membres.',
      emptyPrivate:
        'Pas encore de note. Ce projet est privé : personne d’autre que toi ne verra ses notes, jusqu’à ce que tu le rendes public.',
      submit: 'Publier la note',
      required: 'Écris ta note avant de la publier.',
      hintAnnounce:
        'Ton projet est passé en « {{status}} » : annonce-le à tes abonnés, ou touche Annuler.',
      limited: 'Tu as publié 30 notes aujourd’hui. La suivante pourra partir demain.',
      published: 'Note publiée.',
      deleted: 'Note supprimée.',
      error: 'La note n’a pas pu être publiée. Réessaie.',
      delete: 'Supprimer la note',
      deleteTitle: 'Supprimer cette note ?',
      deleteBody: 'Elle disparaîtra du journal et des fils de tes abonnés.',
      confirmDelete: 'Supprimer',
      deleteError: 'La note n’a pas pu être supprimée. Réessaie.',
      statusPrefill: 'Le projet passe en « {{status}} ».',
    },
    reactions: {
      amazing: 'Bluffant',
      inspiring: 'Inspirant',
      useful: 'Utile',
      funny: 'Drôle',
      bravo: 'Bravo',
      label: '{{name}}, {{count}}',
      labelMine: '{{name}}, réagi, {{count}}',
      own: 'Les réactions à ton projet',
      // La légende des réactions qu’un compte suspendu lit sans pouvoir réagir.
      readOnly: 'Les réactions à ce projet',
      group: 'Réagir à ce projet',
      error: 'Ta réaction n’a pas pu être enregistrée. Réessaie.',
    },
    comments: {
      title: 'Commentaires ({{count}})',
      titleNone: 'Commentaires',
      empty: 'Pas encore de commentaire.',
      add: 'Écrire un commentaire',
      addShort: 'Commenter',
      field: 'Ton commentaire',
      hint: 'Tous les membres connectés liront ton commentaire. La personne qui a publié le projet peut le masquer.',
      hintPrivate:
        'Ce projet est privé : personne d’autre que toi ne lira ce commentaire. S’il devient public, tous les membres le liront.',
      about: '{{name}} : {{text}}',
      submit: 'Publier le commentaire',
      required: 'Écris ton commentaire avant de le publier.',
      published: 'Commentaire publié.',
      error: 'Le commentaire n’a pas pu être publié. Réessaie.',
      limited: 'Tu as publié 60 commentaires en une heure. Attends un peu avant le suivant.',
      reply: 'Répondre',
      replyField: 'Ta réponse',
      replyHint:
        'Ta réponse s’affichera au bout de ce fil. Tous les membres connectés la liront ; la personne qui a publié le projet peut la masquer.',
      replyHintPrivate:
        'Ce projet est privé : personne d’autre que toi ne lira cette réponse. S’il devient public, tous les membres la liront.',
      replySubmit: 'Publier la réponse',
      replyRequired: 'Écris ta réponse avant de la publier.',
      replyError: 'La réponse n’a pas pu être publiée. Réessaie.',
      replyGone: 'Ce fil n’accepte plus de réponse.',
      replyPublished: 'Réponse publiée.',
      edit: 'Modifier le commentaire',
      editShort: 'Modifier',
      editHint:
        'Tous les membres connectés liront la nouvelle version, marquée « modifié ». La personne qui a publié le projet peut la masquer.',
      editHintHidden:
        'Ce commentaire est masqué : il ne reste visible que de toi et de la personne qui a publié le projet.',
      editSubmit: 'Enregistrer',
      editError: 'Le commentaire n’a pas pu être modifié. Réessaie.',
      saved: 'Commentaire modifié.',
      edited: 'modifié',
      delete: 'Supprimer le commentaire',
      deleteShort: 'Supprimer',
      deleteTitle: 'Supprimer ce commentaire ?',
      deleteBody: 'Il disparaîtra pour tout le monde.',
      deleteBodyReplies:
        'Ton texte et ton nom disparaîtront pour tout le monde. Les réponses restent, sous « Commentaire supprimé ».',
      confirmDelete: 'Supprimer',
      deleteError: 'Le commentaire n’a pas pu être supprimé. Réessaie.',
      deleted: 'Ton commentaire a été supprimé.',
      hide: 'Masquer le commentaire',
      unhide: 'Démasquer le commentaire',
      hideShort: 'Masquer',
      unhideShort: 'Démasquer',
      hiddenBanner:
        'Masqué par la personne qui a publié le projet : les autres membres ne le voient plus.',
      hiddenByMe: 'Masqué par toi',
      hiddenDone:
        'Commentaire masqué : il ne reste visible que de toi et de la personne qui l’a écrit.',
      shownDone: 'Commentaire de nouveau visible par tous.',
      hideError: 'Le changement n’a pas pu être enregistré. Réessaie.',
      deletedPlaceholder: 'Commentaire supprimé',
      hiddenPlaceholder: 'Commentaire masqué',
      removedPlaceholder: 'Contenu retiré par la modération',
      // Tranche 7b : « Commentaire masqué » reste au geste de l'auteur du projet (J6).
      blockedPlaceholder: 'Commentaire d’un membre que tu as bloqué',
      unavailablePlaceholder: 'Commentaire indisponible',
      more: 'Afficher la suite',
      end: 'C’est tout',
      moreError: 'La suite des commentaires n’a pas pu se charger.',
      loadError: 'Les commentaires n’ont pas pu se charger.',
      loading: 'Chargement des commentaires…',
    },
    page: {
      published: 'publié le {{date}}',
      external: '{{host}}, un site hors de {{appName}}',
      description: 'Description',
      private: 'Privé : visible par toi seulement',
      tryDemo: 'Tester la démo',
      noDemo: 'Pas encore de démo',
      recipe: 'La recette',
      tools: 'Outils et modèles',
      timeSpent: 'Temps passé',
      prompts: 'Prompts clés',
      edit: 'Modifier',
      delete: 'Supprimer',
      deleteTitle: 'Supprimer « {{title}} » ?',
      deleteConfirm:
        'Le projet, sa description, sa recette, ses photos et ses notes disparaissent tout de suite, avec les commentaires et les réactions des autres membres. Impossible de revenir en arrière.',
      deleteConfirmButton: 'Supprimer le projet',
      notFoundTitle: 'Ce projet est introuvable',
      notFound: 'Il a peut-être été supprimé, ou le lien est incorrect.',
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
      promptTooLong: 'Chaque prompt doit faire au plus {{max}} caractères.',
      invalidCharacters:
        'Certains caractères ne sont pas autorisés (caractères invisibles ou de contrôle).',
    },
  },
  report: {
    // Signaler un contenu (tranche 7a). « La modération » : il n'y a qu'une personne derrière.
    title: 'Signaler',
    action: 'Signaler',
    project: 'Signaler ce projet',
    note: 'Signaler cette note',
    member: 'Signaler ce profil',
    target: {
      project: 'Le projet signalé',
      note: 'La note signalée',
      comment: 'Le commentaire signalé',
      member: 'Le profil signalé',
    },
    reasonLabel: 'Pourquoi le signales-tu ?',
    reasons: {
      illegal: 'Contenu illégal',
      harassment: 'Harcèlement ou haine',
      sexualViolent: 'Contenu sexuel ou violent',
      scamSpam: 'Arnaque ou spam',
      impersonation: 'Usurpation d’identité',
      privacy: 'Une photo ou une information sur moi sans mon accord',
      other: 'Autre chose',
    },
    details: 'Précision (facultatif)',
    detailsHint: 'N’ajoute pas d’informations personnelles inutiles.',
    illegalDetails: 'Dis-nous pourquoi',
    illegalHint:
      'Dis-nous pourquoi ce contenu te semble illégal. En envoyant, tu confirmes que ton signalement est sincère et exact à ta connaissance.',
    anonymity:
      'La personne concernée ne saura pas que c’est toi. La modération voit qui signale, pour éviter les abus.',
    danger: 'Quelqu’un est en danger ? Appelle le 112.',
    submit: 'Envoyer',
    sent: 'Merci, ton signalement a été envoyé. La modération va le regarder.',
    back: 'Revenir',
    // Tranche 7a, décisions du 23/10 : la précision obligatoire pour un contenu dit illégal, le
    // quota de 20 par jour, et un contenu disparu entre l’ouverture de la page et l’envoi.
    illegalRequired: 'Dis-nous pourquoi ce contenu te semble illégal.',
    limited:
      'Tu as atteint la limite de {{max}} signalements en 24 heures. Pour un cas urgent, écris-nous : {{contactEmail}}',
    gone: 'Ce contenu n’existe plus, ou tu ne peux plus le voir.',
    // Tranche 7b : « Envoyer » dit pourquoi il ne part pas (design.md, À reprendre) ; après l'envoi,
    // bloquer l'auteur est proposé, jamais présélectionné (J14).
    reasonRequired: 'Choisis un motif pour envoyer ton signalement.',
    alsoBlock: 'Bloquer aussi @{{handle}}',
    alsoBlockHint: 'Tu ne verras plus ses contenus, et @{{handle}} ne verra plus les tiens.',
    // Ajouté par l'interface : la phrase de bonne foi seule, qui reste sous l'erreur « Dis-nous
    // pourquoi… » (l'aide entière répéterait l'erreur, qui en est la première phrase).
    goodFaith:
      'En envoyant, tu confirmes que ton signalement est sincère et exact à ta connaissance.',
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
      'Vous ne verrez plus les projets, les notes et les commentaires l’un de l’autre, et vous ne pourrez plus interagir.',
    // Relecture juridique (R1) : ce qui reste visible malgré le blocage (règles 1 et 2 du plan).
    remains:
      'Les commentaires déjà écrits restent. @{{handle}} lit encore les tiens sur ses propres projets, et ceux où tu as écrit son pseudo. Pour les retirer, supprime-les avant de bloquer.',
    follows:
      'Vos abonnements de l’un à l’autre sont retirés ; ils ne reviendront pas si tu débloques.',
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
      'Vous verrez de nouveau les contenus l’un de l’autre. Les abonnements retirés ne reviennent pas. Les notifications d’avant le blocage peuvent réapparaître, des deux côtés.',
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
      more: 'Afficher la suite',
      end: 'C’est tout',
      loadError: 'La liste n’a pas pu se charger.',
      // Ajoutés par l'interface : le nom lu de « Débloquer » sur chaque ligne (toutes portent le
      // même mot), et la suite ratée de la liste.
      unblockLabel: 'Débloquer @{{handle}}',
      // La précision d'une ligne : le pseudo, puis la date (blockedOn).
      detail: '@{{handle}} · {{blockedOn}}',
      moreError: 'La suite de la liste n’a pas pu se charger.',
    },
    // Le quota des déblocages a son propre nombre (UNBLOCKS_PER_DAY) : « blocages » serait faux.
    unblockLimited: 'Tu as atteint la limite de {{max}} déblocages en 24 heures. Réessaie demain.',
  },
  moderation: {
    title: 'Modération',
    pending: 'En attente',
    removed: 'Retirés',
    empty: 'Aucun signalement en attente.',
    emptyRemoved: 'Aucun contenu retiré.',
    more: 'Afficher la suite',
    errorTitle: 'La modération n’a pas pu se charger',
    kinds: { project: 'Projet', note: 'Note', comment: 'Commentaire', member: 'Profil' },
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
    // Le bas de la liste (ajoutés par l'interface, tranche 7a) : tout est lu, ou la suite a raté.
    end: 'C’est tout',
    moreError: 'La suite de la liste n’a pas pu se charger.',
    // Une copie longue se replie après trois champs (ajoutés par l'interface, corrections 7b).
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
      suspendedNow: 'Suspendu en ce moment',
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
      title: 'Suspendre le compte de {{name}}',
      intro:
        'Le compte passe en lecture seule : la personne lit tout, peut supprimer ses contenus, mais ne publie plus et n’interagit plus. Elle est prévenue par e-mail et par notification, avec ton explication.',
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
      title: 'Lever la suspension de {{name}}',
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
    // La date, l'heure et le fuseau (J4) : une date seule tromperait d'un jour.
    until: 'Jusqu’au {{date}} à {{time}} (heure de Paris).',
    indefinite: 'Jusqu’à nouvel ordre.',
    // Qui a décidé, et après quoi (DSA art. 17.3, J2) : jamais qui a signalé.
    afterReport:
      'Après un signalement, une personne de la modération a décidé de suspendre ton compte.',
    direct: 'Une personne de la modération a décidé de suspendre ton compte.',
    explanation: 'Explication : {{explanation}}',
    canStill:
      'Tu peux toujours tout lire, supprimer tes projets, notes et commentaires, exporter tes données, régler ton compte, bloquer et signaler. Tu ne peux plus publier, commenter, réagir ni suivre.',
    // Les recours (J3, formulation à faire valider par un professionnel).
    // Suivi de l’adresse, en lien qui ouvre la messagerie (Louis, 27/10/2026).
    contest: 'Pour contester : écris à {{contactEmail}}. Tu peux aussi saisir la justice.',
    contestLead: 'Pour contester, écris à la modération :',
    contestCourt: 'Tu peux aussi saisir la justice.',
    // À la place d'un formulaire de projet, et sur « Mon profil ».
    formBody: 'Tu ne peux pas publier ni modifier de projet pendant la suspension.',
    profileLocked: 'Ton profil ne peut pas être modifié pendant la suspension.',
    // Le titre de la page qui remplace le formulaire de projet (ui-dev C, 7c) : le bandeau dit
    // déjà « Ton compte est suspendu », le titre ne le répète pas.
    formTitle: 'Publication impossible pour l’instant',
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
  },
  member: {
    // {{nameOf}} : « d’Inès », « de Léa » (nameOf de @ruche/i18n, tranche 6c).
    open: 'Voir la page {{nameOf}}',
    handle: '@{{handle}}',
    favoriteTools: 'Outils favoris',
    projects: 'Projets',
    empty: 'Pas encore de projet public.',
    emptyMine: 'Tu n’as encore rien publié. Ton premier projet apparaîtra ici.',
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
  },
  tag: {
    subtitle: 'Les projets publics faits avec cet outil, du plus récent au plus ancien.',
    emptyTitle: 'Encore aucun projet ici',
    empty:
      'Aucun projet public fait avec cet outil pour l’instant. Le tien sera peut-être le premier.',
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
    title: 'Tes e-mails',
    askRecap: 'Ne plus recevoir le récap de la semaine ?',
    askMentions: 'Ne plus recevoir les e-mails de mentions et de réponses ?',
    confirm: 'Confirmer',
    keep: 'Garder mes e-mails',
    doneRecap: 'C’est fait : tu ne recevras plus le récap de la semaine.',
    doneMentions: 'C’est fait : tu ne recevras plus d’e-mail quand on te mentionne ou te répond.',
    allOff: 'Tout couper',
    allDone: 'C’est fait : tu ne recevras plus aucun e-mail de notification.',
    accountEmails:
      'Les e-mails liés à ton compte, comme la vérification de ton adresse, continuent.',
    manage: 'Gérer mes e-mails',
    invalidTitle: 'Lien invalide',
    invalid:
      'Ce lien ne permet pas de te désinscrire. Connecte-toi pour gérer tes e-mails dans Mon profil.',
  },
  leaving: {
    title: 'Tu quittes {{appName}}',
    body: 'Ce lien mène vers un autre site. {{appName}} ne vérifie pas son contenu : n’y entre pas d’informations personnelles si tu as un doute.',
    destination: 'Destination',
    safety: 'Ce site n’est pas sur {{appName}}. N’y saisis jamais ton mot de passe {{appName}}.',
    continue: 'Continuer vers {{host}}',
    back: 'Revenir',
    invalid:
      'Ce lien ne peut pas être ouvert : seules les adresses https vers un site public sont acceptées.',
  },
  email: {
    // Les e-mails de notification (tranche 6c). Un membre y est nommé avec son pseudo ; aucun
    // texte d'un autre membre dans l'objet (visible sur un écran verrouillé). Chaque e-mail dit
    // pourquoi on le reçoit, et son lien de désinscription nomme ce qu'il coupe.
    manage: 'Gérer mes e-mails',
    // Ce qui remplace une adresse écrite par un membre (`defangLinks`), dans la langue de l'e-mail.
    link: '[lien]',
    recap: {
      subject: 'Du nouveau sur {{appName}}',
      heading: 'Du nouveau cette semaine',
      intro: 'Voici ce que tu n’as pas encore vu sur {{appName}} cette semaine.',
      first:
        'C’est ton premier récap : chaque lundi, s’il y a du nouveau, {{appName}} te résume tes notifications. Il est activé par défaut ; tu peux le couper à tout moment.',
      comment: '{{name}} (@{{handle}}) a commenté « {{title}} »',
      reply: '{{name}} (@{{handle}}) a répondu à ton commentaire sur « {{title}} »',
      mention: '{{name}} (@{{handle}}) parle de toi dans un commentaire sur « {{title}} »',
      more_one: 'Et {{count}} autre notification',
      more_other: 'Et {{count}} autres notifications',
      alsoLabel: 'Et aussi :',
      reactions_one: '{{count}} réaction à tes projets',
      reactions_other: '{{count}} réactions à tes projets',
      follows_one: '{{count}} nouvel abonné',
      follows_other: '{{count}} nouveaux abonnés',
      button: 'Voir mes notifications',
      last: 'Ce récap est le dernier pour l’instant : le prochain partira après ta prochaine visite.',
      reason: 'Tu reçois ce récap parce qu’il est activé dans tes réglages {{appName}}.',
      unsubscribe: 'Ne plus recevoir le récap de la semaine',
    },
    mentions: {
      // Objet et titre vrais même quand l'e-mail ne contient que des réponses (relecture juridique).
      subject: 'Mentions et réponses sur {{appName}}',
      heading: 'Mentions et réponses',
      mention: '{{name}} (@{{handle}}) parle de toi dans un commentaire sur « {{title}} » :',
      reply: '{{name}} (@{{handle}}) a répondu à ton commentaire sur « {{title}} » :',
      button: 'Voir mes notifications',
      reason: 'Tu reçois cet e-mail parce que tu as activé les e-mails de mentions et de réponses.',
      unsubscribe: 'Ne plus recevoir les e-mails de mentions et de réponses',
    },
    footer: '{{appName}}, le réseau des projets IA entre proches. Contact : {{contactEmail}}',
    moderationAlert: {
      // Sans aucun extrait : le nombre en attente et le lien, rien de plus ne part chez l'envoyeur.
      subject: 'Signalements en attente sur {{appName}}',
      heading: 'Signalements en attente',
      body_one: '{{count}} signalement attend une décision.',
      body_other: '{{count}} signalements attendent une décision.',
      button: 'Ouvrir la modération',
      reason:
        'Tu reçois cet e-mail parce que tu es administrateur de {{appName}}. Au plus un par heure.',
    },
    greeting: 'Bonjour {{name}},',
    verify: {
      subject: 'Active ton compte {{appName}}',
      body: 'Clique sur le bouton ci-dessous pour confirmer ton adresse et activer ton compte.',
      button: 'Activer mon compte',
      expires: 'Ce lien est valable une heure.',
      ignore: 'Si tu n’as pas créé de compte, ignore simplement ce message.',
    },
    existingAccount: {
      subject: 'Tentative d’inscription sur {{appName}}',
      body: 'Quelqu’un vient d’essayer de créer un compte avec ton adresse. Tu as déjà un compte : il te suffit de te connecter.',
      button: 'Me connecter',
      ignore: 'Si ce n’était pas toi, tu n’as rien à faire : ton compte est en sécurité.',
    },
    // Tranche « adresse » : le premier lien part vers l'ancienne adresse, qui doit donner son accord.
    changeEmail: {
      subject: 'Changement d’adresse sur {{appName}}',
      // La nouvelle adresse s'écrit seule sur la ligne suivante, telle que saisie (relecture J6).
      body: 'Tu as demandé à remplacer l’adresse de ton compte par :',
      // Les conséquences d'abord, la consigne ensuite, juste avant la durée et le bouton (des-E5).
      next: 'Une fois l’adresse changée, ton adresse actuelle ne servira plus à te connecter et ne recevra plus rien de {{appName}}. Confirme avec le bouton ci-dessous : un second lien partira ensuite vers la nouvelle adresse.',
      button: 'Confirmer le changement',
      expires: 'Ce lien est valable une heure.',
      // Un paragraphe normal sous le bouton, l'adresse de contact en gras (des-E4, 26/10/2026).
      ignore:
        'Ce n’est pas toi ? Ne clique pas : rien ne changera. Mais quelqu’un connaît ton mot de passe : écris-nous vite à {{contactEmail}}.',
    },
    // … puis le second vers la nouvelle adresse, pour la vérifier.
    newEmail: {
      subject: 'Confirme ta nouvelle adresse sur {{appName}}',
      // Ni nom ni ancienne adresse : avec une faute de frappe, cet e-mail part chez un inconnu (S6).
      greeting: 'Bonjour,',
      body: 'Clique sur le bouton ci-dessous pour que cette adresse devienne celle de ton compte {{appName}}.',
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
        'Pendant la suspension, tu peux tout lire, supprimer tes projets, notes et commentaires, exporter tes données ou supprimer ton compte. Tu ne peux plus publier, commenter, réagir ni suivre.',
      contest:
        'Pas d’accord ? Écris-nous à {{contactEmail}} : une personne relira la décision et te répondra. Tu peux aussi saisir la justice.',
      // La salutation, sans le nom : l'e-mail ne cite que la décision (backend-dev 7c).
      greeting: 'Bonjour,',
    },
  },
  feed: {
    label: 'Le fil',
    errorTitle: 'Le fil n’a pas pu se charger',
    tabs: { following: 'Abonnements', discover: 'Découvrir' },
    filter: { label: 'Quels projets', all: 'Tous', testers: 'Cherchent des testeurs' },
    nobodyTitle: 'Tu ne suis personne pour l’instant',
    nobodyBody: 'Suis des membres depuis leur page : leurs nouveaux projets arriveront ici.',
    nobodyAction: 'Découvrir des projets',
    quiet: 'Rien de neuf pour l’instant chez les personnes que tu suis.',
    discoverEmpty: 'Aucun projet public pour l’instant.',
    testersEmpty: 'Aucun projet ne cherche de testeurs pour l’instant.',
    followingCaption:
      'Les nouveaux projets des personnes que tu suis, et les notes des projets suivis.',
    discoverCaption: 'Les derniers projets publiés par les membres.',
    testersCaption:
      'Les projets à essayer : les personnes qui les ont publiés attendent tes retours.',
    more: 'Afficher la suite',
    moreError: 'La suite du fil n’a pas pu se charger.',
    end: 'Tu es à jour',
    noteLabel: 'Note {{nameOf}} sur {{title}}',
    noteKicker: 'Note',
    news_one: '{{count}} nouveauté',
    news_other: '{{count}} nouveautés',
    newsMany: '{{max}} nouveautés ou plus',
  },
  follow: {
    follow: 'Suivre',
    following: 'Suivi',
    member: 'Suivre {{name}}',
    memberFollowing: 'Suivi : {{name}}',
    project: 'Suivre ce projet',
    projectFollowing: 'Projet suivi',
    followers_one: '{{count}} abonné',
    followers_other: '{{count}} abonnés',
    error: 'L’abonnement n’a pas pu être enregistré. Réessaie.',
  },
  // Tranche 6b : les notifications dans l'appli. Jamais le nom de qui a réagi ou suit.
  notifications: {
    title: 'Notifications',
    bell: 'Notifications',
    bellNew_one: 'Notifications, {{count}} nouvelle',
    bellNew_other: 'Notifications, {{count}} nouvelles',
    bellNewMany: 'Notifications, plus de {{max}} nouvelles',
    new: 'Nouveau',
    emptyTitle: 'Pas encore de notification',
    empty:
      'Quand un membre réagira à tes projets, les commentera, les suivra ou parlera de toi, tu le liras ici.',
    // Un compte suspendu ne publie pas : l'état vide propose de lire (7c).
    emptyActionSuspended: 'Découvrir des projets',
    emptyAction: 'Publier un projet',
    more: 'Afficher la suite',
    end: 'C’est tout',
    moreError: 'La suite des notifications n’a pas pu se charger.',
    errorTitle: 'Les notifications n’ont pas pu se charger',
    reactions_one: '{{count}} réaction sur « {{title}} »',
    reactions_other: '{{count}} réactions sur « {{title}} »',
    reactionCount: '{{reaction}} ×{{count}}',
    comment: '{{name}} a commenté « {{title}} »',
    mention: '{{name}} parle de toi dans un commentaire sur « {{title}} »',
    reply: '{{name}} a répondu à ton commentaire sur « {{title}} »',
    memberFollows_one: '{{count}} personne de plus te suit',
    memberFollows_other: '{{count}} personnes de plus te suivent',
    projectFollows_one: '{{count}} personne de plus suit « {{title}} »',
    projectFollows_other: '{{count}} personnes de plus suivent « {{title}} »',
    hidden:
      'Ton commentaire sur « {{title}} » a été masqué par la personne qui a publié le projet. Il reste visible pour toi et pour cette personne.',
    handle: 'Ton pseudo est @{{handle}}, tiré de ton nom. Tu peux le changer dans Mon profil.',
    removed: {
      project: 'Ton projet « {{title}} » a été retiré par la modération',
      note: 'Ta note sur « {{title}} » a été retirée par la modération',
      comment: 'Ton commentaire sur « {{title}} » a été retiré par la modération',
      // Tranche 7b, règle 9 : sur le projet d'un membre qui t'a bloqué, ni titre ni lien.
      commentElsewhere: 'Ton commentaire a été retiré par la modération',
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
      comment: {
        removed: 'Ton signalement d’un commentaire a été traité : le commentaire a été retiré.',
        dismissed: 'Ton signalement d’un commentaire a été traité : nous ne l’avons pas retiré.',
      },
      member: {
        removed: 'Ton signalement d’un profil a été traité : la modération est intervenue.',
        dismissed: 'Ton signalement d’un profil a été traité : nous n’avons rien changé.',
      },
      contest: 'Pas d’accord ? Écris-nous : {{contactEmail}}',
    },
    // Tranche 7c : la suspension de son compte, et sa fin.
    suspended: 'Ton compte a été suspendu jusqu’au {{date}} à {{time}} (heure de Paris)',
    suspendedIndefinite: 'Ton compte a été suspendu jusqu’à nouvel ordre',
    suspensionEnded: {
      ended: 'Ta suspension a pris fin : tu peux de nouveau publier et interagir.',
      lifted: 'Ta suspension a été levée : tu peux de nouveau publier et interagir.',
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
    network: 'Impossible de joindre {{appName}}. Vérifie ta connexion et réessaie.',
  },
} as const
