// Test du rattrapage du jeu par la migration 0030 (R19, choix 17 du plan). Au déploiement, les membres
// existants reçoivent une fois le pollen et les sceaux de ce qu'ils ont déjà fait : réactions,
// commentaires, inscriptions de testeur, retours et retours réglés, mises à jour, projets publiés,
// suivis, ruches créées, invitations acceptées, profil (photo, bio, premier outil). Les entrées
// gardent la date d'origine du geste (jour et semaine de Paris), sans plafond par jour pour le
// passé ; ni miel, ni défis, ni avis, sauf l'avis d'introduction (« Nouveau : ta récolte… », relecture
// juridique J1), un par compte. Les comptes d'exemple ne gagnent rien et ne font gagner personne. Un
// contenu déjà retiré par la modération entre révoqué et ne compte pour aucun sceau (J4, S5). Les
// entrées du rattrapage portent `backfill = true` : elles ne comptent pas dans les semaines
// butinées, et les séries partent de zéro (scénario, « Au lancement »).
// Scénario : docs/scenarios/refonte.md, R19, « Au lancement ».
//
// Même méthode que `activity-migration.test.ts` (R11) : une base vide, les migrations jusqu'à 0028
// (la dernière déployée avant R19), un historique posé en SQL brut, puis 0029 (les tables du jeu)
// et 0030 (le rattrapage), et on lit le résultat. Les dates sont relues en texte (`::text`) :
// `db.execute` ne rend pas des `Date`. Les heures sont en temps universel, comme en base.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Database, defaultMigrationsFolder } from './src/index'
import { createTestPgliteDb } from './src/pglite'

/** La dernière migration déployée avant R19 : l'état de départ du jeu. */
const DEPLOYED = '0028_examples_r12b'
const GAME = '0029_game'
const BACKFILL = '0030_game_backfill'

let db: Database
let close: () => Promise<void>
/** Les instructions de 0030, gardées pour la rejouer (un rattrapage doit pouvoir repasser). */
let backfill: { sql: string[] }[] = []

/** Le résultat d'une requête SQL brute ; on précise nous-mêmes la forme des lignes. */
const rowsOf = async <T>(query: ReturnType<typeof sql>) =>
  ((await db.execute(query)) as unknown as { rows: T[] }).rows

/** Applique des migrations instruction par instruction, comme le fait Drizzle. */
const apply = async (migrations: { sql: string[] }[]) => {
  for (const migration of migrations) {
    for (const statement of migration.sql) {
      if (statement.trim()) await db.execute(sql.raw(statement))
    }
  }
}

// Les membres : Sam (l'auteur), Léa (qui l'aide), Max (dont des contenus ont été retirés), Inès (qui
// n'a encore rien fait) et WaiggleBot, le compte d'exemple.
const SAM = 'sam'
const LEA = 'lea'
const MAX = 'max'
const INES = 'ines'
const BOT = 'bot'

// Les projets : A, B et C (Cuisine, publiés par Sam), D (le brouillon de Sam), E (celui de
// WaiggleBot), F (celui de Max, retiré par la modération).
const A = randomUUID()
const B = randomUUID()
const C = randomUUID()
const D = randomUUID()
const E = randomUUID()
const F = randomUUID()
const HIVE = randomUUID()

/** Le jour où Léa commente vingt fois : un mardi de mars, à l'heure d'hiver de Paris. */
const BUSY_DAY = '2026-03-10'

const addProject = (
  id: string,
  authorId: string,
  title: string,
  { publishedAt, removedAt }: { publishedAt: string | null; removedAt?: string },
) =>
  db.execute(sql`
    insert into project (id, author_id, title, pitch, primary_category, status, demo_url, created_at, updated_at, published_at, removed_at)
    values (${id}, ${authorId}, ${title}, 'Un petit projet.', 'cooking', 'testable', 'https://demo.example.com/',
      '2026-01-05 09:00:00', '2026-01-05 09:00:00', ${publishedAt}::timestamp, ${removedAt ?? null}::timestamp)
  `)

