// Le parcours réel d'un membre (scripts/journey.mjs), joué sur ce PC, sans Docker : l'API tourne
// avec une base PGlite et un dossier de médias neufs, l'appli construite (dist-shots) est servie
// comme par un hébergeur, puis le navigateur joue le parcours de bout en bout. Une ou deux minutes,
// au lieu d'attendre la pile de production de la CI (infra/stack-test.sh) pour voir qu'un texte a
// changé ou qu'un bouton ne répond plus.
//
// Usage : pnpm --filter @ruche/app journey [-- --no-build] [-- --keep]
//   --no-build  réutilise la construction de dist-shots telle quelle (un avertissement si elle ne
//               vient pas du code actuel) ; sans cette option, elle est refaite si besoin ;
//   --keep      garde le dossier temporaire (base, médias, logs) même quand tout va bien.
//
// Ce que ce parcours ne vérifie pas, et que seule la CI vérifie : la porte d'entrée Caddy, HTTPS et
// les en-têtes de sécurité (CSP…), PostgreSQL (ici PGlite), les images Docker, la sauvegarde.
//
// Les adresses sont imposées par la construction : l'appli construite appelle l'API sur
// http://localhost:3000 (src/config.ts), et l'API n'accepte que l'origine de l'appli (APP_URL),
// http://localhost:8081. Ces deux ports doivent donc être libres (pas de « pnpm dev » en même temps).
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  createWriteStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  build,
  buildSite,
  checkStamp,
  createSiteServer,
  currentStamp,
  root,
  stampFile,
} from './dist-shots.mjs'

const API_PORT = 3000
const APP_PORT = 8081
const apiUrl = `http://localhost:${API_PORT}`
const appUrl = `http://localhost:${APP_PORT}`
const apiDir = join(root, '..', 'api')
const started = Date.now()

const args = process.argv.slice(2).filter((arg) => arg !== '--')
for (const arg of args) {
  if (!['--no-build', '--keep'].includes(arg)) {
    console.error(`Option inconnue : ${arg}. Options possibles : --no-build, --keep.`)
    process.exit(2)
  }
}
const step = (text) => console.log(`\n■ ${text}`)

// 1. Les deux ports sont-ils libres ? On essaie d'écouter dessus un instant.
const isFree = (port) =>
  new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', () => resolve(false))
    probe.listen(port, () => probe.close(() => resolve(true)))
  })
for (const port of [API_PORT, APP_PORT]) {
  if (!(await isFree(port))) {
    console.error(
      `Le port ${port} est déjà pris (un « pnpm dev » ou une API qui tourne ?) : arrête-le d'abord.`,
    )
    process.exit(1)
  }
}

// 2. L'appli construite : refaite si elle ne vient pas du commit actuel, ou si la copie de travail a
// des changements (on ne sait pas s'ils datent d'avant ou d'après la construction).
const built = existsSync(stampFile) ? readFileSync(stampFile, 'utf8').trim() : null
const now = currentStamp()
if (args.includes('--no-build')) checkStamp()
else if (!existsSync(join(build, 'index.html')) || built !== now || now.endsWith('modifié')) {
  step(`Construction de l'appli web (dist-shots), pour ${now}`)
  buildSite()
} else console.log(`Construction réutilisée : elle vient de ${now}.`)

// 3. Un dossier temporaire pour tout ce que le parcours écrit : base, médias, logs, captures.
const work = mkdtempSync(join(tmpdir(), 'waiggle-parcours-'))
const logFile = join(work, 'api.log')
const mediaDir = join(work, 'media')
const inviteCode = randomBytes(8).toString('hex')

// Deux petits scripts que journey.mjs lance pour lire les e-mails (écrits par l'API dans son log)
// et lister les photos sur le disque. En Node plutôt que « cat » et « find », absents de Windows.
const mailScript = join(work, 'mail.mjs')
const mediaScript = join(work, 'media.mjs')
writeFileSync(
  mailScript,
  `import { readFileSync } from 'node:fs'\nprocess.stdout.write(readFileSync(${JSON.stringify(logFile)}))\n`,
)
writeFileSync(
  mediaScript,
  `import { existsSync, readdirSync } from 'node:fs'\nconst dir = ${JSON.stringify(mediaDir)}\nif (existsSync(dir)) for (const f of readdirSync(dir, { recursive: true })) if (f.endsWith('.webp')) console.log(\`\${dir}/\${f}\`.replaceAll('\\\\', '/'))\n`,
)
const command = (script) => `"${process.execPath}" "${script}"`

// tsx lit le TypeScript sans étape de construction ; on le trouve, comme @ruche/db, depuis l'API.
const fromApi = createRequire(join(apiDir, 'package.json'))
const tsx = pathToFileURL(fromApi.resolve('tsx/esm')).href

