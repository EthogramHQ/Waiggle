// Le parcours réel d'un membre, joué dans un vrai navigateur à la place de Louis : deux personnes
// s'inscrivent, l'une suit l'autre et publie un projet avec des photos, l'autre le voit arriver dans
// son fil et le regarde, réagit et commente en mentionnant l'auteur (qui le voit dans ses notifications,
// répond, puis masque le commentaire). Un troisième membre signale un second commentaire, qu'un
// administrateur retire (tranche 7a) : celui qui a signalé est prévenu, l'auteur voit pourquoi, les
// autres ne le voient plus. Depuis la confirmation de son signalement, ce membre bloque aussi
// l'auteur du commentaire (tranche 7b) : chacun ne voit plus l'autre, puis il le débloque depuis
// « Mon compte ». Au début, le premier membre change aussi d'adresse e-mail (tranche « adresse »),
// puis se reconnecte avec la nouvelle. Puis le projet devient privé, est supprimé, et le compte aussi. À chaque étape, on vérifie ce que voit chacun (le
// membre, l'autre membre, une personne sans compte) et ce qui reste sur le disque du serveur.
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
/** Touche un bouton qui ouvre le choix d'un fichier, et donne ce fichier. */
const pick = async (page, button, file) => {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button.click()])
  await chooser.setFiles(file)
}