const addComment = (
  projectId: string,
  authorId: string,
  createdAt: string,
  { removedAt }: { removedAt?: string } = {},
) =>
  db.execute(sql`
    insert into project_comment (id, project_id, author_id, body, created_at, removed_at)
    values (${randomUUID()}, ${projectId}, ${authorId}, 'Bravo !', ${createdAt}::timestamp, ${removedAt ?? null}::timestamp)
  `)

/** Un testeur, son fil, et son retour (« Ça a marché ? Oui »), réglé ou retiré au besoin. */
const addTesterWithFeedback = async (
  projectId: string,
  testerId: string,
  {
    joinedAt,
    feedbackAt,
    settledAt,
    removedAt,
  }: { joinedAt: string; feedbackAt: string; settledAt?: string; removedAt?: string },
) => {
  await db.execute(sql`
    insert into project_tester (member_id, project_id, created_at) values (${testerId}, ${projectId}, ${joinedAt}::timestamp)
  `)
  await db.execute(sql`
    insert into tester_thread (project_id, tester_id, created_at) values (${projectId}, ${testerId}, ${feedbackAt}::timestamp)
  `)
  await db.execute(sql`
    insert into tester_message (id, project_id, tester_id, sender_id, kind, outcome, created_at, settled_at, removed_at)
    values (${randomUUID()}, ${projectId}, ${testerId}, ${testerId}, 'feedback', 'yes', ${feedbackAt}::timestamp,
      ${settledAt ?? null}::timestamp, ${removedAt ?? null}::timestamp)
  `)
}