// 4. La base, préparée avant l'API (tranche 7a). Le parcours a besoin d'un administrateur de la
// modération ; aucune route de l'API ne donne ce rôle, et en production seul infra/grant-admin.sh
// l'écrit, directement dans la table admin_member. Ici, impossible d'écrire dans la base pendant
// que l'API tourne : PGlite n'accepte qu'un seul processus à la fois. On la crée donc avant (les
// migrations, comme l'API le ferait), et on y pose un « déclencheur » : une fonction que
// PostgreSQL lance lui-même après chaque écriture dans la table des comptes. Dès qu'un compte
// dont l'adresse commence par « admin- » (celui que journey.mjs inscrit sous le nom « Admin »)
// a vérifié son adresse, il est inscrit comme administrateur : la même écriture et la même
// condition (adresse vérifiée) que grant-admin.sh. Cette base est jetée à la fin du parcours.
step('La base du parcours : migrée, et prête à désigner son administrateur')
const pgliteDir = join(work, 'pglite')
const prepareScript = join(work, 'prepare-db.mts')
const grantAdminSql = `
create function journey_grant_admin() returns trigger language plpgsql as $fn$
begin
  insert into admin_member (user_id, granted_at) values (new.id, now() at time zone 'UTC')
  on conflict (user_id) do nothing;
  return new;
end
$fn$;
create trigger journey_grant_admin after insert or update of email_verified on "user"
  for each row when (new.email_verified and new.email like 'admin-%@example.com')
  execute function journey_grant_admin();
`
writeFileSync(
  prepareScript,
  [
    `import { createPgliteDb } from ${JSON.stringify(pathToFileURL(fromApi.resolve('@ruche/db/pglite')).href)}`,
    `const { db, close } = await createPgliteDb(${JSON.stringify(pgliteDir)})`,
    // $client : le client PGlite sous Drizzle ; exec() accepte plusieurs requêtes à la suite.
    `await db.$client.exec(${JSON.stringify(grantAdminSql)})`,
    'await close()',
  ].join('\n'),
)
const prepared = spawnSync(process.execPath, ['--import', tsx, prepareScript], {
  cwd: apiDir,
  encoding: 'utf8',
})
if (prepared.status !== 0) {
  console.error(`La préparation de la base a échoué :\n${prepared.stderr || prepared.stdout}`)
  process.exit(1)
}

// 5. L'API, lancée par Node avec tsx. On passe par « node --import tsx » plutôt que par la
// commande tsx : un seul processus, qu'on sait arrêter.
step(`L'API sur ${apiUrl} (base et médias dans ${work})`)
const log = createWriteStream(logFile)
const api = spawn(process.execPath, ['--import', tsx, 'src/index.ts'], {
  cwd: apiDir,
  env: {
    ...process.env,
    PORT: String(API_PORT),
    NODE_ENV: 'development',
    DATABASE_URL: '', // vide = absente : PGlite, même si la variable traîne dans l'environnement
    PGLITE_DIR: pgliteDir,
    MEDIA_DIR: mediaDir,
    MAIL_PROVIDER: 'console',
    SIGNUP_INVITE_CODE: inviteCode,
    APP_URL: appUrl,
    PUBLIC_API_URL: apiUrl,
  },
})
api.stdout.pipe(log)
api.stderr.pipe(log)
let apiExited = false
api.on('exit', () => {
  apiExited = true
})

const site = createSiteServer()
// Arrête tout ; garde le dossier temporaire s'il peut servir à comprendre un échec.
const finish = async (code, why) => {
  site.close()
  if (!apiExited) {
    api.kill()
    await new Promise((resolve) => api.once('exit', resolve))
  }
  log.end()
  if (why) console.error(`\n${why}`)
  const seconds = Math.round((Date.now() - started) / 1000)
  if (code === 0 && !args.includes('--keep')) {
    // PGlite peut garder ses fichiers ouverts un court instant après l'arrêt : on réessaie.
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    console.log(`\nParcours local réussi en ${seconds} s.`)
  } else {
    console.log(
      `\nDossier gardé : ${work} (api.log, captures journey-*.png en cas d'échec). ${seconds} s.`,
    )
  }
  process.exit(code)
}
const tail = () => readFileSync(logFile, 'utf8').split('\n').slice(-30).join('\n')

// L'API est prête quand /health répond (migrations comprises : une dizaine de secondes au plus).
const deadline = Date.now() + 60_000
for (;;) {
  if (apiExited) await finish(1, `L'API s'est arrêtée au démarrage :\n${tail()}`)
  const ok = await fetch(`${apiUrl}/health`)
    .then((res) => res.ok)
    .catch(() => false)
  if (ok) break
  if (Date.now() > deadline) await finish(1, `L'API ne répond pas après 60 s :\n${tail()}`)
  await new Promise((resolve) => setTimeout(resolve, 300))
}

// 6. L'appli, servie sur toutes les adresses de la machine (localhost peut être 127.0.0.1 ou ::1).
await new Promise((resolve) => site.listen(APP_PORT, resolve))
console.log(`L'appli sur ${appUrl}`)

// 7. Le parcours lui-même, lancé depuis le dossier temporaire (ses captures d'échec y vont).
step('Le parcours (scripts/journey.mjs)')
const journey = spawn(process.execPath, [join(root, 'scripts', 'journey.mjs'), appUrl, apiUrl], {
  cwd: work,
  stdio: 'inherit',
  env: {
    ...process.env,
    JOURNEY_INVITE_CODE: inviteCode,
    JOURNEY_MAIL_CMD: command(mailScript),
    JOURNEY_MEDIA_CMD: command(mediaScript),
  },
})
const code = await new Promise((resolve) => journey.on('exit', (status) => resolve(status ?? 1)))
await finish(code, code === 0 ? null : `Le parcours a échoué. Fin du log de l'API :\n${tail()}`)