const password = `parcours-${randomBytes(8).toString('hex')}`
const signUp = async (someone, name) => {
  const email = `${name.toLowerCase()}-${randomBytes(4).toString('hex')}@example.com`
  const { page } = someone
  await open(page, `${appUrl}/sign-up`)
  await page.getByLabel('Nom affiché', { exact: true }).fill(name)
  await page.getByLabel('Adresse e-mail').fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByLabel('Code d’invitation').fill(inviteCode)
  await page.getByRole('button', { name: 'Créer un compte' }).click()
  await page.waitForURL(/\/check-email/)
  // Le lien connecte au compte, puis mène à la page « Adresse vérifiée ».
  const link = await verificationLink(email)
  await open(page, link)
  await page.getByText('Adresse vérifiée').waitFor()
  console.log(`  ok : ${name} inscrite et vérifiée`)
  return { email, link }
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
  await signUp(sam, 'Sam')

  step('Léa choisit une photo de profil')
  await open(lea.page, `${appUrl}/profile`)
  await pick(
    lea.page,
    lea.page.getByRole('button', { name: 'Changer la photo' }),
    image('avatar', 600, 600, [240, 180, 0]),
  )
  await lea.page.getByText('Photo mise à jour.').waitFor()
  const me = await (await lea.request.get(`${apiUrl}/v1/me`)).json()
  const avatarUrl = me.avatarUrl ?? fail('pas d’adresse d’avatar')
  await expectMedia('après l’avatar', { avatars: 1, visuals: 0 })

  // Tranche 6a : un pseudo lui a été donné à la vérification ; elle en choisit un autre, tapé
  // avec le « @ » comme on l'écrit souvent : l'appli le retire avant d'envoyer.
  step('Léa change de pseudo')
  const handle = `lea_${randomBytes(3).toString('hex')}`
  await lea.page.getByLabel('Pseudo', { exact: true }).fill(`@${handle}`)
  await lea.page.getByRole('button', { name: 'Enregistrer' }).last().click()
  await lea.page.getByText('Profil enregistré.').waitFor()
  const renamed = await (await lea.request.get(`${apiUrl}/v1/me`)).json()
  expectEqual('pseudo de Léa', renamed.handle, handle)

  // Tranche 6c : un réglage d'e-mail s'enregistre dès qu'on le touche, sans « Enregistrer ».
  step('Léa coupe le récap de la semaine ; la page rechargée le montre coupé')
  await lea.page.getByRole('switch', { name: 'Le récap de la semaine', checked: true }).click()
  await lea.page.getByText('Réglage enregistré.').waitFor()
  await open(lea.page, `${appUrl}/profile`)
  await lea.page.getByRole('switch', { name: 'Le récap de la semaine', checked: false }).waitFor()
  const emails = await (await lea.request.get(`${apiUrl}/v1/me/email-preferences`)).json()
  expectEqual('récap de Léa', emails.weeklyRecap, false)

  // Tranche « adresse » : deux liens, l'un à l'ancienne adresse (son accord), l'autre à la nouvelle
  // (sa vérification). Léa les ouvre dans son navigateur, où elle est connectée : elle le reste.
  step('Léa change d’adresse e-mail : un lien à l’ancienne, puis un à la nouvelle')
  const newEmail = `lea-nouvelle-${randomBytes(4).toString('hex')}@example.com`
  await open(lea.page, `${appUrl}/account`)
  await lea.page.getByRole('button', { name: /^Changer d.adresse e-mail/ }).click()
  await lea.page.waitForURL((url) => url.pathname === '/account/email')
  await lea.page.getByLabel('Nouvelle adresse e-mail').fill(newEmail)
  await lea.page.getByLabel('Confirme avec ton mot de passe').fill(password)
  await lea.page.getByRole('button', { name: 'Envoyer le lien' }).click()
  await lea.page.getByText('Regarde ta boîte mail actuelle').waitFor()
  // Le premier lien part vers l'adresse ACTUELLE, qui a déjà reçu celui de l'inscription.
  await open(lea.page, await verificationLink(leaSignUp.email, leaSignUp.link))
  await lea.page.waitForURL((url) => url.pathname === '/email-change/confirmed')
  await lea.page.getByRole('heading', { name: 'Plus qu’une étape' }).waitFor()
  // Rien n'a encore changé : il faut aussi le second lien.
  const halfway = await (await lea.request.get(`${apiUrl}/v1/me`)).json()
  expectEqual('adresse de Léa après le premier lien', halfway.email, leaSignUp.email)
  await open(lea.page, await verificationLink(newEmail))
  await lea.page.waitForURL((url) => url.pathname === '/email-change/done')
  await lea.page.getByRole('heading', { name: 'Adresse changée' }).waitFor()
  // La page lit la nouvelle adresse dans la session, jamais dans l'adresse de la page (scénario).
  await lea.page.getByText(newEmail, { exact: false }).first().waitFor()
  const doneUrl = lea.page.url()
  expectEqual(
    'adresse e-mail absente de l’URL',
    doneUrl.includes(newEmail) || doneUrl.includes(encodeURIComponent(newEmail)),
    false,
  )
  const changed = await (await lea.request.get(`${apiUrl}/v1/me`)).json()
  expectEqual('nouvelle adresse de Léa', changed.email, newEmail)
  expectEqual('nouvelle adresse vérifiée', changed.emailVerified, true)

  step('Léa se déconnecte : l’ancienne adresse ne la connecte plus, la nouvelle oui')
  await open(lea.page, `${appUrl}/account`)
  await lea.page.getByRole('button', { name: 'Me déconnecter' }).click()
  await lea.page.waitForURL((url) => url.pathname === '/')
  await open(lea.page, `${appUrl}/sign-in`)
  await lea.page.getByLabel('Adresse e-mail').fill(leaSignUp.email)
  await lea.page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await lea.page.getByRole('button', { name: 'Me connecter' }).click()
  await lea.page.getByText('Adresse e-mail ou mot de passe incorrect.').waitFor()
  console.log('  ok : l’ancienne adresse est refusée')
  await lea.page.getByLabel('Adresse e-mail').fill(newEmail)
  await lea.page.getByRole('button', { name: 'Me connecter' }).click()
  await lea.page.waitForURL((url) => !url.pathname.startsWith('/sign-in'))
  const again = await (await lea.request.get(`${apiUrl}/v1/me`)).json()
  expectEqual('Léa reconnectée avec sa nouvelle adresse', again.email, newEmail)

  step('Sam ne suit personne : son fil le dit ; il lit le pseudo de Léa et la suit depuis sa page')
  await open(sam.page, `${appUrl}/`)
  await sam.page.getByText('Tu ne suis personne pour l’instant').waitFor()
  await open(sam.page, `${appUrl}/members/${me.id}`)
  await sam.page.getByText(`@${handle}`, { exact: true }).waitFor()
  await sam.page.getByRole('switch', { name: 'Suivre Lea' }).click()
  // Une fois suivie, le nom lu reprend le texte affiché : « Suivi : Lea », activé.
  await sam.page.getByRole('switch', { name: /^Suivi.*Lea$/, checked: true }).waitFor()
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
  await lea.page
    .getByLabel('Le pitch, en une phrase')
    .fill('Il propose un dîner avec ce qui reste.')
  // Chaque photo est d'abord réduite sur l'appareil : comme une personne, on attend de voir sa
  // vignette (et son bouton « Retirer ») avant de passer à la suivante, puis de publier.
  const add = lea.page.getByRole('button', { name: 'Ajouter une photo' })
  const colors = { rouge: [200, 40, 40], vert: [40, 160, 60], bleu: [40, 80, 200] }
  for (const [n, [name, color]] of Object.entries(colors).entries()) {
    await pick(lea.page, add, image(name, 1200, 800, color))
    await lea.page.getByRole('button', { name: `Retirer la photo ${n + 1}` }).waitFor()
  }
  await pick(
    lea.page,
    lea.page.getByRole('button', { name: 'Choisir une couverture verticale' }),
    image('portrait', 600, 1000, [120, 60, 160]),
  )
  await lea.page.getByRole('button', { name: 'Retirer la couverture verticale' }).waitFor()
  await lea.page.getByRole('button', { name: 'Publier' }).last().click() // le premier est celui de la barre du haut
  await lea.page.waitForURL(/\/projects\/[0-9a-f-]{36}$/)
  const projectId = lea.page.url().split('/').at(-1)
  let project = await readProject(lea, projectId)
  expectEqual('photos de la galerie', project.visuals.length, 3)
  expectEqual('couverture verticale', project.portraitCover !== null, true)
  await expectMedia('après la publication', { avatars: 1, visuals: 4 })
  const [red, green, blue] = project.visuals.map((visual) => visual.id)

  step('Léa met la troisième photo en couverture, puis retire la deuxième')
  await lea.page.getByRole('button', { name: 'Modifier' }).click()
  await lea.page.waitForURL(/\/edit$/)
  await lea.page.getByRole('button', { name: 'Mettre la photo 3 en couverture' }).click()
  await waitFor('nouvelle couverture', async () => {
    project = await readProject(lea, projectId)
    return project.visuals[0].id === blue
  })
  // L'ordre est maintenant bleu, rouge, vert : la deuxième est la rouge. Le serveur a fini, mais
  // l'écran peut encore montrer l'ancien ordre, boutons désactivés, le temps que la réponse arrive.
  // Cliquer tout de suite viserait la vignette qui portait « photo 2 » avant (la verte, que React
  // déplace ensuite) : on attend que l'écran soit redessiné, ses boutons de nouveau actifs.
  const removeSecond = lea.page.getByRole('button', { name: 'Retirer la photo 2' })
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

  step('Le projet de Léa arrive dans le fil de Sam')
  await open(sam.page, `${appUrl}/`)
  await sam.page.getByRole('link', { name: 'Mon agent de recettes' }).waitFor()
  await sam.page.getByText('Tu es à jour').waitFor()
  console.log('  ok : le projet est dans le fil « Abonnements » de Sam')

  step('Sam voit le projet et ses photos ; une personne sans compte ne voit rien')
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  await sam.page.getByText('Mon agent de recettes').first().waitFor()
  // L'auteur mène à sa page de membre, où le projet figure.
  await sam.page.getByRole('link', { name: 'Voir la page de Lea' }).click()
  await sam.page.waitForURL(/\/members\//)
  await sam.page.getByRole('link', { name: 'Mon agent de recettes' }).waitFor()
  console.log('  ok : Sam trouve le projet sur la page de Léa')
  expectEqual('photo, pour Sam', await statusFor(sam, photoUrl), 200)
  expectEqual('photo, sans compte', await statusFor(visitor, photoUrl), 404)
  expectEqual('avatar de Léa, pour Sam', await statusFor(sam, avatarUrl), 200)
  expectEqual('avatar de Léa, sans compte', await statusFor(visitor, avatarUrl), 404)

  step('Sam suit le projet ; Léa publie une note, qui arrive dans le fil de Sam')
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  await sam.page.getByRole('switch', { name: 'Suivre ce projet' }).click()
  await sam.page.getByRole('switch', { name: 'Projet suivi', checked: true }).waitFor()
  await open(lea.page, `${appUrl}/projects/${projectId}`)
  await lea.page.getByRole('button', { name: 'Publier une note' }).click()
  await lea.page.getByLabel('Ta note').fill('Nouvelle version : il propose aussi un dessert.')
  await lea.page.getByRole('button', { name: 'Publier la note' }).click()
  await lea.page.getByText('Note publiée.').waitFor()
  await open(sam.page, `${appUrl}/`)
  await sam.page.getByRole('link', { name: 'Note de Lea sur Mon agent de recettes' }).waitFor()
  console.log('  ok : la note de Léa est dans le fil de Sam')

  step('Sam réagit « Bravo » et commente ; Léa répond, puis masque le commentaire de Sam')
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  // Le nom lu de chaque réaction dit son nombre, et « réagi » une fois posée.
  await sam.page.getByRole('button', { name: 'Bravo, 0' }).click()
  await sam.page.getByRole('button', { name: 'Bravo, réagi, 1' }).waitFor()
  await waitFor(
    'réaction enregistrée',
    async () => (await readProject(lea, projectId)).reactions.counts.bravo === 1,
  )
  console.log('  ok : Léa voit « Bravo » compté une fois')
  // exact : le texte est aussi repris, en tête « Sam : », dans la description cachée des boutons du
  // commentaire (aria-describedby) ; sans exact, la recherche en trouverait trois.
  // Tranche 6b : Sam mentionne Léa. Il tape « @ » et le début de son pseudo, choisit Léa dans la
  // liste proposée (l'appli écrit « @pseudo » et une espace), puis finit sa phrase.
  const samSays = `Testé ce soir, @${handle} une soupe parfaite.`
  await sam.page.getByRole('button', { name: 'Écrire un commentaire' }).click()
  const samField = sam.page.getByLabel('Ton commentaire')
  await samField.fill(`Testé ce soir, @${handle.slice(0, 4)}`)
  await sam.page.getByRole('option', { name: `Lea, @${handle}` }).click()
  await samField.pressSequentially('une soupe parfaite.')
  await sam.page.getByRole('button', { name: 'Publier le commentaire' }).click()
  await sam.page.getByText('Commentaire publié.').waitFor()

  step('Léa voit la cloche, puis la notification de la mention, qui mène au projet')
  // Le nombre n'est relu que chaque minute : on recharge l'accueil pour le lire tout de suite.
  await open(lea.page, `${appUrl}/`)
  await lea.page
    .getByRole('button', { name: /^Notifications, \d+ nouvelles?$/ })
    .first()
    .click()
  await lea.page.getByRole('link', { name: /Sam parle de toi dans un commentaire/ }).click()
  await lea.page.waitForURL(`**/projects/${projectId}`)
  // Dans le texte publié, la mention est un lien vers la page de Léa.
  await lea.page.getByRole('link', { name: `@${handle}`, exact: true }).waitFor()
  const unread = await (await lea.request.get(`${apiUrl}/v1/notifications/unread`)).json()
  expectEqual('nouveautés après la visite', unread.count, 0)
  await lea.page.getByRole('button', { name: 'Répondre', exact: true }).click()
  await lea.page.getByLabel('Ta réponse').fill('Merci Sam, la version dessert arrive.')
  await lea.page.getByRole('button', { name: 'Publier la réponse' }).click()
  await lea.page.getByText('Réponse publiée.').waitFor()
  // Sa propre réponse, Léa la supprimerait ; celui de Sam, elle peut le masquer.
  await lea.page.getByRole('button', { name: 'Masquer le commentaire' }).click()
  // C'est elle qui l'a masqué : son bandeau le dit ainsi ; Sam lit « Masqué par la personne qui a publié le projet ».
  await lea.page.getByText('Masqué par toi').waitFor()
  // Un commentaire masqué ne compte plus : reste la réponse de Léa.
  expectEqual('commentaires comptés', (await readProject(lea, projectId)).commentCount, 1)
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  await sam.page.getByText('Masqué par la personne qui a publié le projet').waitFor()
  await sam.page.getByText(samSays, { exact: true }).waitFor()
  console.log('  ok : Sam voit son commentaire, marqué « masqué »')
  expectEqual(
    'commentaires, sans compte',
    await statusFor(visitor, `${apiUrl}/v1/projects/${projectId}/comments`),
    401,
  )

  // Tranche 7b : Sam publie à son tour un projet, pour qu'on voie plus bas le blocage le cacher.
  // Un nouveau membre, Malik, le trouve d'abord dans « Découvrir » (le témoin d'avant le blocage).
  step('Sam publie un projet ; Malik, nouveau membre, le trouve dans « Découvrir »')
  const samProject = 'Le carnet de Sam'
  await open(sam.page, `${appUrl}/projects/new`)
  await sam.page.getByLabel('Titre').fill(samProject)
  await sam.page.getByLabel('Le pitch, en une phrase').fill('Il range mes essais de prompts.')
  await sam.page.getByRole('button', { name: 'Publier' }).last().click()
  await sam.page.waitForURL(/\/projects\/[0-9a-f-]{36}$/)
  await signUp(malik, 'Malik')
  /** « Découvrir » sur l'accueil de Malik, une fois le projet de Léa affiché (la liste est chargée). */
  const openDiscover = async () => {
    await open(malik.page, `${appUrl}/`)
    await malik.page.getByRole('radio', { name: 'Découvrir' }).click()
    await malik.page.getByRole('link', { name: 'Mon agent de recettes' }).waitFor()
  }
  await openDiscover()
  await malik.page.getByRole('link', { name: samProject }).waitFor()
  console.log('  ok : Malik voit le projet de Sam dans « Découvrir »')
  const samMe = await (await sam.request.get(`${apiUrl}/v1/me`)).json()
  const malikMe = await (await malik.request.get(`${apiUrl}/v1/me`)).json()
  const samHandle = samMe.handle

  // Tranche 7a : signaler, puis traiter le signalement. Sam publie un second commentaire, que
  // Malik signale ; l'administrateur le retire.
  step('Sam publie un second commentaire ; Malik le signale')
  const spam = 'Gagne 500 € par jour depuis chez toi, écris-moi en privé.'
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  await sam.page.getByRole('button', { name: 'Écrire un commentaire' }).click()
  await sam.page.getByLabel('Ton commentaire').fill(spam)
  await sam.page.getByRole('button', { name: 'Publier le commentaire' }).click()
  await sam.page.getByText('Commentaire publié.').waitFor()
  await open(malik.page, `${appUrl}/projects/${projectId}`)
  // La réponse de Léa a aussi son « Signaler » : on prend le bouton de la carte du commentaire de
  // Sam, c'est-à-dire le plus petit bloc qui contient à la fois son texte et un « Signaler » (les
  // blocs sont rangés du plus grand au plus petit dans la page : le dernier est la carte).
  await malik.page
    .locator('div')
    .filter({ has: malik.page.getByText(spam, { exact: true }) })
    .filter({ has: malik.page.getByRole('button', { name: 'Signaler', exact: true }) })
    .last()
    .getByRole('button', { name: 'Signaler', exact: true })
    .click()
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
  await malik.page.getByRole('radio', { name: 'Arnaque ou spam' }).click()
  await malik.page
    .getByLabel('Précision (facultatif)')
    .fill('Une offre d’argent facile, sans rapport avec le projet.')
  await malik.page.getByRole('button', { name: 'Envoyer' }).click()
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
      .filter({ has: someone.page.getByRole('heading', { name: title }) })
      .filter({ has: someone.page.getByRole('button', { name: 'Annuler', exact: true }) })
      .last()
  await malik.page.getByRole('button', { name: `Bloquer aussi @${samHandle}` }).click()
  const blockDialog = dialogOf(malik, new RegExp(`^Bloquer @${samHandle}\\s*\\?$`))
  await blockDialog.getByText(/Bloquer ne prévient pas la modération\./).waitFor()
  await blockDialog.getByRole('button', { name: 'Bloquer', exact: true }).click()
  await malik.page.getByText(`Tu as bloqué @${samHandle}.`, { exact: true }).waitFor()
  const readSamForMalik = async () =>
    (await malik.request.get(`${apiUrl}/v1/members/${samMe.id}`)).json()
  await waitFor('blocage enregistré', async () => (await readSamForMalik()).isBlocked === true)
  console.log('  ok : Malik a bloqué Sam')

  step('Malik ne voit plus le projet de Sam ; la page de Sam lui dit « Tu as bloqué »')
  await openDiscover()
  expectEqual(
    'projet de Sam, dans « Découvrir » de Malik',
    await malik.page.getByRole('link', { name: samProject }).count(),
    0,
  )
  await open(malik.page, `${appUrl}/members/${samMe.id}`)
  // Le même texte qu'après le geste (corrections 7b), et « Débloquer » à la place de « Suivre ».
  await malik.page.getByText(`Tu as bloqué @${samHandle}.`, { exact: true }).waitFor()
  await malik.page.getByRole('button', { name: `Débloquer @${samHandle}` }).waitFor()
  console.log('  ok : Malik lit « Tu as bloqué » sur la page de Sam, sans ses projets')
  expectEqual(
    'projet de Sam, sur sa page vue par Malik',
    await malik.page.getByRole('link', { name: samProject }).count(),
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

  step('Malik ouvre « Membres bloqués » depuis « Mon compte », et débloque Sam')
  await open(malik.page, `${appUrl}/account`)
  await malik.page.getByRole('button', { name: 'Membres bloqués' }).click()
  await malik.page.waitForURL(/\/blocks$/)
  // Le nom lu de chaque « Débloquer » dit qui il débloque.
  await malik.page.getByRole('button', { name: `Débloquer @${samHandle}` }).click()
  const unblockDialog = dialogOf(malik, new RegExp(`^Débloquer @${samHandle}\\s*\\?$`))
  await unblockDialog.getByRole('button', { name: 'Débloquer', exact: true }).click()
  await malik.page.getByText(`Tu as débloqué @${samHandle}.`, { exact: true }).waitFor()
  await malik.page.getByText('Tu n’as bloqué personne.').waitFor()
  console.log('  ok : la liste des membres bloqués de Malik est vide')
  await waitFor('déblocage enregistré', async () => (await readSamForMalik()).isBlocked === false)
  await openDiscover()
  await malik.page.getByRole('link', { name: samProject }).waitFor()
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
  await lea.page
    .locator('div')
    .filter({ has: lea.page.getByText(spam, { exact: true }) })
    .filter({ has: lea.page.getByRole('button', { name: 'Répondre', exact: true }) })
    .last()
    .getByRole('button', { name: 'Répondre', exact: true })
    .click()
  await lea.page.getByLabel('Ta réponse').fill(leaAnswer)
  await lea.page.getByRole('button', { name: 'Publier la réponse' }).click()
  await lea.page.getByText('Réponse publiée.').waitFor()
  console.log('  ok : Léa a répondu au commentaire signalé')

  step('Un administrateur ouvre « Modération » depuis « Mon compte », et retire le commentaire')
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
  await open(admin.page, `${appUrl}/account`)
  await admin.page.getByRole('button', { name: 'Modération' }).click()
  await admin.page.waitForURL(/\/moderation$/)
  // La carte du signalement : le texte copié au moment de l'envoi, le motif et son nombre, et la
  // précision de Malik.
  const reportCard = admin.page
    .locator('div')
    .filter({ has: admin.page.getByText(spam, { exact: true }) })
    .filter({ has: admin.page.getByRole('button', { name: 'Retirer', exact: true }) })
    .last()
  await reportCard.getByText(/Arnaque ou spam\s*:\s*1/).waitFor()
  await reportCard.getByText('Une offre d’argent facile, sans rapport avec le projet.').waitFor()
  await reportCard.getByRole('button', { name: 'Retirer', exact: true }).click()
  // La fenêtre « Retirer ce contenu ? » : le plus petit bloc qui contient son titre et le choix du
  // fondement. Son bouton « Retirer » est le sien, pas celui de la carte, restée dessous.
  const removeDialog = admin.page
    .locator('div')
    .filter({ has: admin.page.getByRole('heading', { name: /^Retirer ce contenu\s*\?$/ }) })
    .filter({ has: admin.page.getByRole('radiogroup', { name: 'Fondement' }) })
    .last()
  await removeDialog.getByRole('radio', { name: /^Les règles de / }).click()
  const explanation = 'Les messages publicitaires ne sont pas admis dans les commentaires.'
  await removeDialog.getByLabel('Explication', { exact: true }).fill(explanation)
  await removeDialog.getByRole('button', { name: 'Retirer', exact: true }).click()
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
  await sam.page.getByText(spam, { exact: true }).waitFor()
  console.log('  ok : Sam lit le bandeau, l’explication et son texte')
  await open(lea.page, `${appUrl}/projects/${projectId}`)
  // Pour Léa, le commentaire retiré n'est plus qu'un emplacement, sans auteur ; sa réponse reste.
  await lea.page.getByText('Contenu retiré par la modération', { exact: true }).waitFor()
  await lea.page.getByText(leaAnswer, { exact: true }).waitFor()
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
  await karim.page.getByRole('button', { name: 'Publier un projet', exact: true }).first().waitFor()
  console.log('  ok : Karim voit « Publier »')

  step('L’administrateur suspend Karim 7 jours, depuis la page de Karim')
  await open(admin.page, `${appUrl}/members/${karimId}`)
  await admin.page.getByRole('button', { name: 'Plus d’actions' }).click()
  await admin.page.getByRole('menuitem', { name: 'Suspendre le compte' }).click()
  await admin.page.waitForURL(/\/suspend\?/)
  await admin.page.getByRole('heading', { name: 'Suspendre le compte de Karim' }).waitFor()
  await admin.page.getByRole('radio', { name: '7 jours', exact: true }).click()
  await admin.page.getByRole('radio', { name: /^Les règles de / }).click()
  const suspensionExplanation = 'Des messages publicitaires répétés sous les projets des autres.'
  await admin.page.getByLabel('Explication', { exact: true }).fill(suspensionExplanation)
  await admin.page.getByRole('button', { name: 'Suspendre le compte', exact: true }).click()
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
  const banner = karim.page.getByRole('status').filter({ hasText: 'Ton compte est suspendu' })
  await banner.first().waitFor()
  await banner.first().getByText(new RegExp(suspensionExplanation)).waitFor()
  expectEqual(
    '« Publier » pour Karim suspendu',
    await karim.page.getByRole('button', { name: 'Publier un projet', exact: true }).count(),
    0,
  )
  console.log('  ok : Karim lit le bandeau et son explication ; « Publier » a disparu')

  step('L’administrateur lève la suspension, plus tôt que prévu')
  await open(admin.page, `${appUrl}/members/${karimId}`)
  // La ligne que seul un administrateur lit, avec l'heure de Paris.
  await admin.page.getByText(/^Compte suspendu jusqu’au .+\(heure de Paris\)$/).waitFor()
  await admin.page.getByRole('button', { name: 'Plus d’actions' }).click()
  await admin.page.getByRole('menuitem', { name: 'Lever la suspension' }).click()
  await admin.page.waitForURL(/\/suspend\?/)
  await admin.page.getByRole('heading', { name: 'Lever la suspension de Karim' }).waitFor()
  await admin.page.getByRole('radio', { name: 'Plus tôt que prévu', exact: true }).click()
  await admin.page
    .getByLabel('Explication', { exact: true })
    .fill('Karim a supprimé ses messages et s’est excusé.')
  await admin.page.getByRole('button', { name: 'Lever la suspension', exact: true }).click()
  await admin.page.getByText('Suspension levée.', { exact: true }).waitFor()
  await waitFor(
    'levée de la suspension, dans l’API',
    async () => (await karimMe()).suspension === null,
  )
  await open(karim.page, `${appUrl}/`)
  await karim.page.getByRole('button', { name: 'Publier un projet', exact: true }).first().waitFor()
  expectEqual('bandeau pour Karim, après la levée', await banner.count(), 0)
  console.log('  ok : Karim retrouve « Publier », sans bandeau')

  step('L’historique de modération de Karim montre la suspension et la levée')
  await open(admin.page, `${appUrl}/members/${karimId}`)
  await admin.page.getByRole('button', { name: 'Plus d’actions' }).click()
  await admin.page.getByRole('menuitem', { name: 'Historique de modération' }).click()
  await admin.page.waitForURL(/\/moderation\?.*member=/)
  await admin.page.getByText(/^Décisions qui visent @/).waitFor()
  await admin.page.getByText('Levée de la suspension', { exact: true }).first().waitFor()
  await admin.page.getByText('Suspension', { exact: true }).first().waitFor()
  await admin.page.getByText(suspensionExplanation).first().waitFor()
  console.log('  ok : l’historique montre les deux décisions')

  step('Léa passe le projet en privé : la photo devient introuvable, même pour qui a l’adresse')
  await open(lea.page, `${appUrl}/projects/${projectId}/edit`)
  await lea.page.getByRole('switch', { name: 'Public' }).click()
  await lea.page.getByRole('button', { name: 'Enregistrer' }).last().click()
  await lea.page.waitForURL(/\/projects\/[0-9a-f-]{36}$/)
  expectEqual('visibilité', (await readProject(lea, projectId)).visibility, 'private')
  expectEqual('photo, pour Léa', await statusFor(lea, photoUrl), 200)
  expectEqual('photo, pour Sam', await statusFor(sam, photoUrl), 404)
  expectEqual('photo, sans compte', await statusFor(visitor, photoUrl), 404)
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  await sam.page.getByText('Ce projet est introuvable').waitFor()
  console.log('  ok : la page du projet est introuvable pour Sam')
  await open(sam.page, `${appUrl}/`)
  await sam.page.getByText('Rien de neuf pour l’instant chez les personnes que tu suis.').waitFor()
  console.log('  ok : le projet a quitté le fil de Sam')

  step('La page de Léa : Sam n’y voit plus le projet, Léa le voit, marqué « Privé »')
  await open(sam.page, `${appUrl}/members/${me.id}`)
  await sam.page.getByText('Pas encore de projet public.').waitFor()
  console.log('  ok : la page de Léa ne montre aucun projet à Sam')
  await open(lea.page, `${appUrl}/members/${me.id}`)
  await lea.page.getByRole('link', { name: 'Mon agent de recettes' }).waitFor()
  await lea.page.getByText('Privé', { exact: true }).waitFor()
  console.log('  ok : Léa voit son projet privé sur sa page')

  step('Léa supprime le projet : ses photos disparaissent du disque')
  await open(lea.page, `${appUrl}/projects/${projectId}`)
  await lea.page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await lea.page.getByRole('button', { name: 'Supprimer le projet' }).click()
  await lea.page.waitForURL((url) => !url.pathname.startsWith('/projects/'))
  expectEqual('photo, pour Léa', await statusFor(lea, photoUrl), 404)
  await expectMedia('après la suppression du projet', { avatars: 1, visuals: 0 })

  step('Léa supprime son compte : son avatar disparaît du disque')
  await open(lea.page, `${appUrl}/account/delete`)
  await lea.page.getByLabel('Confirme avec ton mot de passe').fill(password)
  await lea.page.getByRole('button', { name: 'Supprimer définitivement' }).click()
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