beforeAll(async () => {
  ;({ db, close } = await createTestPgliteDb())
  // createTestPgliteDb rend une base déjà migrée : on la vide, pour repartir d'avant R19.
  await db.execute(sql.raw('drop schema public cascade'))
  await db.execute(sql.raw('create schema public'))
  const journal: { entries: { tag: string }[] } = JSON.parse(
    readFileSync(join(defaultMigrationsFolder, 'meta', '_journal.json'), 'utf8'),
  )
  const cut = journal.entries.findIndex((entry) => entry.tag === DEPLOYED) + 1
  // Les deux migrations du jeu suivent la dernière déployée, dans cet ordre.
  expect(journal.entries.slice(cut, cut + 2).map((entry) => entry.tag)).toEqual([GAME, BACKFILL])
  const migrations = readMigrationFiles({ migrationsFolder: defaultMigrationsFolder })
  await apply(migrations.slice(0, cut))

  for (const id of [SAM, LEA, MAX, INES, BOT]) {
    await db.execute(
      sql`insert into "user" (id, name, email, email_verified, created_at, updated_at) values (${id}, ${id}, ${`${id}@example.com`}, true, '2026-01-01 08:00:00', '2026-01-01 08:00:00')`,
    )
  }
  await db.execute(
    sql`insert into example_account (user_id, marked_at) values (${BOT}, '2026-01-02 08:00:00')`,
  )

  // Le profil de Sam : une photo, une bio et deux outils favoris (seul le premier rapporte).
  await db.execute(sql`
    insert into profile (user_id, bio, avatar_key, updated_at)
    values (${SAM}, 'Je cuisine avec des agents.', 'avatars/sam.webp', '2026-01-03 10:00:00')
  `)
  const tools = await rowsOf<{ id: string }>(sql`select id from tool order by slug limit 2`)
  for (const [position, tool] of tools.entries()) {
    await db.execute(
      sql`insert into profile_tool (user_id, tool_id, position) values (${SAM}, ${tool.id}, ${position})`,
    )
  }

  // Les projets : trois publiés, un brouillon, celui du compte d'exemple, celui de Max retiré.
  await addProject(A, SAM, 'Recettes du frigo', { publishedAt: '2026-01-05 09:00:00' })
  await addProject(B, SAM, 'Menus de la semaine', { publishedAt: '2026-01-06 09:00:00' })
  await addProject(C, SAM, 'Liste de courses', { publishedAt: '2026-01-07 09:00:00' })
  await addProject(D, SAM, 'Brouillon', { publishedAt: null })
  await addProject(E, BOT, 'Exemple', { publishedAt: '2026-01-05 09:00:00' })
  await addProject(F, MAX, 'Copie', {
    publishedAt: '2026-01-08 09:00:00',
    removedAt: '2026-01-09 09:00:00',
  })

  // Une mise à jour de A.
  await db.execute(sql`
    insert into project_update (id, project_id, title, lines, created_at)
    values (${randomUUID()}, ${A}, 'Version 2', '[]'::jsonb, '2026-02-01 09:00:00')
  `)

  // Léa réagit à A un dimanche à 23 h 30 en temps universel : lundi 0 h 30 à Paris. WaiggleBot réagit
  // aussi à A, et Léa réagit au projet de WaiggleBot : ni l'un ni l'autre ne rapporte.
  await db.execute(sql`
    insert into project_reaction (project_id, member_id, kind, created_at) values
      (${A}, ${LEA}, 'bravo', '2026-03-15 23:30:00'),
      (${A}, ${BOT}, 'useful', '2026-03-16 10:00:00'),
      (${E}, ${LEA}, 'amazing', '2026-03-16 11:00:00')
  `)

  // Léa commente vingt fois le même jour (au-delà du plafond de 10 d'aujourd'hui) : 18 fois A, une
  // fois B, une fois C (trois projets de Cuisine). Puis une fois le projet de WaiggleBot. Sam
  // répond sur son propre projet : rien. Max commente B, commentaire retiré ensuite.
  for (let i = 0; i < 20; i += 1) {
    const project = i === 18 ? B : i === 19 ? C : A
    const minute = String(10 + i).padStart(2, '0')
    await addComment(project, LEA, `${BUSY_DAY} 09:${minute}:00`)
  }
  await addComment(E, LEA, '2026-03-11 09:00:00')
  await addComment(A, SAM, '2026-03-11 10:00:00')
  await addComment(B, MAX, '2026-03-12 09:00:00', { removedAt: '2026-03-13 09:00:00' })

  // Léa teste A, y fait un retour (un soir d'été : 23 h 30 à Paris, le même jour), réglé plus tard.
  await addTesterWithFeedback(A, LEA, {
    joinedAt: '2026-06-01 09:00:00',
    feedbackAt: '2026-06-10 21:30:00',
    settledAt: '2026-06-12 09:00:00',
  })
  // Max teste B ; son seul retour a été retiré par la modération.
  await addTesterWithFeedback(B, MAX, {
    joinedAt: '2026-06-02 09:00:00',
    feedbackAt: '2026-06-03 09:00:00',
    removedAt: '2026-06-04 09:00:00',
  })

  // Les suivis : Léa suit le projet A, Sam suit Léa ; Léa suit WaiggleBot (rien).
  await db.execute(sql`
    insert into project_follow (follower_id, project_id, created_at) values (${LEA}, ${A}, '2026-04-01 09:00:00')
  `)
  await db.execute(sql`
    insert into member_follow (follower_id, member_id, created_at) values
      (${SAM}, ${LEA}, '2026-04-02 09:00:00'),
      (${LEA}, ${BOT}, '2026-04-03 09:00:00')
  `)

  // Sam crée « Famille » et y fait entrer Léa (l'invitation acceptée paie les deux).
  await db.execute(sql`
    insert into hive (id, name, icon, animator_id, name_set_by, created_by, created_at, updated_at)
    values (${HIVE}, 'Famille', 'house-line', ${SAM}, ${SAM}, ${SAM}, '2026-05-01 09:00:00', '2026-05-01 09:00:00')
  `)
  await db.execute(sql`
    insert into hive_member (hive_id, user_id, invited_by, joined_at) values
      (${HIVE}, ${SAM}, null, '2026-05-01 09:00:00'),
      (${HIVE}, ${LEA}, ${SAM}, '2026-05-02 09:00:00')
  `)

  await apply(migrations.slice(cut, cut + 1))
  backfill = migrations.slice(cut + 1, cut + 2)
  await apply(backfill)
})

afterAll(async () => {
  await close()
})

type Entry = {
  member_id: string
  gesture: string
  amount: number
  day: string
  week: string
  created_at: string
  revoked_at: string | null
}

