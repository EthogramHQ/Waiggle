// Le parcours réel d'un membre, joué dans un vrai navigateur à la place de Louis : deux personnes
// s'inscrivent, l'une suit l'autre et publie un projet avec des photos, l'autre le voit arriver dans
// son fil et le regarde, réagit et commente (l'auteur répond, puis masque le commentaire) ; puis le
// projet devient privé, est supprimé, et le compte aussi. À chaque étape, on vérifie ce que voit chacun (le
// membre, l'autre membre, une personne sans compte) et ce qui reste sur le disque du serveur.
//
// Usage : node apps/app/scripts/journey.mjs <adresse de l'appli> <adresse de l'API>
// Variables d'environnement :
//   JOURNEY_INVITE_CODE  le code d'invitation du serveur essayé ;
//   JOURNEY_MAIL_CMD     une commande qui affiche les logs de l'API, où le serveur d'essai écrit
//                        ses e-mails (ALLOW_CONSOLE_MAIL) : on y lit les liens de vérification ;
//   JOURNEY_MEDIA_CMD    (facultatif) une commande qui liste les fichiers du dossier des médias,
//                        pour vérifier que les fichiers disparaissent avec ce qu'ils illustrent ;
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

/** Le lien de vérification envoyé à cette adresse (la console de l'API écrit l'e-mail entier). */
const verificationLink = (email) =>
  waitFor(`lien de vérification pour ${email}`, () => {
    const logs = execSync(mailCommand, { encoding: 'utf8', shell, maxBuffer: 64 * 1024 * 1024 })
    const block = logs.split(`E-mail pour ${email}`).at(-1)
    if (block === logs) return null
    return block.match(/https?:\/\/\S+verify-email\S+/)?.[0] ?? null
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
  await page.getByLabel('Prénom ou pseudo').fill(name)
  await page.getByLabel('Adresse e-mail').fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByLabel('Code d’invitation').fill(inviteCode)
  await page.getByRole('button', { name: 'Créer un compte' }).click()
  await page.waitForURL(/\/check-email/)
  // Le lien connecte au compte, puis mène à la page « Adresse vérifiée ».
  await open(page, await verificationLink(email))
  await page.getByText('Adresse vérifiée').waitFor()
  console.log(`  ok : ${name} inscrite et vérifiée`)
  return email
}

const lea = await person('Léa')
const sam = await person('Sam')
const visitor = await person('Visiteur')

try {
  step('Deux personnes s’inscrivent avec le code d’invitation, et vérifient leur adresse')
  await signUp(lea, 'Lea')
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

  step('Sam ne suit personne : son fil le dit ; il suit Léa depuis sa page')
  await open(sam.page, `${appUrl}/`)
  await sam.page.getByText('Tu ne suis personne pour l’instant').waitFor()
  await open(sam.page, `${appUrl}/members/${me.id}`)
  await sam.page.getByRole('switch', { name: 'Suivre Lea' }).click()
  // Une fois suivie, le nom lu reprend le texte affiché : « Suivi : Lea », activé.
  await sam.page.getByRole('switch', { name: /^Suivi.*Lea$/, checked: true }).waitFor()
  const leaForSam = await (await sam.request.get(`${apiUrl}/v1/members/${me.id}`)).json()
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
  // L'ordre est maintenant bleu, rouge, vert : la deuxième est la rouge.
  await lea.page.getByRole('button', { name: 'Retirer la photo 2' }).click()
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
  const samSays = 'Testé ce soir : une soupe parfaite.'
  await sam.page.getByRole('button', { name: 'Écrire un commentaire' }).click()
  await sam.page.getByLabel('Ton commentaire').fill(samSays)
  await sam.page.getByRole('button', { name: 'Publier le commentaire' }).click()
  await sam.page.getByText('Commentaire publié.').waitFor()
  await open(lea.page, `${appUrl}/projects/${projectId}`)
  await lea.page.getByText(samSays, { exact: true }).waitFor()
  await lea.page.getByRole('button', { name: 'Répondre', exact: true }).click()
  await lea.page.getByLabel('Ta réponse').fill('Merci Sam, la version dessert arrive.')
  await lea.page.getByRole('button', { name: 'Publier la réponse' }).click()
  await lea.page.getByText('Réponse publiée.').waitFor()
  // Sa propre réponse, Léa la supprimerait ; celui de Sam, elle peut le masquer.
  await lea.page.getByRole('button', { name: 'Masquer le commentaire' }).click()
  // C'est elle qui l'a masqué : son bandeau le dit ainsi ; Sam lit « Masqué par l'auteur du projet ».
  await lea.page.getByText('Masqué par toi').waitFor()
  // Un commentaire masqué ne compte plus : reste la réponse de Léa.
  expectEqual('commentaires comptés', (await readProject(lea, projectId)).commentCount, 1)
  await open(sam.page, `${appUrl}/projects/${projectId}`)
  await sam.page.getByText('Masqué par l’auteur du projet').waitFor()
  await sam.page.getByText(samSays, { exact: true }).waitFor()
  console.log('  ok : Sam voit son commentaire, marqué « masqué »')
  expectEqual(
    'commentaires, sans compte',
    await statusFor(visitor, `${apiUrl}/v1/projects/${projectId}/comments`),
    401,
  )

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
  for (const [who, someone] of Object.entries({ lea, sam })) {
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
