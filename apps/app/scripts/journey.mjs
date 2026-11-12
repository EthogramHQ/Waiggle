// Le parcours réel d'un membre, joué dans un vrai navigateur à la place de Louis : deux personnes
// s'inscrivent, l'une suit l'autre et publie un projet avec des photos, l'autre le voit arriver dans
// son fil et le regarde, réagit et commente en mentionnant l'auteur (qui le voit dans ses notifications,
// répond, puis masque le commentaire). Un troisième membre signale un second commentaire, qu'un
// administrateur retire (tranche 7a) : celui qui a signalé est prévenu, l'auteur voit pourquoi, les
// autres ne le voient plus. Depuis la confirmation de son signalement, ce membre bloque aussi
// l'auteur du commentaire (tranche 7b) : chacun ne voit plus l'autre, puis il le débloque depuis
// ses « Réglages ». Au début, le premier membre change aussi d'adresse e-mail (tranche « adresse »),
// puis se reconnecte avec la nouvelle. Tranche R2 (« Le compte ») : « Mon compte » devient
// « Réglages », en rubriques (/settings/<rubrique>) ; le second membre renvoie son lien de
// vérification depuis « Vérifie ta boîte mail » ; le premier oublie son mot de passe, en choisit un
// nouveau par le lien reçu, puis le change depuis la rubrique « Sécurité » : chaque fois, son autre
// appareil est déconnecté. Puis le projet devient privé, est supprimé, et le compte aussi. À chaque
// étape, on vérifie ce que voit chacun (le membre, l'autre membre, une personne sans compte) et ce
// qui reste sur le disque du serveur.
//
// Usage : node apps/app/scripts/journey.mjs <adresse de l'appli> <adresse de l'API>
// Variables d'environnement :
//   JOURNEY_INVITE_CODE  le code d'invitation du serveur essayé ;
//   JOURNEY_MAIL_CMD     une commande qui affiche les logs de l'API, où le serveur d'essai écrit
//                        ses e-mails (ALLOW_CONSOLE_MAIL) : on y lit les liens de vérification ;
//   JOURNEY_MEDIA_CMD    (facultatif) une commande qui liste les fichiers du dossier des médias,
//                        pour vérifier que les fichiers disparaissent avec ce qu'ils illustrent ;
//   JOURNEY_ADMIN_CMD    (facultatif) une commande qui fait d'un membre un administrateur de la
//                        modération, son adresse ajoutée à la fin (infra/grant-admin.sh sur la
//                        pile d'essai). Sans elle, la base doit le faire seule : le parcours local
//                        (journey-local.mjs) prépare la sienne pour le compte « admin-… » ;
//   JOURNEY_SHELL        (facultatif) le shell de ces commandes (par défaut celui du système).
// La pile d'essai (infra/stack-test.sh) le lance sur https://ruche.localhost. Jamais sur le vrai site :
// il crée des comptes, et le vrai site n'écrit pas ses e-mails dans les logs.
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'
import { chromium } from 'playwright'

const [appUrl, apiUrl] = process.argv.slice(2)
const inviteCode = process.env.JOURNEY_INVITE_CODE ?? ''
const mailCommand = process.env.JOURNEY_MAIL_CMD
const mediaCommand = process.env.JOURNEY_MEDIA_CMD
const shell = process.env.JOURNEY_SHELL
const adminCommand = process.env.JOURNEY_ADMIN_CMD
if (!appUrl?.startsWith('http') || !apiUrl?.startsWith('http') || !mailCommand) {
  console.error(
    'Usage : JOURNEY_MAIL_CMD=… node apps/app/scripts/journey.mjs <adresse de l’appli> <adresse de l’API>',
  )
  process.exit(2)
}

// --- Petits outils ---------------------------------------------------------------------------

const step = (text) => console.log(`\n▶ ${text}`)
const fail = (text) => {
  throw new Error(text)
}
/**
 * Cherche un élément par son rôle et son nom lu, en nom EXACT par défaut. Playwright, lui, cherche
 * par défaut « un nom qui contient » le texte, sans tenir compte de la casse : « Mon agent de
 * recettes » trouvait aussi le lien « Tester Mon agent de recettes, ouvre un site externe », et le
 * parcours échouait loin de la cause (R4). Ici, `exact: true` (nom entier, majuscules comprises) est
 * la règle ; une recherche partielle voulue le dit, `{ exact: false }`, avec la raison en commentaire.
 * `scope` est une page ou un morceau de page (un Locator). Sans `name`, on cherche le rôle seul.
 * Une expression régulière comme nom reste telle quelle (`exact` n'y change rien).
 */
const byRole = (scope, role, name, options = {}) =>
  scope.getByRole(role, name === undefined ? options : { exact: true, ...options, name })
/**
 * R5b : l'exemplaire visible d'un texte de commentaire. Il est aussi repris, caché, dans ce qui décrit
 * les boutons de sa carte, et dans la mesure de « Lire la suite » ; Playwright compte certaines de
 * ces copies comme visibles (elles occupent un peu de place) : on garde la première.
 */
const shownText = (page, text, exact = true) =>
  page.getByText(text, { exact }).filter({ visible: true }).first()