const entries = () =>
  rowsOf<Entry>(sql`
    select member_id, gesture, amount, day::text, week::text, created_at::text, revoked_at::text
    from pollen_entry order by member_id, gesture, created_at
  `)

/** Le pollen qui compte (entrées non révoquées), additionné par geste, pour un membre. */
const pollenOf = async (memberId: string) => {
  const sums: Record<string, number> = {}
  for (const entry of await entries()) {
    if (entry.member_id !== memberId || entry.revoked_at !== null) continue
    sums[entry.gesture] = (sums[entry.gesture] ?? 0) + Number(entry.amount)
  }
  return sums
}

const sealsOf = async (memberId: string) =>
  (
    await rowsOf<{ code: string }>(
      sql`select code from seal where member_id = ${memberId} order by code`,
    )
  ).map((row) => row.code)

/** Le nombre de lignes de chaque table du jeu : ce qu'un second passage ne doit pas changer. */
const counts = async () => {
  const [row] = await rowsOf<{ pollen: number; seals: number; notices: number }>(sql`
    select (select count(*) from pollen_entry)::int as pollen,
      (select count(*) from seal)::int as seals,
      (select count(*) from game_notice)::int as notices
  `)
  return row
}

describe('the backfill of the game by migration 0030', () => {
  it('credits every kind of past gesture to the member who made it and to the author who received it', async () => {
    expect(await pollenOf(LEA)).toEqual({
      reaction: 2,
      comment: 20 * 10,
      tester: 10,
      feedback: 25,
      feedback_settled: 25,
      follow: 3,
      invitation_joined: 15,
    })
    expect(await pollenOf(SAM)).toEqual({
      // Trois projets publiés, pas le brouillon ; son commentaire sur son propre projet : rien.
      publish: 3 * 50,
      update: 20,
      profile_photo: 10,
      profile_bio: 10,
      profile_tool: 10,
      hive_created: 15,
      invitation_accepted: 20,
      follow: 3,
      receive_reaction: 1,
      receive_comment: 20 * 3,
      receive_tester: 2 * 5,
      receive_feedback: 5,
    })
    expect(await pollenOf(MAX)).toEqual({ tester: 10 })
  })

  it('dates every entry at its original gesture, by the day and the week of Paris', async () => {
    const all = await entries()
    const reaction = all.find((entry) => entry.member_id === LEA && entry.gesture === 'reaction')
    // Dimanche 15 mars, 23 h 30 en temps universel : lundi 16 mars à Paris, d'une semaine neuve.
    expect(reaction).toMatchObject({
      created_at: '2026-03-15 23:30:00',
      day: '2026-03-16',
      week: '2026-03-16',
    })
    const received = all.find(
      (entry) => entry.member_id === SAM && entry.gesture === 'receive_reaction',
    )
    expect(received).toMatchObject({ created_at: '2026-03-15 23:30:00', day: '2026-03-16' })
    // Mercredi 10 juin, 21 h 30 en temps universel : 23 h 30 à Paris, le même jour.
    const feedback = all.find((entry) => entry.member_id === LEA && entry.gesture === 'feedback')
    expect(feedback).toMatchObject({
      created_at: '2026-06-10 21:30:00',
      day: '2026-06-10',
      week: '2026-06-08',
    })
    const settled = all.find(
      (entry) => entry.member_id === LEA && entry.gesture === 'feedback_settled',
    )
    expect(settled).toMatchObject({ created_at: '2026-06-12 09:00:00', day: '2026-06-12' })
  })

  it('pays the past without any daily cap, given or received', async () => {
    const onBusyDay = (await entries()).filter((entry) => entry.day === BUSY_DAY)
    const comments = onBusyDay.filter((entry) => entry.member_id === LEA)
    const received = onBusyDay.filter((entry) => entry.member_id === SAM)
    // Vingt commentaires le même jour (plafond d'aujourd'hui : 10), et 60 pollen reçus par Sam
    // (plafond d'aujourd'hui : 50).
    expect(comments.map((entry) => entry.gesture)).toEqual(Array(20).fill('comment'))
    expect(received.reduce((sum, entry) => sum + Number(entry.amount), 0)).toBe(60)
  })

  it('leaves the example account out, as the member who acts and as the author who receives', async () => {
    const all = await entries()
    expect(all.filter((entry) => entry.member_id === BOT)).toEqual([])
    expect(await sealsOf(BOT)).toEqual([])
    // Léa : une seule réaction et vingt commentaires payés, ceux du projet A, B ou C ; sa réaction et
    // son commentaire sur le projet de WaiggleBot, et son suivi de WaiggleBot, ne comptent pas.
    const ofLea = all.filter((entry) => entry.member_id === LEA)
    expect(ofLea.filter((entry) => entry.gesture === 'reaction')).toHaveLength(1)
    expect(ofLea.filter((entry) => entry.gesture === 'comment')).toHaveLength(20)
    expect(ofLea.filter((entry) => entry.gesture === 'follow')).toHaveLength(1)
    // La réaction de WaiggleBot sur A ne fait rien recevoir à Sam.
    const receivedBySam = all.filter(
      (entry) => entry.member_id === SAM && entry.gesture === 'receive_reaction',
    )
    expect(receivedBySam).toHaveLength(1)
  })

  it('backfills removed content as revoked, counted for no seal', async () => {
    const revoked = (await entries()).filter((entry) => entry.revoked_at !== null)
    // Le commentaire, le retour et le projet retirés de Max, et ce que son commentaire et son
    // retour ont fait recevoir à Sam : entrés, mais révoqués.
    expect(revoked.map((entry) => `${entry.member_id}:${entry.gesture}`).sort()).toEqual([
      'max:comment',
      'max:feedback',
      'max:publish',
      'sam:receive_comment',
      'sam:receive_feedback',
    ])
    // Son seul retour et son seul projet ont été retirés : ni « Premier retour », ni « Premier
    // projet ».
    expect(await sealsOf(MAX)).toEqual([])
  })

  it('awards the seals of what the members already did', async () => {
    expect(await sealsOf(SAM)).toEqual(['first_hive', 'first_project', 'first_update'])
    // Léa a commenté trois projets de Cuisine : le sceau de la catégorie (son code, `cooking`).
    expect(await sealsOf(LEA)).toEqual(['cooking', 'first_feedback', 'first_settled'])
    expect(await sealsOf(INES)).toEqual([])
  })

  it('starts every streak and every honey balance at zero after the backfill', async () => {
    // Les entrées du rattrapage sont marquées : les semaines butinées ne les comptent pas.
    const [marks] = await rowsOf<{ total: number; marked: number }>(sql`
      select count(*)::int as total, count(*) filter (where backfill)::int as marked from pollen_entry
    `)
    expect(marks?.total).toBeGreaterThan(0)
    expect(marks?.marked).toBe(marks?.total)
    // Ni miel, ni défi perso, ni défi de ruche.
    const [rest] = await rowsOf<{ honey: number; personal: number; hive: number }>(sql`
      select (select count(*) from honey_entry)::int as honey,
        (select count(*) from personal_challenge)::int as personal,
        (select count(*) from hive_challenge)::int as hive
    `)
    expect(rest).toEqual({ honey: 0, personal: 0, hive: 0 })
  })

  it('writes one intro notice per existing member, never twice', async () => {
    const notices = () =>
      rowsOf<{ member_id: string; kind: string }>(
        sql`select member_id, kind from game_notice where member_id <> ${BOT} order by member_id`,
      )
    const check = async () => {
      const rows = await notices()
      // Un avis par membre, Inès comprise (elle n'a rien fait) ; aucun avis de niveau ni de sceau
      // pour le passé : seulement l'introduction.
      expect(rows.map((row) => row.member_id)).toEqual([INES, LEA, MAX, SAM])
      for (const row of rows) expect(row.kind).toMatch(/intro/)
    }
    await check()

    await apply(backfill)

    await check()
  })

  it('can run again without writing anything twice', async () => {
    const before = await counts()
    expect(before?.pollen).toBeGreaterThan(0)

    await apply(backfill)

    expect(await counts()).toEqual(before)
  })
})
