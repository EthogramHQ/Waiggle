// Les outils des tests des Éclaireuses (R20, docs/scenarios/refonte.md, « R20 — Les Éclaireuses ») :
// poser en base des Éclaireuses, le mois et les missions de la semaine, relire les lignes, envoyer
// un retour en multipart. Rien ici n'est utilisé en production.
//
// Les lignes sont écrites et lues en SQL brut, par les tables et les colonnes que fixe le plan
// (choix 1 : `scout`, `scout_program`, `scout_mission`, `scout_report`, `scout_mission_done`) : les
// tests ne dépendent ainsi ni du schéma Drizzle ni des routes de la page de tri, écrits par
// d'autres. Tant que les tables n'existent pas, la requête échoue (« Failed query ») : c'est la
// bonne raison du rouge.
import { randomBytes } from 'node:crypto'
import { MeScout, programEndOf, weekOf } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq, type SQL, sql } from 'drizzle-orm'
import type { TestContext } from './context'

/**
 * Un code d'invitation tiré au hasard à chaque lancement, comme sur le serveur : aucun code qui
 * ressemble à un vrai n'est écrit dans le dépôt (16 caractères hexadécimaux, au-dessus des 12 exigés).
 */
export const freshCode = () => randomBytes(8).toString('hex')

/** Une date de l'API, écrite en texte ISO et lue en UTC (une colonne `timestamp` sans fuseau). */
const at = (date: Date): SQL => sql`${date.toISOString()}::timestamptz at time zone 'UTC'`

/** Les lignes d'un `db.execute`, typées par le test qui les lit. */
const rowsOf = <T>(result: unknown) => (result as { rows: T[] }).rows

/** L'identifiant du compte d'une adresse (sans passer par GET /v1/me, que la tranche change). */
export const memberIdOf = async (ctx: TestContext, email: string) => {
  const [row] = await ctx.db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
  if (!row) throw new Error(`no account for ${email}`)
  return row.id
}

/**
 * `count` Éclaireuses posées en base : un compte (vérifié par défaut) et sa ligne `scout`, entrée à
 * l'inscription il y a `joinedAt`. Elles n'ont pas de session : seules les places comptent. Rend
 * leurs identifiants.
 */
export const seedScouts = async (
  ctx: TestContext,
  count: number,
  { verified = true, joinedAt = new Date() }: { verified?: boolean; joinedAt?: Date } = {},
) => {
  const ids: string[] = []
  for (let index = 0; index < count; index++) {
    const id = `seed-scout-${index}-${randomBytes(4).toString('hex')}`
    await ctx.db.insert(schema.user).values({
      id,
      name: `Éclaireuse ${index + 1}`,
      email: `${id}@example.com`,
      emailVerified: verified,
    })
    await ctx.db.execute(
      sql`insert into scout (member_id, joined_at, via, removed_at, show_drop)
          values (${id}, ${at(joinedAt)}, 'signup', null, true)`,
    )
    ids.push(id)
  }
  return ids
}

/** L'administrateur retire cette Éclaireuse (écrit en base, comme DELETE /v1/moderation/scouts). */
export const removeScout = (ctx: TestContext, memberId: string, when = new Date()) =>
  ctx.db.execute(sql`update scout set removed_at = ${at(when)} where member_id = ${memberId}`)

/**
 * Le mois des Éclaireuses lancé à `startedAt` (écrit en base, comme POST
 * /v1/moderation/scouts/program) : il finit à minuit de Paris après son 30e jour (`programEndOf`).
 * La ligne unique (`id = 1`) est créée ou remplacée, que la migration l'ait déjà posée ou non.
 */
export const launchProgram = async (ctx: TestContext, startedAt: Date) => {
  const endsAt = programEndOf(startedAt)
  await ctx.db.execute(
    sql`insert into scout_program (id, started_at, ends_at)
        values (1, ${at(startedAt)}, ${at(endsAt)})
        on conflict (id) do update set started_at = excluded.started_at, ends_at = excluded.ends_at`,
  )
  return endsAt
}