/** R5b : ce membre passe sur un téléphone (la feuille des commentaires), puis revient à l'ordinateur. */
const asPhone = (page) => page.setViewportSize({ width: 390, height: 844 })
const asDesktop = (page) => page.setViewportSize({ width: 1280, height: 900 })
const expectEqual = (what, actual, expected) => {
  if (actual !== expected) fail(`${what} : attendu ${expected}, obtenu ${actual}`)
  console.log(`  ok : ${what} (${actual})`)
}
// Attend qu'une condition devienne vraie : le serveur traite les envois les uns après les autres.
const waitFor = async (what, check, timeout = 15_000) => {
  const end = Date.now() + timeout
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() > end) fail(`délai dépassé : ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

/**
 * Une image PNG d'une seule couleur, fabriquée ici même (sans fichier ni dépendance) : un PNG est
 * une signature suivie de « morceaux » (en-tête, pixels compressés, fin), chacun avec sa somme de
 * contrôle CRC.
 */
const png = (width, height, [r, g, b]) => {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8 bits par couleur, en RVB, sans entrelacement
  // Chaque ligne commence par un octet « filtre » (0 : aucun), puis ses pixels.
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3)])
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3)
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', pixels),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
const image = (name, width, height, color) => ({
  name: `${name}.png`,
  mimeType: 'image/png',
  buffer: png(width, height, color),
})

/** Les fichiers du dossier des médias, rangés par sous-dossier. */
const mediaFiles = () => {
  const lines = execSync(mediaCommand, { encoding: 'utf8', shell })
    .split('\n')
    .map((line) => line.replaceAll('\\', '/')) // les chemins Windows séparent par « \ »
  const count = (folder) => lines.filter((line) => line.includes(`/${folder}/`)).length
  return { avatars: count('avatars'), visuals: count('visuals') }
}
// Ce qui est déjà sur le disque avant le parcours : on ne compte que ce qu'il ajoute ou retire.
const before = mediaCommand ? mediaFiles() : { avatars: 0, visuals: 0 }
const expectMedia = async (what, added) => {
  if (!mediaCommand) return console.log(`  (fichiers non vérifiés : ${what})`)
  const expected = {
    avatars: before.avatars + added.avatars,
    visuals: before.visuals + added.visuals,
  }
  // Un fichier est effacé juste après la réponse de l'API : on lui laisse un instant.
  const files = await waitFor(what, () => {
    const files = mediaFiles()
    return files.avatars === expected.avatars && files.visuals === expected.visuals && files
  }).catch(() => mediaFiles())
  expectEqual(`${what} : avatars sur le disque`, files.avatars, expected.avatars)
  expectEqual(`${what} : photos sur le disque`, files.visuals, expected.visuals)
}

/**
 * Le lien de vérification envoyé à cette adresse (la console de l'API écrit l'e-mail entier) : celui
 * du dernier e-mail reçu. `except` (tranche « adresse ») : un lien déjà lu, qu'on ne veut pas ; on
 * attend alors l'e-mail suivant (l'adresse de Léa a déjà reçu celui de son inscription).
 */
const verificationLink = (email, except) =>
  waitFor(`lien de vérification pour ${email}`, () => {
    const logs = execSync(mailCommand, { encoding: 'utf8', shell, maxBuffer: 64 * 1024 * 1024 })
    const block = logs.split(`E-mail pour ${email}`).at(-1)
    if (block === logs) return null
    const link = block.match(/https?:\/\/\S+verify-email\S+/)?.[0] ?? null
    return link === except ? null : link
  })

/**
 * Tranche R2 : les e-mails reçus à cette adresse, du plus ancien au plus récent, chacun coupé à sa
 * fin (« --- fin --- ») : la console écrit les e-mails les uns après les autres, à toutes les
 * adresses mêlées.
 */
const mailsTo = (email) => {
  const logs = execSync(mailCommand, { encoding: 'utf8', shell, maxBuffer: 64 * 1024 * 1024 })
  return logs
    .split(`E-mail pour ${email} ---`)
    .slice(1)
    .map((block) => block.split('--- fin ---')[0])
}
/**
 * Le lien qui répond à `pattern` dans un e-mail arrivé après les `count` premiers à cette adresse.
 * Deux liens de vérification fabriqués dans la même seconde peuvent être identiques : on compte les
 * e-mails au lieu de comparer les liens.
 */
const linkAfter = (email, count, pattern, what) =>
  waitFor(`${what} pour ${email}`, () =>
    mailsTo(email)
      .slice(count)
      .map((mail) => mail.match(pattern)?.[0])
      .find(Boolean),
  )
const resetLink = /https?:\/\/\S+reset-password\?token=\S+/

// --- Le navigateur ---------------------------------------------------------------------------

const problems = []
const browser = await chromium.launch()
const person = async (who) => {
  // ignoreHTTPSErrors : la pile d'essai utilise les certificats locaux de Caddy.
  const context = await browser.newContext({
    locale: 'fr-FR',
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => problems.push(`${who}, ${page.url()} : ${error.message}`))
  return { context, page, request: context.request }
}
/** Le code HTTP d'une adresse, demandée avec la session de cette personne (ou sans session). */
const statusFor = async (someone, url) => (await someone.request.get(url)).status()
/** Le projet, lu par l'API avec la session de son auteur. */
const readProject = async (someone, id) => {
  const res = await someone.request.get(`${apiUrl}/v1/projects/${id}`)
  if (!res.ok()) fail(`lecture du projet : HTTP ${res.status()}`)
  return res.json()
}
/**
 * Ouvre une page et attend qu'elle soit prête. La page arrive pré-rendue, puis React « l'hydrate »
 * (y branche son code) : un champ rempli avant ce moment serait vidé.
 */
const open = async (page, url) => {
  await page.goto(url)
  // Le calme réseau, au plus 5 secondes : une page « introuvable » peut réessayer en arrière-plan.
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
  await page.waitForTimeout(800) // comme site-check.mjs : le temps de l'hydratation
}
/**
 * R6a : la catégorie (obligatoire pour publier) se choisit dans la seconde feuille « Catégorie et
 * outils », ouverte par la ligne « Catégorie », puis « OK ».
 */
const chooseCategory = async (page, category) => {
  await page.getByRole('button', { name: /^Catégorie(?! et outils)/ }).click()
  await page.getByRole('checkbox', { name: new RegExp(`^${category}`) }).click()
  await byRole(page, 'button', 'OK').click()
}
/**
 * R6a : « Publier » d'un projet visible des membres ramène au fil avec `?published=<id>` (la danse
 * de l'abeille, puis « Projet publié »), et l'adresse est nettoyée ensuite : on lit l'identifiant au
 * passage.
 */
const publishToFeed = async (page) => {
  await Promise.all([
    page.waitForURL((url) => url.searchParams.has('published')),
    byRole(page, 'button', 'Publier').last().click(), // le premier est celui de la barre du haut
  ])
  return new URL(page.url()).searchParams.get('published')
}
/** Touche un bouton qui ouvre le choix d'un fichier, et donne ce fichier. */
const pick = async (page, button, file) => {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button.click()])
  await chooser.setFiles(file)
}

const password = `parcours-${randomBytes(8).toString('hex')}`
/**
 * S'inscrire, puis ouvrir le lien de vérification. Avec `resend` (tranche R2), la personne touche
 * d'abord « Renvoyer l'e-mail » sur « Vérifie ta boîte mail », et c'est le lien renvoyé qui active
 * son compte.
 */
const signUp = async (someone, name, { resend = false } = {}) => {
  const email = `${name.toLowerCase()}-${randomBytes(4).toString('hex')}@example.com`
  const { page } = someone
  await open(page, `${appUrl}/sign-up`)
  await page.getByLabel('Nom affiché', { exact: true }).fill(name)
  await page.getByLabel('Adresse e‑mail').fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByLabel('Code d’invitation').fill(inviteCode)
  // R2 : sur ordinateur, « Créer un compte » est l'onglet ; le bouton dit « Créer mon compte ».
  await byRole(page, 'button', 'Créer mon compte').click()
  await page.waitForURL(/\/check-email/)
  // Le lien connecte au compte, puis mène à la page « Adresse vérifiée ».
  let link = await verificationLink(email)
  if (resend) {
    // Le premier e-mail est arrivé : on compte les e-mails reçus, puis on demande le suivant.
    const received = mailsTo(email).length
    await byRole(page, 'button', /^Renvoyer l.e‑mail$/).click()
    // La phrase reste vraie dans les cas que l'API cache (relecture juridique de R2, B1).
    await page
      .getByText('Si cette adresse attend sa vérification, un nouvel e‑mail vient de partir.', {
        exact: true,
      })
      .waitFor()
    link = await linkAfter(email, received, /https?:\/\/\S+verify-email\S+/, 'lien renvoyé')
    console.log(`  ok : ${name} a reçu un second lien de vérification`)
  }
  await open(page, link)
  await page.getByText('Adresse vérifiée').waitFor()
  console.log(`  ok : ${name} inscrite et vérifiée${resend ? ' par le lien renvoyé' : ''}`)
  return { email, link }
}

/** Se connecter depuis la page « Se connecter », comme une personne. */
const signIn = async (someone, email, secret) => {
  const { page } = someone
  await open(page, `${appUrl}/sign-in`)
  await page.getByLabel('Adresse e‑mail').fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(secret)
  await byRole(page, 'button', 'Me connecter').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'))
}

/**
 * Les réglages, ouverts comme un membre (R3) : la photo « Moi » de la barre du haut mène à sa page,
 * dont la roue « Réglages » ouvre les réglages ; puis la rubrique (`name`) dans la colonne des
 * rubriques, et on attend son adresse (`path`).
 */
const openSettings = async (someone, name, path) => {
  const { page } = someone
  await open(page, `${appUrl}/`)
  await byRole(page, 'link', 'Moi').first().click()
  await page.waitForURL((url) => url.pathname === '/me')
  // La roue est un bouton ou un lien selon la plateforme : on accepte les deux.
  await byRole(page, 'button', 'Réglages')
    .or(byRole(page, 'link', 'Réglages'))
    .first()
    .click()
  await page.waitForURL((url) => url.pathname === '/settings')
  if (!name) return
  await byRole(byRole(page, 'navigation', 'Réglages'), 'link', name).click()
  await page.waitForURL((url) => url.pathname === path)
}

const lea = await person('Léa')
const sam = await person('Sam')
const visitor = await person('Visiteur')
// Tranche 7a : Malik signale un commentaire, l'administrateur de la modération le traite.
const malik = await person('Malik')
const admin = await person('Admin')
// Tranche 7c : Karim, que l'administrateur suspend 7 jours, puis dont il lève la suspension.
const karim = await person('Karim')

try {
  step('Deux personnes s’inscrivent avec le code d’invitation, et vérifient leur adresse')
  const leaSignUp = await signUp(lea, 'Lea')
  // Tranche R2 : Sam ne trouve pas le premier e-mail ; il en demande un autre, qui active son compte.
  await signUp(sam, 'Sam', { resend: true })

  step('Léa choisit une photo de profil, depuis la rubrique « Mon profil » des réglages')
  await openSettings(lea, 'Mon profil', '/settings/profile')
  const avatarImage = image('avatar', 600, 600, [240, 180, 0])
  /**
   * Toucher « Changer la photo » et attendre le choix du fichier, 10 s au plus. Rend ce qui a
   * manqué (le clic refusé et pourquoi, ou aucun choix de fichier), ou null si la photo est partie.
   */
  const changeAvatar = async () => {
    const chooser = lea.page.waitForEvent('filechooser', { timeout: 10_000 }).catch(() => null)
    const refused = await byRole(lea.page, 'button', 'Changer la photo')
      .click({ timeout: 10_000 })
      .then(
        () => null,
        (error) => error.message.split('\n').slice(0, 4).join(' '),
      )
    const picked = await chooser
    if (!picked) return refused ?? 'clic reçu, mais aucun choix de fichier ne s’ouvre'
    await picked.setFiles(avatarImage)
    await lea.page.getByText('Photo mise à jour.').waitFor()
    return null
  }
  const avatarMissed = await changeAvatar()
  if (avatarMissed) {
    // Un défaut de l'appli, pas du parcours : on le note (le parcours finira en échec), on essaie
    // encore après un rechargement de la page, puis, au besoin, on envoie la photo par l'API pour
    // que les étapes suivantes gardent leur sens.
    problems.push(`« Changer la photo », arrivé par les réglages : ${avatarMissed}`)
    console.error(`  ÉCHEC : « Changer la photo », arrivé par les réglages : ${avatarMissed}`)
    await open(lea.page, `${appUrl}/settings/profile`)
    const missedAgain = await changeAvatar()
    console.error(`  après rechargement : ${missedAgain ?? 'la photo part'}`)
    if (missedAgain) {
      problems.push(`« Changer la photo », page rechargée : ${missedAgain}`)
      const sent = await lea.request.post(`${apiUrl}/v1/me/avatar`, {
        headers: { Origin: appUrl },
        multipart: { avatar: avatarImage },
      })
      console.error(`  photo envoyée par l’API : HTTP ${sent.status()}`)
      await open(lea.page, `${appUrl}/settings/profile`)
    }
  }
  const me = await (await lea.request.get(`${apiUrl}/v1/me`)).json()
  const avatarUrl = me.avatarUrl ?? fail('pas d’adresse d’avatar')
  await expectMedia('après l’avatar', { avatars: 1, visuals: 0 })

  // Tranche 6a : un pseudo lui a été donné à la vérification ; elle en choisit un autre, tapé
  // avec le « @ » comme on l'écrit souvent : l'appli le retire avant d'envoyer.
  step('Léa change de pseudo')
  const handle = `lea_${randomBytes(3).toString('hex')}`
  await lea.page.getByLabel('Pseudo', { exact: true }).fill(`@${handle}`)
  await byRole(lea.page, 'button', 'Enregistrer').last().click()
  await lea.page.getByText('Profil enregistré.').waitFor()
  const renamed = await (await lea.request.get(`${apiUrl}/v1/me`)).json()
  expectEqual('pseudo de Léa', renamed.handle, handle)

  // Tranche 6c : un réglage d'e-mail s'enregistre dès qu'on le touche, sans « Enregistrer ».
  // R2 : les réglages d'e-mail sont la rubrique « Notifications ». R8 : « Le récap » est un
  // interrupteur parmi les lignes de choix, et plus aucune phrase ne confirme l'enregistrement : la
  // page rechargée et l'API disent si le réglage est parti.
  step('Léa coupe le récap ; la page rechargée le montre coupé')
  await openSettings(lea, 'Notifications', '/settings/notifications')
  await byRole(lea.page, 'switch', 'Le récap', { checked: true }).click()
  await byRole(lea.page, 'switch', 'Le récap', { checked: false }).waitFor()
  await waitFor(
    'récap coupé enregistré',
    async () =>
      (await (await lea.request.get(`${apiUrl}/v1/me/email-preferences`)).json()).weeklyRecap ===
      false,
  )
  await open(lea.page, `${appUrl}/settings/notifications`)
  await byRole(lea.page, 'switch', 'Le récap', { checked: false }).waitFor()
  const emails = await (await lea.request.get(`${apiUrl}/v1/me/email-preferences`)).json()
  expectEqual('récap de Léa', emails.weeklyRecap, false)

  // Tranche « adresse » : deux liens, l'un à l'ancienne adresse (son accord), l'autre à la nouvelle
  // (sa vérification). Léa les ouvre dans son navigateur, où elle est connectée : elle le reste. R2
  // (décision D1) : le second lien n'aboutit d'ailleurs que dans sa session.
  step(
    'Léa change d’adresse e‑mail (rubrique « Compte ») : un lien à l’ancienne, puis à la nouvelle',
  )
  const newEmail = `lea-nouvelle-${randomBytes(4).toString('hex')}@example.com`
  await openSettings(lea, 'Compte', '/settings/account')
  // Une ligne-lien, dont le nom lu dit l'action puis l'adresse actuelle.
  await byRole(lea.page, 'link', /^Changer d.adresse e‑mail/).click()
  await lea.page.waitForURL((url) => url.pathname === '/settings/account/email')
  await lea.page.getByLabel('Nouvelle adresse e‑mail').fill(newEmail)
  await lea.page.getByLabel('Confirme avec ton mot de passe').fill(password)
  await byRole(lea.page, 'button', 'Envoyer le lien').click()
  await lea.page.getByText('Regarde ta boîte mail actuelle').waitFor()
  // Le premier lien part vers l'adresse ACTUELLE, qui a déjà reçu celui de l'inscription.
  await open(lea.page, await verificationLink(leaSignUp.email, leaSignUp.link))
  await lea.page.waitForURL((url) => url.pathname === '/email-change/confirmed')
  await byRole(lea.page, 'heading', 'Plus qu’une étape').waitFor()
  // Rien n'a encore changé : il faut aussi le second lien.
  const halfway = await (await lea.request.get(`${apiUrl}/v1/me`)).json()
  expectEqual('adresse de Léa après le premier lien', halfway.email, leaSignUp.email)
  await open(lea.page, await verificationLink(newEmail))
  await lea.page.waitForURL((url) => url.pathname === '/email-change/done')
  await byRole(lea.page, 'heading', 'Adresse changée').waitFor()
  // La page lit la nouvelle adresse dans la session, jamais dans l'adresse de la page (scénario).
  await lea.page.getByText(newEmail, { exact: false }).first().waitFor()
  const doneUrl = lea.page.url()
  expectEqual(
    'adresse e‑mail absente de l’URL',
    doneUrl.includes(newEmail) || doneUrl.includes(encodeURIComponent(newEmail)),
    false,
  )
  const changed = await (await lea.request.get(`${apiUrl}/v1/me`)).json()
  expectEqual('nouvelle adresse de Léa', changed.email, newEmail)
  expectEqual('nouvelle adresse vérifiée', changed.emailVerified, true)

  // Tranche R2 : Léa est aussi connectée sur un autre appareil (un second navigateur). Le mot de
  // passe choisi par le lien « oublié », puis celui changé dans les réglages, l'en déconnectent.
  // Peu de connexions en tout : sur la pile d'essai, la connexion n'en permet que 5 par quart
  // d'heure depuis une même adresse IP (AUTH_RATE_RULES de l'API) ; le parcours en fait 4.
  step('Léa se connecte aussi sur son téléphone, avec sa nouvelle adresse')
  const leaPhone = await person('Léa (téléphone)')
  const meUrl = `${apiUrl}/v1/me`
  await signIn(leaPhone, newEmail, password)
  expectEqual('session du téléphone de Léa', await statusFor(leaPhone, meUrl), 200)

  step('Léa se déconnecte (rubrique « Compte ») : l’ancienne adresse ne la connecte plus')
  await openSettings(lea, 'Compte', '/settings/account')
  await byRole(lea.page, 'button', 'Me déconnecter').click()
  await lea.page.waitForURL((url) => url.pathname === '/')
  await open(lea.page, `${appUrl}/sign-in`)
  await lea.page.getByLabel('Adresse e‑mail').fill(leaSignUp.email)
  await lea.page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await byRole(lea.page, 'button', 'Me connecter').click()
  await lea.page.getByText('Adresse e‑mail ou mot de passe incorrect.').waitFor()
  console.log('  ok : l’ancienne adresse est refusée')

  // Tranche R2 : « Mot de passe oublié ? », l'adresse, puis le lien reçu (lu dans le journal de
  // l'API, comme les liens de vérification) ; le nouveau mot de passe déconnecte tous ses appareils.
  step('Léa a oublié son mot de passe : elle en choisit un nouveau par le lien reçu')
  await byRole(lea.page, 'link', /^Mot de passe oublié/).click()
  await lea.page.waitForURL((url) => url.pathname === '/forgot-password')
  // Par le rôle : sous Expo Router web, « Se connecter » reste dans la page, cachée, avec son
  // propre champ « Adresse e-mail » (getByLabel trouverait les deux ; getByRole ignore le caché).
  await byRole(lea.page, 'textbox', 'Adresse e‑mail').fill(newEmail)
  // On compte les e-mails déjà reçus à cette adresse : le lien attendu est dans le suivant.
  const mailsBeforeReset = mailsTo(newEmail).length
  await byRole(lea.page, 'button', 'Envoyer le lien').click()
  await lea.page
    .getByText('Si un compte existe pour cette adresse, un e‑mail vient de partir.')
    .waitFor()
  await open(
    lea.page,
    await linkAfter(newEmail, mailsBeforeReset, resetLink, 'lien du mot de passe oublié'),
  )
  // La page range le jeton et le retire de l'adresse affichée.
  await lea.page.waitForURL((url) => url.pathname === '/reset-password')
  const passwordAfterReset = `oubli-${randomBytes(8).toString('hex')}`
  await lea.page.getByLabel('Nouveau mot de passe', { exact: true }).fill(passwordAfterReset)
  await byRole(lea.page, 'button', 'Enregistrer le mot de passe').click()
  await lea.page.waitForURL((url) => url.pathname === '/sign-in')
  await lea.page.getByText('Mot de passe changé. Connecte-toi avec le nouveau.').waitFor()
  console.log('  ok : « Se connecter » dit « Mot de passe changé »')
  await waitFor(
    'téléphone de Léa déconnecté par le nouveau mot de passe',
    async () => (await statusFor(leaPhone, meUrl)) === 401,
  )
  console.log('  ok : la session du téléphone, ouverte avant, est coupée (401)')
  await lea.page.getByLabel('Adresse e‑mail').fill(newEmail)
  await lea.page.getByLabel('Mot de passe', { exact: true }).fill(passwordAfterReset)
  await byRole(lea.page, 'button', 'Me connecter').click()
  await lea.page.waitForURL((url) => !url.pathname.startsWith('/sign-in'))
  const again = await (await lea.request.get(meUrl)).json()
  expectEqual('Léa reconnectée, nouvelle adresse et nouveau mot de passe', again.email, newEmail)

  // Tranche R2 : changer son mot de passe depuis les réglages coupe les autres appareils, et garde
  // celui-ci (le serveur l'impose).
  step('Léa change son mot de passe (rubrique « Sécurité ») : son téléphone est déconnecté')
  await signIn(leaPhone, newEmail, passwordAfterReset)
  expectEqual('téléphone de Léa reconnecté', await statusFor(leaPhone, meUrl), 200)
  await openSettings(lea, 'Sécurité', '/settings/security')
  await byRole(lea.page, 'link', 'Changer mon mot de passe').click()
  await lea.page.waitForURL((url) => url.pathname === '/settings/security/password')
  const passwordAfterChange = `change-${randomBytes(8).toString('hex')}`
  await lea.page.getByLabel('Mot de passe actuel', { exact: true }).fill(passwordAfterReset)
  await lea.page.getByLabel('Nouveau mot de passe', { exact: true }).fill(passwordAfterChange)
  await byRole(lea.page, 'button', 'Changer le mot de passe').click()
  // Le toast se lit sur la rubrique où l'on revient.
  await lea.page.waitForURL((url) => url.pathname === '/settings/security')
  // La couche des toasts peut aussi porter le texte, cachée, pour les lecteurs d'écran : le visible.
  await lea.page
    .getByText('Mot de passe changé', { exact: true })
    .filter({ visible: true })
    .first()
    .waitFor()
  await waitFor(
    'téléphone de Léa déconnecté par le changement',
    async () => (await statusFor(leaPhone, meUrl)) === 401,
  )
  console.log('  ok : la session du téléphone est coupée (401)')
  expectEqual('session de cet appareil, gardée', await statusFor(lea, meUrl), 200)
  await leaPhone.context.close()

  step(
    'Sam ne suit personne : son fil l’attend ; il lit le pseudo de Léa et la suit depuis sa page',
  )
  await open(sam.page, `${appUrl}/`)
  // R4 (F-Fil9) : le premier lancement accueille au lieu de constater un vide.
  await sam.page.getByText('Ton fil t’attend').waitFor()
  await open(sam.page, `${appUrl}/members/${me.id}`)
  await sam.page.getByText(`@${handle}`, { exact: true }).waitFor()
  await byRole(sam.page, 'switch', 'Suivre Lea').click()
  // Une fois suivie, le nom lu reprend le texte affiché : « Tu suis Lea » (R3), activé.
  await byRole(sam.page, 'switch', /^Tu suis Lea/, { checked: true }).waitFor()
  // L'interrupteur passe à « Suivi » avant la réponse de l'API (affichage optimiste) : on attend
  // que l'API ait enregistré l'abonnement, comme pour les réactions plus bas (course vue en CI, 6c).
  const readLeaForSam = async () => (await sam.request.get(`${apiUrl}/v1/members/${me.id}`)).json()
  await waitFor('abonnement enregistré', async () => (await readLeaForSam()).isFollowed === true)
  const leaForSam = await readLeaForSam()
  expectEqual('Léa suivie par Sam', leaForSam.isFollowed, true)
  expectEqual('abonnés de Léa', leaForSam.followerCount, 1)

  step('Léa publie un projet avec trois photos et une couverture verticale')
  await open(lea.page, `${appUrl}/projects/new`)
  await lea.page.getByLabel('Titre').fill('Mon agent de recettes')
  await lea.page.getByLabel('En une phrase').fill('Il propose un dîner avec ce qui reste.')
  // Un lien de démo : la carte du fil de Sam portera « Tester » (R4).
  await lea.page.getByLabel('Lien de la démo, facultatif').fill('https://example.com/recettes')
  await chooseCategory(lea.page, 'Cuisine')
  // Chaque photo est d'abord réduite sur l'appareil : comme une personne, on attend de voir sa
  // vignette (et son bouton « Retirer ») avant de passer à la suivante, puis de publier.
  const add = byRole(lea.page, 'button', 'Ajouter des photos')
  const colors = { rouge: [200, 40, 40], vert: [40, 160, 60], bleu: [40, 80, 200] }
  for (const [n, [name, color]] of Object.entries(colors).entries()) {
    await pick(lea.page, add, image(name, 1200, 800, color))
    await byRole(lea.page, 'button', `Retirer la photo ${n + 1}`).waitFor()
  }
  await pick(
    lea.page,
    byRole(lea.page, 'button', 'Choisir une couverture verticale'),
    image('portrait', 600, 1000, [120, 60, 160]),
  )
  await byRole(lea.page, 'button', 'Retirer la couverture verticale').waitFor()
  const projectId = await publishToFeed(lea.page)
  await lea.page.getByText('Projet publié').waitFor()
  let project = await readProject(lea, projectId)
  expectEqual('photos de la galerie', project.visuals.length, 3)
  expectEqual('couverture verticale', project.portraitCover !== null, true)
  await expectMedia('après la publication', { avatars: 1, visuals: 4 })
  const [red, green, blue] = project.visuals.map((visual) => visual.id)

  step('Léa met la troisième photo en couverture, puis retire la deuxième')
  await open(lea.page, `${appUrl}/projects/${projectId}`)
  await byRole(lea.page, 'button', 'Modifier').click()
  await lea.page.waitForURL(/\/edit$/)
  await byRole(lea.page, 'button', 'Déplacer la photo 3').click()
  await byRole(lea.page, 'menuitem', 'Mettre en couverture').click()
  await waitFor('nouvelle couverture', async () => {
    project = await readProject(lea, projectId)
    return project.visuals[0].id === blue
  })
  // L'ordre est maintenant bleu, rouge, vert : la deuxième est la rouge. Le serveur a fini, mais
  // l'écran peut encore montrer l'ancien ordre, boutons désactivés, le temps que la réponse arrive.
  // Cliquer tout de suite viserait la vignette qui portait « photo 2 » avant (la verte, que React
  // déplace ensuite) : on attend que l'écran soit redessiné, ses boutons de nouveau actifs.
  const removeSecond = byRole(lea.page, 'button', 'Retirer la photo 2')
  await waitFor('galerie redessinée', async () => removeSecond.isEnabled())
  await removeSecond.click()
  await waitFor('photo retirée', async () => {
    project = await readProject(lea, projectId)
    return project.visuals.length === 2
  })
  expectEqual(
    'ordre de la galerie',
    project.visuals.map((visual) => visual.id).join(),
    [blue, green].join(),
  )
  expectEqual(
    'photo retirée',
    project.visuals.some((visual) => visual.id === red),
    false,
  )
  await expectMedia('après le retrait', { avatars: 1, visuals: 3 })
  const photoUrl = project.visuals[0].url

  step('Le projet de Léa arrive dans le fil de Sam ; il le teste, revient, et il est à jour')
  await open(sam.page, `${appUrl}/`)
  // Nom exact (défaut de byRole) : « Tester Mon agent de recettes, … » est aussi un lien de la carte (R4).
  await byRole(sam.page, 'link', 'Mon agent de recettes').waitFor()
  // La date relative de la carte (R4, F-Fil2) : « publié à l'instant », sans heure ni jour.
  await sam.page.getByText('à l’instant').first().waitFor()
  // « Tester » sort de l'appli : son nom lu le dit, et il passe par la page d'avertissement.
  await byRole(sam.page, 'link', 'Tester Mon agent de recettes, ouvre un site externe').click()
  await sam.page.waitForURL((url) => url.pathname === '/out')
  await byRole(sam.page, 'button', 'Ouvrir le site').waitFor()
  await byRole(sam.page, 'button', 'Rester sur Waiggle').click()
  await sam.page.waitForURL((url) => url.pathname === '/')
  await sam.page.getByText('Tu es à jour').waitFor()
  console.log('  ok : le projet est dans le fil de Sam, « Tester » mène à l’avertissement')

  step('Sam voit le projet et ses photos ; une personne sans compte ne voit rien')
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  await sam.page.getByText('Mon agent de recettes').first().waitFor()
  // L'auteur mène à sa page de membre, où le projet figure.
  await byRole(sam.page, 'link', 'Voir la page de Lea').click()
  await sam.page.waitForURL(/\/members\//)
  await byRole(sam.page, 'link', 'Mon agent de recettes').waitFor()
  console.log('  ok : Sam trouve le projet sur la page de Léa')
  expectEqual('photo, pour Sam', await statusFor(sam, photoUrl), 200)
  expectEqual('photo, sans compte', await statusFor(visitor, photoUrl), 404)
  expectEqual('avatar de Léa, pour Sam', await statusFor(sam, avatarUrl), 200)
  expectEqual('avatar de Léa, sans compte', await statusFor(visitor, avatarUrl), 404)

  // R7a : les testeurs et les mises à jour. Sam suit le projet et devient testeur ; Léa publie une
  // mise à jour (deux lignes, deux photos en avant / après) ; Sam voit la cloche, compare au clavier,
  // puis quitte les testeurs.
  step('Sam suit le projet, qui devient « Testable », et devient testeur')
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  await byRole(sam.page, 'switch', 'Suivre ce projet').click()
  await byRole(sam.page, 'switch', 'Projet suivi', { checked: true }).waitFor()
  // Le statut se change par l'API (le formulaire de modification est couvert plus haut) : « Rejoindre
  // les testeurs » n'existe que pour un projet « Testable » qui a une démo.
  const testable = await lea.request.patch(`${apiUrl}/v1/projects/${projectId}`, {
    headers: { Origin: appUrl },
    data: { status: 'testable' },
  })
  expectEqual('statut changé', testable.status(), 200)
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  await byRole(sam.page, 'button', 'Rejoindre les testeurs').click()
  await sam.page.getByRole('heading', { name: 'Rejoindre les testeurs', exact: true }).waitFor()
  await sam.page.waitForTimeout(800) // la feuille ignore les tapes de ses 600 premières ms
  await byRole(sam.page.getByRole('dialog'), 'button', 'Rejoindre les testeurs').click()
  // R7b : une fois inscrit, le bouton mène au coin des testeurs ; il se lit « lien » (correction 7).
  await byRole(sam.page, 'link', 'Le coin des testeurs').waitFor()
  await waitFor(
    'inscription aux testeurs enregistrée',
    async () => (await readProject(sam, projectId)).isTester === true,
  )
  console.log('  ok : Sam est testeur du projet de Léa')

  // R7b : le coin des testeurs. Sam envoie un retour ; Léa lance un appel et répond ; sa mise à jour
  // (plus bas) règle le retour.
  const samId = (await (await sam.request.get(`${apiUrl}/v1/me`)).json()).id
  const cornerApi = `${apiUrl}/v1/projects/${projectId}`
  step('Sam ouvre « Le coin des testeurs » et envoie un retour')
  await byRole(sam.page, 'link', 'Le coin des testeurs').click()
  await sam.page.waitForURL(`**/projects/${projectId}/testers`)
  await byRole(sam.page, 'tab', 'Retours').click()
  await byRole(sam.page, 'button', 'Envoyer un retour').click()
  await sam.page.getByRole('heading', { name: 'Ton retour', exact: true }).waitFor()
  await sam.page.waitForTimeout(800) // la feuille ignore les tapes de ses 600 premières ms
  await byRole(sam.page, 'radio', 'En partie').click()
  await byRole(sam.page, 'radio', 'Téléphone').click()
  await sam.page.getByLabel('Raconte, facultatif').fill('le score repart à zéro au niveau 3')
  await byRole(sam.page, 'button', 'Envoyer', { exact: true }).last().click()
  // La feuille se ferme sur le coin, où le retour paraît dans le fil de Sam.
  await sam.page.getByText('le score repart à zéro au niveau 3', { exact: true }).waitFor()
  await waitFor('retour enregistré', async () => {
    const res = await sam.request.get(`${cornerApi}/threads/${samId}/messages`)
    const { items } = await res.json()
    return (
      items.length === 1 &&
      items[0].kind === 'feedback' &&
      items[0].outcome === 'partly' &&
      items[0].device === 'phone' &&
      items[0].text === 'le score repart à zéro au niveau 3'
    )
  })
  console.log('  ok : le retour de Sam est dans son fil (« En partie », Téléphone)')

  step('Léa lance un appel, puis répond au retour de Sam')
  await open(lea.page, `${appUrl}/projects/${projectId}/testers`)
  await byRole(lea.page, 'button', 'Lancer un appel').click()
  await lea.page.getByRole('heading', { name: 'Nouvel appel', exact: true }).waitFor()
  await lea.page.waitForTimeout(800) // la feuille ignore les tapes de ses 600 premières ms
  await lea.page.getByLabel('Ton appel').fill('Essayez le niveau 3 ce week-end')
  await byRole(lea.page, 'button', 'Envoyer', { exact: true }).last().click()
  await lea.page.getByText('Essayez le niveau 3 ce week-end', { exact: true }).waitFor()
  await waitFor('appel enregistré', async () => {
    const { items } = await (await lea.request.get(`${cornerApi}/calls`)).json()
    return items.length === 1 && items[0].text === 'Essayez le niveau 3 ce week-end'
  })
  console.log('  ok : l’appel de Léa est publié')
  await byRole(lea.page, 'tab', 'Retours').click()
  await lea.page.getByRole('link', { name: /^Sam/ }).first().click()
  await lea.page.waitForURL(`**/projects/${projectId}/testers/threads/${samId}`)
  await lea.page.getByLabel(/^Répondre à /).fill('Merci Sam, je regarde ça')
  await byRole(lea.page, 'button', 'Envoyer la réponse').click()
  await waitFor('réponse enregistrée', async () => {
    const { items } = await (await lea.request.get(`${cornerApi}/threads/${samId}/messages`)).json()
    return items.length === 2 && items.some((one) => one.text === 'Merci Sam, je regarde ça')
  })
  console.log('  ok : Léa a répondu au retour de Sam')

  step('Léa publie une mise à jour : deux lignes, deux photos en avant / après')
  await open(lea.page, `${appUrl}/projects/${projectId}`)
  await byRole(lea.page, 'button', 'Publier une mise à jour').first().click()
  await lea.page.waitForURL(/\/update$/)
  await lea.page.getByLabel('Titre, facultatif').fill('Le dessert')
  await lea.page.getByLabel('Numéro de version, facultatif').fill('v1.3')
  await lea.page.getByLabel(/^Changement 1 sur /).fill('Il propose aussi un dessert')
  await byRole(lea.page, 'button', 'Ajouter une ligne').click()
  await lea.page.getByLabel(/^Changement 2 sur /).fill('Les quantités se calculent par personne')
  // La famille de la deuxième ligne : « Réparé » (une des trois que propose le bouton rond).
  await lea.page
    .getByRole('button', { name: /^Famille : /, exact: false })
    .nth(1)
    .click()
  await byRole(lea.page, 'menuitemradio', 'Réparé').click()
  // Deux photos, une à une (comme pour le projet : on attend la vignette avant la suivante).
  const addUpdatePhoto = lea.page.getByRole('button', { name: /^Ajouter des photos|choisis-les/ })
  for (const [n, color] of [
    [1, [200, 120, 60]],
    [2, [60, 140, 200]],
  ]) {
    await pick(lea.page, addUpdatePhoto.first(), image(`maj-${n}`, 1200, 800, color))
    await byRole(lea.page, 'button', `Retirer la photo ${n}`).waitFor()
  }
  // La vignette paraît dès le choix, avant la fin de l'envoi : « Publier » trop tôt répond
  // « Attends la fin de l'envoi des photos. ». On attend que plus aucune ne s'envoie.
  await waitFor('photos de la mise à jour envoyées', async () => {
    const sending = lea.page.getByRole('progressbar', { name: /^Envoi de la photo/ })
    return (await sending.count()) === 0
  })
  await byRole(lea.page, 'switch', 'Avant / après').click()
  // R7b : la partie « Retours réglés » propose le retour de Sam ; Léa le coche.
  await lea.page.getByText('Retours réglés', { exact: true }).waitFor()
  await lea.page.getByRole('checkbox', { name: /· En partie/ }).click()
  await byRole(lea.page, 'button', 'Publier', { exact: true }).last().click()
  await lea.page.getByText('Mise à jour publiée.').waitFor()
  await waitFor('mise à jour enregistrée', async () => {
    const res = await lea.request.get(`${apiUrl}/v1/projects/${projectId}/updates`)
    const { items } = await res.json()
    return items.length === 1 && items[0].beforeAfter === true && items[0].photos.length === 2
  })
  await waitFor('retour de Sam réglé par la mise à jour', async () => {
    const res = await lea.request.get(`${cornerApi}/threads/${samId}/messages`)
    const { items } = await res.json()
    return items.some((one) => one.kind === 'feedback' && one.settled?.update?.version === 'v1.3')
  })
  console.log('  ok : la mise à jour de Léa est publiée, avec son avant / après')

  step('Sam voit la cloche s’allumer, ouvre la frise et compare au clavier')
  await open(sam.page, `${appUrl}/`)
  await byRole(sam.page, 'button', /^Notifications, \d+ nouvelles?$/)
    .first()
    .click()
  // R8 : la ligne d'Activité nomme le projet, pas l'auteur (« … a une mise à jour v1.3 »).
  await byRole(sam.page, 'link', /Mon agent de recettes a une mise à jour v1\.3/).click()
  await sam.page.waitForURL(`**/projects/${projectId}/updates`)
  // Le curseur « Avant / après » : 50 au départ ; la flèche droite ajoute 10, Fin va au bout.
  const compare = byRole(sam.page, 'slider', 'Comparer avant et après')
  await compare.waitFor()
  expectEqual('curseur au départ', await compare.getAttribute('aria-valuenow'), '50')
  await compare.focus()
  await sam.page.keyboard.press('ArrowRight')
  await waitFor(
    'curseur déplacé',
    async () => (await compare.getAttribute('aria-valuenow')) === '60',
  )
  await sam.page.keyboard.press('End')
  await waitFor(
    'curseur au bout',
    async () => (await compare.getAttribute('aria-valuenow')) === '100',
  )
  console.log('  ok : Sam a comparé l’avant et l’après au clavier')

  // R7b : le retour de Sam est réglé par la mise à jour de Léa ; Sam le lit sous son retour.
  step('Sam lit « Réglé dans la v1.3 » sous son retour, dans le coin des testeurs')
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  await byRole(sam.page, 'link', 'Le coin des testeurs').click()
  await sam.page.waitForURL(`**/projects/${projectId}/testers`)
  await byRole(sam.page, 'tab', 'Retours').click()
  await sam.page.getByText('Réglé dans la v1.3', { exact: true }).waitFor()
  console.log('  ok : Sam lit « Réglé dans la v1.3 » sous son retour')

  // R7b : « Quitter les testeurs » est dans le menu « … » de la page du projet (la feuille « membre »
  // n'existe plus), avec une confirmation ; après quoi la page revient, « Rejoindre » reprend le focus.
  step('Sam quitte les testeurs, par le menu « … » de la page du projet')
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  await byRole(sam.page, 'button', 'Plus d’actions').click()
  await byRole(sam.page, 'menuitem', 'Quitter les testeurs').click()
  await sam.page.getByRole('dialog').waitFor()
  await sam.page.waitForTimeout(800) // la fenêtre ignore les tapes de ses 600 premières ms
  await byRole(sam.page.getByRole('dialog'), 'button', 'Quitter', { exact: true }).click()
  await byRole(sam.page, 'button', 'Rejoindre les testeurs').waitFor()
  await waitFor(
    'départ des testeurs enregistré',
    async () => (await readProject(sam, projectId)).isTester === false,
  )
  console.log('  ok : Sam a quitté les testeurs')

  step('Sam réagit « Waggle ! » et commente ; Léa répond, puis masque le commentaire de Sam')
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  // Le nom lu de chaque réaction dit son nombre, et « réagi » une fois posée.
  await byRole(sam.page, 'button', 'Waggle\u202f!, 0').click()
  await byRole(sam.page, 'button', 'Waggle\u202f!, 1, ta réaction').waitFor()
  await waitFor(
    'réaction enregistrée',
    async () => (await readProject(lea, projectId)).reactions.counts.bravo === 1,
  )
  console.log('  ok : Léa voit « Waggle ! » compté une fois')
  // Le total de la carte du fil (R4) : le nombre dessiné est caché au lecteur, le nom lu l'écrit.
  await open(sam.page, `${appUrl}/`)
  await sam.page.getByText('1 réaction', { exact: true }).waitFor()
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  // R5b : Sam commente depuis un téléphone. Aucun commentaire encore : le bouton ouvre la feuille,
  // le champ prêt à écrire. Il mentionne Léa par la suggestion, trouvée par le début de son nom
  // (« @Le » ; l'appli écrit « @pseudo » et une espace), puis finit sa phrase.
  const samSays = 'une soupe parfaite.'
  await asPhone(sam.page)
  await byRole(sam.page, 'button', 'Écrire un commentaire').click()
  const samField = sam.page.getByRole('combobox', { name: 'Écrire un commentaire' })
  await samField.fill('Testé ce soir, @Le')
  await byRole(sam.page, 'option', new RegExp(`^Lea, @${handle}`)).click()
  await samField.pressSequentially(samSays)
  await byRole(sam.page, 'button', 'Envoyer le commentaire').click()
  // L'avis n'est que lu par les lecteurs d'écran : c'est le commentaire qui apparaît, dans la feuille.
  await shownText(sam.page, samSays, false).waitFor()
  await waitFor(
    'commentaire de Sam enregistré',
    async () => (await readProject(lea, projectId)).commentCount === 1,
  )
  await byRole(sam.page, 'button', 'Fermer').click()
  await asDesktop(sam.page)

  // R8 : Léa est sur son téléphone. La ligne d'Activité (en miel : elle est nouvelle) mène à la page du
  // projet, dont l'adresse porte `?comment=<id>` : la feuille des commentaires s'ouvre sur la mention,
  // éclairée (sur le web, la carte éclairée est un groupe nommé « auteur : début du texte »).
  // Recharger la page rouvre la feuille sur le même commentaire ; la fermer retire le paramètre.
  step(
    'Léa voit la cloche, ouvre Activité : la mention mène à la réponse éclairée, dans la feuille',
  )
  await asPhone(lea.page)
  // Le nombre n'est relu que chaque minute : on recharge l'accueil pour le lire tout de suite.
  await open(lea.page, `${appUrl}/`)
  await byRole(lea.page, 'button', /^Notifications, \d+ nouvelles?$/)
    .first()
    .click()
  const mentionName = 'Sam parle de toi dans un commentaire sur Mon agent de recettes'
  // Le nom de la ligne finit par « Nouveau. » tant qu'elle est en miel ; la phrase, la date et
  // l'extrait passent avant (d'où l'expression régulière).
  await byRole(lea.page, 'link', new RegExp(`${mentionName}.*Nouveau\\.$`)).click()
  await lea.page.waitForURL(
    (url) => url.pathname === `/projects/${projectId}` && url.searchParams.has('comment'),
  )
  const contextUrl = lea.page.url()
  const litComment = byRole(lea.page, 'group', /^Sam : Testé ce soir/)
  await litComment.first().waitFor()
  console.log('  ok : la mention arrive éclairée dans la feuille des commentaires')
  // Le paramètre reste dans l'adresse tant que la feuille est ouverte : recharger la rouvre, sur le
  // même commentaire.
  await open(lea.page, contextUrl)
  await litComment.first().waitFor()
  expectEqual('adresse après rechargement', lea.page.url(), contextUrl)
  // Fermer la feuille retire le paramètre : la page redevient celle du projet.
  await byRole(lea.page, 'button', 'Fermer').click()
  await lea.page.waitForURL(
    (url) => url.pathname === `/projects/${projectId}` && !url.searchParams.has('comment'),
  )
  console.log('  ok : fermer la feuille retire ?comment= de l’adresse')
  await asDesktop(lea.page)

  step(
    'Léa règle « Commentaires sur tes projets » sur « Tout de suite » ; la mention n’est plus en miel',
  )
  await openSettings(lea, 'Notifications', '/settings/notifications')
  // Un seul type ouvert à la fois ; le nom de la ligne dit son choix actuel (« libellé, choix »).
  await byRole(lea.page, 'button', /^Commentaires sur tes projets, /).click()
  await byRole(lea.page, 'radio', 'Tout de suite').click()
  await byRole(lea.page, 'radio', 'Tout de suite', { checked: true }).waitFor()
  await waitFor(
    'réglage des commentaires enregistré',
    async () =>
      (await (await lea.request.get(`${apiUrl}/v1/me/email-preferences`)).json()).comments ===
      'now',
  )
  // De retour dans Activité : la même ligne, mais sans « Nouveau » (plus en miel). On attend d'abord
  // la ligne lue (elle prouve que la liste est arrivée), puis on compte celles encore nouvelles.
  await open(lea.page, `${appUrl}/notifications`)
  await byRole(lea.page, 'link', new RegExp(`${mentionName}(?!.*Nouveau)`)).waitFor()
  expectEqual(
    'lignes de mention encore en miel',
    await byRole(lea.page, 'link', new RegExp(`${mentionName}.*Nouveau\\.$`)).count(),
    0,
  )
  const unread = await (await lea.request.get(`${apiUrl}/v1/notifications/unread`)).json()
  expectEqual('nouveautés après la visite', unread.count, 0)
  await open(lea.page, `${appUrl}/projects/${projectId}`)
  // Dans le texte publié, la mention est une pastille : un lien vers la page de Léa, lu par son nom.
  await byRole(lea.page, 'link', 'Lea, ouvre son profil').waitFor()
  await byRole(lea.page, 'button', 'Répondre').click()
  await lea.page.getByText(/Réponse à\s*Sam/).waitFor()
  await lea.page
    .getByRole('combobox', { name: 'Écrire un commentaire' })
    .fill('Merci Sam, la version dessert arrive.')
  await byRole(lea.page, 'button', 'Envoyer le commentaire').click()
  await shownText(lea.page, 'Merci Sam, la version dessert arrive.').waitFor()
  // Sa propre réponse, Léa la supprimerait ; celui de Sam, elle peut le masquer, par le menu « … ».
  await byRole(lea.page, 'button', 'Actions du commentaire de Sam').click()
  await byRole(lea.page, 'menuitem', 'Masquer').click()
  // C'est elle qui l'a masqué : sa pastille le dit ainsi ; Sam lit « Masqué par l'auteur du projet ».
  await lea.page.getByText('Masqué par toi').waitFor()
  // Un commentaire masqué ne compte plus : reste la réponse de Léa.
  expectEqual('commentaires comptés', (await readProject(lea, projectId)).commentCount, 1)
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  await sam.page.getByText('Masqué par l’auteur du projet').waitFor()
  await shownText(sam.page, samSays, false).waitFor()
  console.log('  ok : Sam voit son commentaire, marqué « masqué »')
  expectEqual(
    'commentaires, sans compte',
    await statusFor(visitor, `${apiUrl}/v1/projects/${projectId}/comments`),
    401,
  )

  // Tranche 7b : Sam publie à son tour un projet, pour qu'on voie plus bas le blocage le cacher.
  // Un nouveau membre, Malik, le trouve d'abord dans Explorer (le témoin d'avant le blocage). R3 :
  // son titre porte un accent, que la recherche retrouve sans lui (« eleve » → « Élève »).
  step('Sam publie un projet ; Malik, nouveau membre, le trouve dans Explorer')
  const samProject = 'Le carnet de l’Élève'
  await open(sam.page, `${appUrl}/projects/new`)
  await sam.page.getByLabel('Titre').fill(samProject)
  await sam.page.getByLabel('En une phrase').fill('Il range mes essais de prompts.')
  await chooseCategory(sam.page, 'Code et outils')
  await publishToFeed(sam.page)
  await signUp(malik, 'Malik')
  /**
   * R3 : « Découvrir » est devenu « Récents », dans l'onglet Explorer. On attend le projet de Léa
   * (la liste est chargée) ; un projet peut aussi être dans le carrousel des testeurs, d'où `first`.
   */
  const openDiscover = async () => {
    await open(malik.page, `${appUrl}/explore`)
    await byRole(malik.page, 'link', 'Mon agent de recettes').first().waitFor()
  }
  await openDiscover()
  await byRole(malik.page, 'link', samProject).first().waitFor()
  console.log('  ok : Malik voit le projet de Sam dans Explorer')
  const samMe = await (await sam.request.get(`${apiUrl}/v1/me`)).json()
  const malikMe = await (await malik.request.get(`${apiUrl}/v1/me`)).json()
  const samHandle = samMe.handle

  // R3 : passer d'un onglet à l'autre par la barre du haut (l'ordinateur), l'actif marqué.
  step('Malik passe d’un onglet à l’autre : Fil, Explorer, Ruches')
  const mainNav = byRole(malik.page, 'navigation', 'Navigation principale').first()
  for (const [tab, path] of [
    ['Fil', '/'],
    ['Ruches', '/hives'],
    ['Explorer', '/explore'],
  ]) {
    await byRole(mainNav, 'link', tab).click()
    await malik.page.waitForURL((url) => url.pathname === path)
    await mainNav.locator(`[aria-current="page"]`).filter({ hasText: tab }).first().waitFor()
    if (tab === 'Ruches')
      await malik.page.getByText('Les ruches arrivent bientôt').first().waitFor()
  }
  console.log('  ok : chaque onglet ouvre sa page et devient l’onglet actif')

  // R3 (F-Fil8) : suivre l'auteur d'une carte de « Récents » par sa pastille, sans ouvrir le projet.
  step('Malik suit Sam depuis la pastille de sa carte, dans Explorer')
  await byRole(malik.page, 'switch', 'Suivre Sam').first().click()
  await byRole(malik.page, 'switch', /^Tu suis Sam/, { checked: true })
    .first()
    .waitFor()
  expectEqual('Malik toujours sur Explorer', new URL(malik.page.url()).pathname, '/explore')
  await waitFor(
    'abonnement de Malik à Sam, dans l’API',
    async () =>
      (await (await malik.request.get(`${apiUrl}/v1/members/${samMe.id}`)).json()).isFollowed ===
      true,
  )
  console.log('  ok : Malik suit Sam, depuis Explorer')

  // R3 (F-Nav7) : chercher par mots. Taper ne crée pas une page d'historique par lettre (jur-J5) ;
  // les accents ne comptent pas.
  step('Malik cherche « carnaval », puis « eleve », qui trouve le projet de Sam')
  // Le lien qui a l'air d'un champ lit le nom du champ, puis le texte affiché (R3, relecture C4).
  await byRole(malik.page, 'link', 'Rechercher, Un projet, une personne, un outil').first().click()
  await malik.page.waitForURL((url) => url.pathname === '/search')
  // Les pages précédentes restent montées (cachées) sous la page affichée, avec leur barre du haut :
  // sur /search, chacune dessine aussi le champ. On vise celui qu'on voit.
  const field = malik.page
    .getByLabel('Rechercher', { exact: true })
    .filter({ visible: true })
    .first()
  await field.waitFor()
  const historyBefore = await malik.page.evaluate(() => history.length)
  await field.pressSequentially('carnaval', { delay: 40 })
  // Les guillemets français portent des espaces insécables : on cherche par une expression.
  await malik.page
    .getByText(/^Aucun résultat pour .{1,3}carnaval.{1,3}$/)
    .filter({ visible: true })
    .first()
    .waitFor()
  expectEqual(
    'pages d’historique ajoutées en tapant « carnaval »',
    (await malik.page.evaluate(() => history.length)) - historyBefore,
    0,
  )
  await field.fill('')
  await field.pressSequentially('eleve', { delay: 40 })
  await byRole(malik.page, 'link', new RegExp(`^${samProject}`))
    .first()
    .click()
  await malik.page.waitForURL(/\/projects\/[0-9a-f-]{36}$/)
  console.log('  ok : « eleve » trouve « Le carnet de l’Élève », qui s’ouvre')

  // Tranche 7a : signaler, puis traiter le signalement. Sam publie un second commentaire, que
  // Malik signale ; l'administrateur le retire.
  step('Sam publie un second commentaire ; Malik le signale')
  const spam = 'Gagne 500 € par jour depuis chez toi, écris-moi en privé.'
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  await sam.page.getByRole('combobox', { name: 'Écrire un commentaire' }).fill(spam)
  await byRole(sam.page, 'button', 'Envoyer le commentaire').click()
  await shownText(sam.page, spam).waitFor()
  await open(malik.page, `${appUrl}/projects/${projectId}`)
  // Le premier commentaire de Sam est masqué : pour Malik, il ne reste que celui-ci à son nom.
  await byRole(malik.page, 'button', 'Actions du commentaire de Sam').click()
  await byRole(malik.page, 'menuitem', 'Signaler').click()
  await malik.page.waitForURL(/\/report\?/)
  // La page vise bien le commentaire de Sam : son identifiant, lu par l'API, est celui de l'adresse.
  // Et elle le montre (le dernier exemplaire du texte : la page du projet, sous celle-ci dans la
  // pile de navigation, garde le sien).
  const spamId = await (async () => {
    const json = await (
      await malik.request.get(`${apiUrl}/v1/projects/${projectId}/comments`)
    ).json()
    const find = (value) =>
      value && typeof value === 'object'
        ? value.body === spam
          ? value.id
          : Object.values(value).map(find).find(Boolean)
        : undefined
    return find(json) ?? fail('commentaire de Sam introuvable dans l’API')
  })()
  expectEqual('commentaire visé', new URL(malik.page.url()).searchParams.get('id'), spamId)
  await malik.page.getByText('Le commentaire signalé').waitFor()
  await malik.page.getByText(spam, { exact: true }).last().waitFor()
  await byRole(malik.page, 'radio', 'Arnaque ou spam').click()
  await malik.page
    .getByLabel('Précision (facultatif)')
    .fill('Une offre d’argent facile, sans rapport avec le projet.')
  await byRole(malik.page, 'button', 'Envoyer').click()
  await malik.page
    .getByText('Merci, ton signalement a été envoyé. La modération va le regarder.')
    .waitFor()
  console.log('  ok : Malik lit le remerciement')

  // Tranche 7b : la confirmation propose de bloquer l'auteur, jamais d'office. Le dialogue est le
  // plus petit bloc qui contient son titre et son « Annuler » : son « Bloquer » est le sien.
  step('Depuis la confirmation, Malik bloque aussi Sam, après avoir lu ce qui change')
  /** Le dialogue ouvert dont le titre répond à `title` (une espace fine précède le « ? »). */
  const dialogOf = (someone, title) =>
    someone.page
      .locator('div')
      .filter({ has: byRole(someone.page, 'heading', title) })
      .filter({ has: byRole(someone.page, 'button', 'Annuler') })
      .last()
  await byRole(malik.page, 'button', `Bloquer aussi @${samHandle}`).click()
  const blockDialog = dialogOf(malik, new RegExp(`^Bloquer @${samHandle}\\s*\\?$`))
  await blockDialog.getByText(/Bloquer ne prévient pas la modération\./).waitFor()
  await byRole(blockDialog, 'button', 'Bloquer').click()
  await malik.page.getByText(`Tu as bloqué @${samHandle}.`, { exact: true }).waitFor()
  const readSamForMalik = async () =>
    (await malik.request.get(`${apiUrl}/v1/members/${samMe.id}`)).json()
  await waitFor('blocage enregistré', async () => (await readSamForMalik()).isBlocked === true)
  console.log('  ok : Malik a bloqué Sam')

  step('Malik ne voit plus le projet de Sam ; la page de Sam lui dit « Tu as bloqué »')
  await openDiscover()
  expectEqual(
    'projet de Sam, dans « Découvrir » de Malik',
    await byRole(malik.page, 'link', samProject).count(),
    0,
  )
  await open(malik.page, `${appUrl}/members/${samMe.id}`)
  // Le même texte qu'après le geste (corrections 7b), et « Débloquer » à la place de « Suivre ».
  await malik.page.getByText(`Tu as bloqué @${samHandle}.`, { exact: true }).waitFor()
  await byRole(malik.page, 'button', `Débloquer @${samHandle}`).waitFor()
  console.log('  ok : Malik lit « Tu as bloqué » sur la page de Sam, sans ses projets')
  expectEqual(
    'projet de Sam, sur sa page vue par Malik',
    await byRole(malik.page, 'link', samProject).count(),
    0,
  )
  // Dans le fil du projet de Léa, le commentaire de Sam devient un emplacement, pour Malik seul.
  await open(malik.page, `${appUrl}/projects/${projectId}`)
  await malik.page.getByText('Commentaire d’un membre que tu as bloqué').first().waitFor()
  expectEqual('commentaire de Sam, à l’écran de Malik', await malik.page.getByText(spam).count(), 0)

  step('Sam ouvre la page de Malik : pour lui, elle n’existe pas')
  await open(sam.page, `${appUrl}/members/${malikMe.id}`)
  await sam.page.getByText('Ce membre est introuvable').waitFor()
  expectEqual(
    'page de Malik, pour Sam',
    await statusFor(sam, `${apiUrl}/v1/members/${malikMe.id}`),
    404,
  )

  // R2 : « Membres bloqués » est une ligne-lien de la rubrique « Sécurité ».
  step('Malik ouvre « Membres bloqués » depuis la rubrique « Sécurité », et débloque Sam')
  await openSettings(malik, 'Sécurité', '/settings/security')
  await byRole(malik.page, 'link', 'Membres bloqués').click()
  await malik.page.waitForURL(/\/blocks$/)
  // Le nom lu de chaque « Débloquer » dit qui il débloque.
  await byRole(malik.page, 'button', `Débloquer @${samHandle}`).click()
  const unblockDialog = dialogOf(malik, new RegExp(`^Débloquer @${samHandle}\\s*\\?$`))
  await byRole(unblockDialog, 'button', 'Débloquer').click()
  await malik.page.getByText(`Tu as débloqué @${samHandle}.`, { exact: true }).waitFor()
  await malik.page.getByText('Tu n’as bloqué personne.').waitFor()
  console.log('  ok : la liste des membres bloqués de Malik est vide')
  await waitFor('déblocage enregistré', async () => (await readSamForMalik()).isBlocked === false)
  await openDiscover()
  await byRole(malik.page, 'link', samProject).waitFor()
  console.log('  ok : le projet de Sam est de retour dans « Découvrir »')
  expectEqual(
    'page de Malik, pour Sam',
    await statusFor(sam, `${apiUrl}/v1/members/${malikMe.id}`),
    200,
  )

  // Léa n'est pas prévenue du signalement. Elle répond au commentaire de Sam : une fois celui-ci
  // retiré, sa réponse doit rester, sous un emplacement (comme sous un commentaire supprimé).
  step('Léa répond au second commentaire de Sam')
  const leaAnswer = 'Ce n’est pas le lieu pour ça, Sam.'
  await open(lea.page, `${appUrl}/projects/${projectId}`)
  await byRole(
    lea.page
      .locator('div')
      .filter({ has: lea.page.getByText(spam, { exact: true }) })
      .filter({ has: byRole(lea.page, 'button', 'Répondre') })
      .last(),
    'button',
    'Répondre',
  ).click()
  await lea.page.getByRole('combobox', { name: 'Écrire un commentaire' }).fill(leaAnswer)
  await byRole(lea.page, 'button', 'Envoyer le commentaire').click()
  await shownText(lea.page, leaAnswer).waitFor()
  console.log('  ok : Léa a répondu au commentaire signalé')

  step('Un administrateur ouvre « Modération » depuis ses réglages, et retire le commentaire')
  const { email: adminEmail } = await signUp(admin, 'Admin')
  // Le rôle ne se donne par aucune route de l'API. Sur la pile d'essai, le script de production
  // (infra/grant-admin.sh, JOURNEY_ADMIN_CMD) l'écrit dans la base ; le parcours local, lui, a
  // préparé sa base pour qu'un compte « admin-… » vérifié le reçoive (journey-local.mjs).
  if (adminCommand) execSync(`${adminCommand} ${adminEmail}`, { shell, stdio: 'inherit' })
  await waitFor(
    'rôle d’administrateur',
    async () => (await (await admin.request.get(`${apiUrl}/v1/me`)).json()).isAdmin === true,
  )
  console.log('  ok : Admin est administrateur')
  // R2 : une rubrique de la colonne, pour un administrateur seulement, qui mène à sa propre page.
  await openSettings(admin, 'Modération', '/moderation')
  // La carte du signalement : le texte copié au moment de l'envoi, le motif et son nombre, et la
  // précision de Malik.
  const reportCard = admin.page
    .locator('div')
    .filter({ has: admin.page.getByText(spam, { exact: true }) })
    .filter({ has: byRole(admin.page, 'button', 'Retirer') })
    .last()
  await reportCard.getByText(/Arnaque ou spam\s*:\s*1/).waitFor()
  await reportCard.getByText('Une offre d’argent facile, sans rapport avec le projet.').waitFor()
  await byRole(reportCard, 'button', 'Retirer').click()
  // La fenêtre « Retirer ce contenu ? » : le plus petit bloc qui contient son titre et le choix du
  // fondement. Son bouton « Retirer » est le sien, pas celui de la carte, restée dessous.
  const removeDialog = admin.page
    .locator('div')
    .filter({ has: byRole(admin.page, 'heading', /^Retirer ce contenu\s*\?$/) })
    .filter({ has: byRole(admin.page, 'radiogroup', 'Fondement') })
    .last()
  await byRole(removeDialog, 'radio', /^Les règles de /).click()
  const explanation = 'Les messages publicitaires ne sont pas admis dans les commentaires.'
  await removeDialog.getByLabel('Explication', { exact: true }).fill(explanation)
  await byRole(removeDialog, 'button', 'Retirer').click()
  await admin.page.getByText('Contenu retiré.', { exact: true }).waitFor()
  console.log('  ok : l’administrateur a retiré le commentaire')

  step('Malik est prévenu que son signalement a été traité')
  await open(malik.page, `${appUrl}/notifications`)
  await malik.page
    .getByText(/^Ton signalement d’un commentaire a été traité\s*: le commentaire a été retiré\.$/)
    .waitFor()
  console.log('  ok : Malik lit « traité » dans ses notifications')

  step('Sam voit son commentaire « Retiré par la modération » ; Léa ne le voit plus')
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  await sam.page.getByText('Retiré par la modération', { exact: true }).waitFor()
  await sam.page.getByText(new RegExp(`^Explication\\s*: ${explanation}$`)).waitFor()
  await shownText(sam.page, spam).waitFor()
  console.log('  ok : Sam lit le bandeau, l’explication et son texte')
  await open(lea.page, `${appUrl}/projects/${projectId}`)
  // Pour Léa, le commentaire retiré n'est plus qu'un emplacement, sans auteur ; sa réponse reste.
  await lea.page.getByText('Contenu retiré par la modération', { exact: true }).waitFor()
  await shownText(lea.page, leaAnswer).waitFor()
  console.log('  ok : Léa voit « Contenu retiré par la modération », et sa réponse dessous')
  expectEqual('commentaire retiré, à l’écran de Léa', await lea.page.getByText(spam).count(), 0)
  const leaComments = await (
    await lea.request.get(`${apiUrl}/v1/projects/${projectId}/comments`)
  ).text()
  expectEqual('commentaire retiré, dans l’API pour Léa', leaComments.includes(spam), false)

  // --- Tranche 7c : suspendre un compte, puis lever la suspension ---
  step('Karim s’inscrit : il a « Publier un projet » sur son accueil')
  await signUp(karim, 'Karim')
  const karimMe = async () => (await karim.request.get(`${apiUrl}/v1/me`)).json()
  const karimId = (await karimMe()).id
  await open(karim.page, `${appUrl}/`)
  // Le témoin de l'absence qui suivra : avant la suspension, le bouton est bien là.
  await byRole(karim.page, 'button', 'Publier un projet').first().waitFor()
  console.log('  ok : Karim voit « Publier »')

  step('L’administrateur suspend Karim 7 jours, depuis la page de Karim')
  await open(admin.page, `${appUrl}/members/${karimId}`)
  await byRole(admin.page, 'button', 'Plus d’actions').click()
  await byRole(admin.page, 'menuitem', 'Suspendre le compte').click()
  await admin.page.waitForURL(/\/suspend\?/)
  await byRole(admin.page, 'heading', 'Suspendre le compte de Karim').waitFor()
  await byRole(admin.page, 'radio', '7 jours').click()
  await byRole(admin.page, 'radio', /^Les règles de /).click()
  const suspensionExplanation = 'Des messages publicitaires répétés sous les projets des autres.'
  await admin.page.getByLabel('Explication', { exact: true }).fill(suspensionExplanation)
  await byRole(admin.page, 'button', 'Suspendre le compte').click()
  await admin.page.getByText('Compte suspendu.', { exact: true }).waitFor()
  await waitFor(
    'suspension de Karim, dans l’API',
    async () => (await karimMe()).suspension !== null,
  )
  const { suspension } = await karimMe()
  // La fin à la seconde près : l'heure de la pose, 7 jours plus tard (relecture juridique J4).
  expectEqual(
    'durée de la suspension, en millisecondes',
    Date.parse(suspension.endsAt) - Date.parse(suspension.since),
    7 * 24 * 60 * 60 * 1000,
  )
  console.log('  ok : Karim est suspendu 7 jours')

  step('Karim voit le bandeau de la suspension, et n’a plus « Publier »')
  await open(karim.page, `${appUrl}/`)
  const banner = byRole(karim.page, 'status').filter({ hasText: 'Ton compte est suspendu' })
  await banner.first().waitFor()
  await banner.first().getByText(new RegExp(suspensionExplanation)).waitFor()
  expectEqual(
    '« Publier » pour Karim suspendu',
    await byRole(karim.page, 'button', 'Publier un projet').count(),
    0,
  )
  console.log('  ok : Karim lit le bandeau et son explication ; « Publier » a disparu')

  step('L’administrateur lève la suspension, plus tôt que prévu')
  await open(admin.page, `${appUrl}/members/${karimId}`)
  // La ligne que seul un administrateur lit, avec l'heure de Paris.
  await admin.page.getByText(/^Compte suspendu jusqu’au .+\(heure de Paris\)$/).waitFor()
  await byRole(admin.page, 'button', 'Plus d’actions').click()
  await byRole(admin.page, 'menuitem', 'Lever la suspension').click()
  await admin.page.waitForURL(/\/suspend\?/)
  await byRole(admin.page, 'heading', 'Lever la suspension de Karim').waitFor()
  await byRole(admin.page, 'radio', 'Plus tôt que prévu').click()
  await admin.page
    .getByLabel('Explication', { exact: true })
    .fill('Karim a supprimé ses messages et s’est excusé.')
  await byRole(admin.page, 'button', 'Lever la suspension').click()
  await admin.page.getByText('Suspension levée.', { exact: true }).waitFor()
  await waitFor(
    'levée de la suspension, dans l’API',
    async () => (await karimMe()).suspension === null,
  )
  await open(karim.page, `${appUrl}/`)
  await byRole(karim.page, 'button', 'Publier un projet').first().waitFor()
  expectEqual('bandeau pour Karim, après la levée', await banner.count(), 0)
  console.log('  ok : Karim retrouve « Publier », sans bandeau')

  step('L’historique de modération de Karim montre la suspension et la levée')
  await open(admin.page, `${appUrl}/members/${karimId}`)
  await byRole(admin.page, 'button', 'Plus d’actions').click()
  await byRole(admin.page, 'menuitem', 'Historique de modération').click()
  await admin.page.waitForURL(/\/moderation\?.*member=/)
  await admin.page.getByText(/^Décisions qui visent @/).waitFor()
  await admin.page.getByText('Levée de la suspension', { exact: true }).first().waitFor()
  await admin.page.getByText('Suspension', { exact: true }).first().waitFor()
  await admin.page.getByText(suspensionExplanation).first().waitFor()
  console.log('  ok : l’historique montre les deux décisions')

  step('Léa passe le projet en privé : la photo devient introuvable, même pour qui a l’adresse')
  await open(lea.page, `${appUrl}/projects/${projectId}/edit`)
  await byRole(lea.page, 'radio', 'Privé').click()
  await byRole(lea.page, 'button', 'Enregistrer').last().click()
  await lea.page.waitForURL(/\/projects\/[0-9a-f-]{36}$/)
  expectEqual('visibilité', (await readProject(lea, projectId)).visibility, 'private')
  expectEqual('photo, pour Léa', await statusFor(lea, photoUrl), 200)
  expectEqual('photo, pour Sam', await statusFor(sam, photoUrl), 404)
  expectEqual('photo, sans compte', await statusFor(visitor, photoUrl), 404)
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  await sam.page.getByText('Ce projet est introuvable').waitFor()
  console.log('  ok : la page du projet est introuvable pour Sam')
  await open(sam.page, `${appUrl}/`)
  // R4 (F-Fil5) : un fil vidé par l'auteur finit sur « Tu es à jour », sans la carte du projet.
  await sam.page.getByText('Tu es à jour').waitFor()
  expectEqual(
    'carte du projet privé, dans le fil de Sam',
    await byRole(sam.page, 'link', 'Mon agent de recettes').count(),
    0,
  )
  console.log('  ok : le projet a quitté le fil de Sam')

  step('La page de Léa : Sam n’y voit plus le projet, Léa le voit, marqué « Privé »')
  await open(sam.page, `${appUrl}/members/${me.id}`)
  await sam.page.getByText('Pas encore de projet visible des membres.').waitFor()
  console.log('  ok : la page de Léa ne montre aucun projet à Sam')
  await open(lea.page, `${appUrl}/members/${me.id}`)
  await byRole(lea.page, 'link', 'Mon agent de recettes').waitFor()
  await lea.page.getByText('Privé', { exact: true }).waitFor()
  console.log('  ok : Léa voit son projet privé sur sa page')

  step('Léa supprime le projet : ses photos disparaissent du disque')
  await open(lea.page, `${appUrl}/projects/${projectId}`)
  await byRole(lea.page, 'button', 'Plus d’actions').click()
  await byRole(lea.page, 'menuitem', 'Supprimer').click()
  await byRole(lea.page.getByRole('dialog'), 'button', 'Supprimer').click()
  await lea.page.waitForURL((url) => url.pathname === '/me')
  expectEqual('photo, pour Léa', await statusFor(lea, photoUrl), 404)
  await expectMedia('après la suppression du projet', { avatars: 1, visuals: 0 })

  step('Léa supprime son compte : son avatar disparaît du disque')
  // R2 : depuis la rubrique « Compte », une feuille posée sur les réglages
  // (/settings/account/delete), avec le mot de passe choisi dans la rubrique « Sécurité ».
  await openSettings(lea, 'Compte', '/settings/account')
  await byRole(lea.page, 'link', 'Supprimer mon compte').click()
  await lea.page.waitForURL((url) => url.pathname === '/settings/account/delete')
  await lea.page.getByLabel('Confirme avec ton mot de passe').fill(passwordAfterChange)
  await byRole(lea.page, 'button', 'Supprimer définitivement').click()
  await lea.page.waitForURL((url) => url.pathname === '/')
  expectEqual('avatar de Léa, pour Sam', await statusFor(sam, avatarUrl), 404)
  await expectMedia('après la suppression du compte', { avatars: 0, visuals: 0 })
} catch (error) {
  // Une capture de chaque navigateur, et le texte qu'il affiche : de quoi comprendre où le
  // parcours s'est arrêté, même sans ouvrir les captures (gardées par la CI).
  for (const [who, someone] of Object.entries({ lea, sam, malik, admin, karim })) {
    await someone.page.screenshot({ path: `journey-${who}.png`, fullPage: true }).catch(() => {})
    const text = await someone.page
      .locator('body')
      .innerText()
      .catch(() => '')
    console.error(`\n${who}, ${someone.page.url()} :\n${text.slice(0, 600)}`)
  }
  console.error(`\nParcours interrompu : ${error.message}`)
  problems.push(error.message)
} finally {
  await browser.close()
}

if (problems.length > 0) {
  console.error(`\nProblèmes :\n- ${[...new Set(problems)].join('\n- ')}`)
  process.exit(1)
}
console.log(
  '\nok : le parcours complet fonctionne, et chacun ne voit que ce qu’il a le droit de voir',
)