/** Un mois lancé il y a 40 jours : il est fini. */
export const endedProgram = (ctx: TestContext) =>
  launchProgram(ctx, new Date(Date.now() - 40 * 24 * 60 * 60 * 1000))

/**
 * Une mission posée en base (comme PUT /v1/moderation/scouts/missions) : la semaine (son lundi, à
 * Paris ; la semaine en cours par défaut), sa place (1 à 3), ses textes. Rend son identifiant.
 */
export const addMission = async (
  ctx: TestContext,
  {
    week = weekOf(new Date()),
    position = 1,
    textFr,
    textEn = null,
  }: { week?: string; position?: number; textFr: string; textEn?: string | null },
) => {
  const id = crypto.randomUUID()
  await ctx.db.execute(
    sql`insert into scout_mission (id, week, position, text_fr, text_en, created_at)
        values (${id}, ${week}::date, ${position}, ${textFr}, ${textEn}, ${at(new Date())})`,
  )
  return id
}

/** Une ligne `scout`, telle que les tests la comparent. */
export type ScoutRow = { memberId: string; via: string; removed: boolean; showDrop: boolean }

/** Toutes les lignes `scout`, retirées comprises, par ordre d'entrée. */
export const scoutRows = async (ctx: TestContext) =>
  rowsOf<ScoutRow>(
    await ctx.db.execute(
      sql`select member_id as "memberId", via, removed_at is not null as removed,
            show_drop as "showDrop"
          from scout order by joined_at, member_id`,
    ),
  )

/** Le nombre de places prises : les Éclaireuses non retirées. */
export const activeScouts = async (ctx: TestContext) =>
  (await scoutRows(ctx)).filter((row) => !row.removed).length

/** Les sceaux d'un membre (table `seal` de R19). */
export const sealsOf = async (ctx: TestContext, memberId: string) =>
  (
    await ctx.db
      .select({ code: schema.seal.code })
      .from(schema.seal)
      .where(eq(schema.seal.memberId, memberId))
  ).map((row) => row.code)

/**
 * `Me.scout` du membre au `cookie`, lu dans GET /v1/me et vérifié par le contrat (`MeScout`, null
 * pour qui ne l'a jamais été). Lu à part, et non par `Me.parse` : un champ absent dit ainsi
 * clairement ce qui manque.
 */
export const meScout = async (ctx: TestContext, cookie: string) => {
  const res = await ctx.request('/v1/me', { headers: { cookie } })
  if (res.status !== 200) throw new Error(`GET /v1/me → ${res.status}`)
  const body = (await res.json()) as { scout?: unknown }
  return MeScout.nullable().parse(body.scout)
}

/** Une capture à joindre : ses octets, son type et son nom de fichier. */
export type Capture = { bytes: Uint8Array; type?: string; name?: string }

/**
 * Le formulaire d'un retour (POST /v1/me/scout/reports, multipart) : la partie `report`, du JSON
 * écrit en texte (un texte donné tel quel reste tel quel, pour les tests d'un JSON cassé), et la
 * partie `file` si une capture est jointe.
 */
export const reportForm = (report: unknown, capture?: Capture) => {
  const form = new FormData()
  form.append('report', typeof report === 'string' ? report : JSON.stringify(report))
  if (capture) {
    form.append(
      'file',
      new File([new Uint8Array(capture.bytes)], capture.name ?? 'capture.jpg', {
        type: capture.type ?? 'image/jpeg',
      }),
    )
  }
  return form
}

/** Envoie un retour ; réponse brute. `headers` complète la requête (langue, appareil…). */
export const sendReport = (
  ctx: TestContext,
  cookie: string | null,
  report: unknown,
  capture?: Capture,
  headers: Record<string, string> = {},
) =>
  ctx.request('/v1/me/scout/reports', {
    method: 'POST',
    headers: { ...(cookie && { cookie }), ...headers },
    body: reportForm(report, capture),
  })

/** Un retour simple et valide : une idée, sans gravité, sans mission ni contexte. */
export const IDEA = { kind: 'idea', text: 'Un bouton pour revenir en haut du fil.' } as const
