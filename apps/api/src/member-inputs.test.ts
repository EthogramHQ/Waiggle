// Le registre des entrées (tranche 7b) : chaque champ qu'un membre saisit est inscrit au registre
// (apps/api/src/moderation/inputs.ts), et ce test vérifie que la base et le registre disent la même
// chose. Demande de Louis (24/10/2026) : toutes les entrées d'un membre sont modérées. Un champ
// ajouté un jour sans être classé fait échouer ce test, avant qu'il puisse échapper au
// signalement, au blocage ou à l'export.
//
// Trois parties :
// - l'inventaire : chaque colonne de chaque table du schéma est classée (au registre, ou « pas une
//   saisie » avec sa raison ; règle 19 de la relecture du plan) ;
// - la couverture : chaque champ du registre, rempli d'une valeur témoin, se retrouve dans la copie
//   d'un signalement et dans l'export de son auteur, jamais dans celui de qui signale ; une image
//   n'y est que sa clé, jamais un fichier de plus (règle 15) ;
// - le blocage : chaque objet du registre (profil, projet, note, commentaire) a sa lecture qui le
//   cache à un membre bloqué.
//
// Inès écrit tout (profil, projet, note, commentaire), Malik signale, puis Inès bloque Malik ; Zoé,
// une troisième, lit encore tout.
import { AccountExport, Project, ReportSnapshot } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { asc, eq, getTableName, is, sql } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type InputObject,
  MEMBER_INPUTS,
  type MemberInput,
  NOT_MEMBER_INPUTS,
} from './moderation/inputs'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { avatarForm, jpegImage, visualForm } from './testing/images'
import { addCatalogueTool, clearCatalogue } from './testing/tool-catalogue'

// ─── L'inventaire du schéma ──────────────────────────────────────────────────────────────────────

/** Toutes les tables du schéma, avec leurs colonnes (nom SQL et type SQL). */
// `unknown[]` : le schéma exporte aussi les relations de Drizzle, que le filtre écarte.
const tables = (Object.values(schema) as unknown[])
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => {
    const config = getTableConfig(table)
    return {
      name: getTableName(table),
      columns: config.columns.map((column) => ({ name: column.name, type: column.getSQLType() })),
    }
  })

/** Une colonne qui peut porter un texte libre : texte, JSON, ou tableau. */
const isFreeType = (type: string) =>
  type === 'text' ||
  type.startsWith('varchar') ||
  type === 'jsonb' ||
  type === 'json' ||
  type.endsWith('[]')

const inRegister = (table: string, column: string) =>
  MEMBER_INPUTS.some((input) => input.table === table && input.column === column)

const notAnInput = (table: string, column: string) => {
  const entry = NOT_MEMBER_INPUTS[table]
  return entry === '*' || (entry !== undefined && Object.hasOwn(entry, column))
}

describe('the register of member inputs', () => {
  it('reads the schema (witness: the tables of this slice are there)', () => {
    const names = tables.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['member_block', 'content_report', 'project']))
  })

  // Tranche 7c (plan, « Données ») : la suspension d'un compte et les colonnes nouvelles des
  // décisions. Aucune n'est une saisie d'un membre : l'explication est celle d'un administrateur,
  // la durée et la raison d'une levée des listes fermées. Les deux tests échouent tant que la
  // migration n'existe pas, puis tant qu'une colonne n'est pas classée avec sa raison.
  const SLICE_7C = {
    moderation_decision: ['target_member_id', 'duration', 'after_report', 'lift_cause'],
    account_suspension: [
      'id',
      'user_id',
      'decision_id',
      'starts_at',
      'ends_at',
      'lifted_at',
      'lift_decision_id',
      'after_report',
    ],
  }

  it('reads the tables and columns of slice 7c', () => {
    for (const [table, columns] of Object.entries(SLICE_7C)) {
      const found = tables.find((t) => t.name === table)?.columns.map((c) => c.name) ?? []
      expect(found, table).toEqual(expect.arrayContaining(columns))
    }
  })

  it('classes the columns of slice 7c as written by the moderation, not by a member', () => {
    const wrong = Object.entries(SLICE_7C).flatMap(([table, columns]) =>
      columns
        .filter((column) => inRegister(table, column) || !notAnInput(table, column))
        .map((column) => `${table}.${column}`),
    )

    expect(wrong).toEqual([])
  })

  // Tranche R6a (plan, « API ») : la catégorie principale et la seconde, la difficulté et le mois
  // de début d'un projet sont des listes fermées (gardées par le contrat), pas des saisies libres ;
  // la description d'une photo est un texte libre du membre : au registre, copiée dans un
  // signalement (`photoDescription`) et dans l'export de son auteur. Ces tests échouent tant que la
  // migration n'existe pas, puis tant qu'une colonne n'est pas classée comme il faut.
  // `time_spent` n'est pas retiré ici : la migration 0015 ne fait qu'ajouter (sec-A6, décision de
  // Louis du 8/11/2026), la colonne part en R6b.
  const SLICE_R6A = {
    project: ['primary_category', 'secondary_category', 'difficulty', 'started_on'],
    project_media: ['description'],
  }

  it('reads the columns of slice R6a', () => {
    for (const [table, columns] of Object.entries(SLICE_R6A)) {
      const found = tables.find((t) => t.name === table)?.columns.map((c) => c.name) ?? []
      expect(found, table).toEqual(expect.arrayContaining(columns))
    }
  })

  it('classes the categories, the difficulty and the started month as closed lists, with a reason', () => {
    const entry = NOT_MEMBER_INPUTS.project
    // Une raison écrite, d'au moins 10 caractères (règle 19) ; jamais toute la table (« * »).
    const reason = (column: string) =>
      entry === undefined || entry === '*' ? '' : (entry[column] ?? '').trim()
    const wrong = SLICE_R6A.project
      .filter(
        (column) =>
          inRegister('project', column) ||
          !notAnInput('project', column) ||
          reason(column).length < 10,
      )
      .map((column) => `project.${column}`)

    expect(wrong).toEqual([])
  })

  it('counts the description of a photo as a text of the project, copied and exported', () => {
    expect(MEMBER_INPUTS).toContainEqual(
      expect.objectContaining({
        object: 'project',
        table: 'project_media',
        column: 'description',
        field: 'photoDescription',
        kind: 'text',
        snapshot: true,
        export: true,
      }),
    )
    expect(notAnInput('project_media', 'description')).toBe(false)
  })

  // Tranche R6b (plan, « Le modèle de données » et décisions 2, 4, 6 et 14) : les tables du catalogue.
  // Le nom partagé d'un « Autre » (tool.name), le nom tapé par chaque membre sur son projet ou son
  // profil (project_tool.label, profile_tool.label) et le nom d'un « Autre » rattaché gardé au
  // journal (catalogue_change.merged_name) sont des saisies de membres ; le reste est écrit par
  // l'API ou par un administrateur. Ces tests échouent tant que la migration 0016 n'existe pas,
  // puis tant qu'une colonne n'est pas classée comme il faut.
  const SLICE_R6B = {
    tool: [
      'id',
      'slug',
      'name',
      'folded',
      'status',
      'family',
      'description_fr',
      'description_en',
      'site_url',
      'created_at',
      'created_by',
      'admitted_at',
    ],
    tool_alias: ['folded', 'tool_id'],
    tool_slug_redirect: ['slug', 'tool_id'],
    project_tool: ['project_id', 'tool_id', 'position', 'label'],
    profile_tool: ['user_id', 'tool_id', 'position', 'label'],
    category: ['code', 'name_fr', 'name_en', 'icon', 'position', 'created_at', 'created_by'],
    catalogue_change: [
      'id',
      'action',
      'admin_id',
      'tool_id',
      'merged_name',
      'category_code',
      'project_id',
      'from_category',
      'created_at',
    ],
    admin_member: ['other_recap_at'],
  }
  /** Les colonnes de R6b qu'un membre écrit (décision 14). */
  const R6B_INPUTS = [
    ['tool', 'name'],
    ['project_tool', 'label'],
    ['profile_tool', 'label'],
    ['catalogue_change', 'merged_name'],
  ] as const

  it('reads the tables and columns of slice R6b, and no longer the time spent', () => {
    for (const [table, columns] of Object.entries(SLICE_R6B)) {
      const found = tables.find((t) => t.name === table)?.columns.map((c) => c.name) ?? []
      expect(found, table).toEqual(expect.arrayContaining(columns))
    }
    const project = tables.find((t) => t.name === 'project')?.columns.map((c) => c.name) ?? []
    expect(project).not.toContain('time_spent')
  })

  it('classes the names typed by members in the catalogue as inputs, and the rest as not', () => {
    const notInRegister = R6B_INPUTS.filter(([table, column]) => !inRegister(table, column)).map(
      ([table, column]) => `${table}.${column}`,
    )
    expect(notInRegister).toEqual([])
    // Un « Autre » est copié au signalement d'un projet avec ses outils (champ « tools »), et le
    // nom tapé sur un profil avec ses outils favoris (« favoriteTools »), comme avant R6b.
    expect(MEMBER_INPUTS).toContainEqual(
      expect.objectContaining({ object: 'project', table: 'tool', column: 'name', field: 'tools' }),
    )
    expect(MEMBER_INPUTS).toContainEqual(
      expect.objectContaining({
        object: 'project',
        table: 'project_tool',
        column: 'label',
        field: 'tools',
        snapshot: true,
        export: true,
      }),
    )
    expect(MEMBER_INPUTS).toContainEqual(
      expect.objectContaining({
        object: 'member',
        table: 'profile_tool',
        column: 'label',
        field: 'favoriteTools',
        snapshot: true,
        export: true,
      }),
    )
    // Le journal n'est ni copié ni exporté : l'« Autre » rattaché n'a plus d'auteur (décision 5).
    expect(MEMBER_INPUTS).toContainEqual(
      expect.objectContaining({
        table: 'catalogue_change',
        column: 'merged_name',
        snapshot: false,
        export: false,
      }),
    )
    // Toutes les autres colonnes de R6b : « pas une saisie », avec leur raison.
    const wrong = Object.entries(SLICE_R6B).flatMap(([table, columns]) =>
      columns
        .filter((column) => !R6B_INPUTS.some(([t, c]) => t === table && c === column))
        .filter((column) => inRegister(table, column) || !notAnInput(table, column))
        .map((column) => `${table}.${column}`),
    )
    expect(wrong).toEqual([])
  })

  it('classes every column of every table', () => {
    const unclassified = tables.flatMap((table) =>
      table.columns
        .filter(
          (column) => !inRegister(table.name, column.name) && !notAnInput(table.name, column.name),
        )
        .map((column) => `${table.name}.${column.name}`),
    )

    expect(unclassified.join('\n')).toBe('')
  })

  it('never classes a column twice', () => {
    const both = MEMBER_INPUTS.filter((input) => {
      const entry = NOT_MEMBER_INPUTS[input.table]
      return entry === '*' || (entry !== undefined && Object.hasOwn(entry, input.column))
    }).map((input) => `${input.table}.${input.column}`)

    expect(both).toEqual([])
  })

  it('names only tables and columns that exist', () => {
    const exists = (table: string, column?: string) =>
      tables.some(
        (t) =>
          t.name === table && (column === undefined || t.columns.some((c) => c.name === column)),
      )

    const missing = [
      ...MEMBER_INPUTS.filter((input) => !exists(input.table, input.column)).map(
        (input) => `${input.table}.${input.column}`,
      ),
      ...Object.entries(NOT_MEMBER_INPUTS).flatMap(([table, entry]) =>
        entry === '*'
          ? exists(table)
            ? []
            : [table]
          : Object.keys(entry)
              .filter((column) => !exists(table, column))
              .map((column) => `${table}.${column}`),
      ),
    ]

    expect(missing.join('\n')).toBe('')
  })

  // Règle 19 : « pas une saisie » n'est permis à une colonne de texte, JSON ou tableau qu'avec une
  // raison écrite ; une table entière (« * ») n'a ni JSON ni tableau.
  it('gives a written reason for every text, JSON or array column that is not an input', () => {
    const unexplained = tables.flatMap((table) => {
      const entry = NOT_MEMBER_INPUTS[table.name]
      if (entry === undefined) return []
      return table.columns
        .filter((column) => isFreeType(column.type))
        .filter((column) =>
          entry === '*'
            ? column.type.startsWith('json') || column.type.endsWith('[]')
            : Object.hasOwn(entry, column.name) && (entry[column.name] ?? '').trim().length < 10,
        )
        .map((column) => `${table.name}.${column.name}`)
    })

    expect(unexplained).toEqual([])
  })

  it('counts the details of a report as an input, shown to the moderation only', () => {
    expect(MEMBER_INPUTS).toContainEqual(
      expect.objectContaining({
        table: 'content_report',
        column: 'details',
        snapshot: false,
        export: true,
      }),
    )
  })

  it('names every field of a copy as the contract does', () => {
    // Chaque champ copié a un nom (sauf la précision d'un signalement, jamais copiée).
    for (const input of MEMBER_INPUTS) {
      expect(input.field === null, `${input.table}.${input.column}`).toBe(!input.snapshot)
    }
  })
})

// ─── La couverture : copie, export, blocage ──────────────────────────────────────────────────────

/**
 * Une valeur témoin par champ du registre (objet.table.colonne), unique dans toute la base : la
 * retrouver dans une réponse prouve que ce champ-là y est. Un champ ajouté au registre sans témoin
 * fait échouer le test (« no witness »).
 */
const WITNESSES: Record<string, string> = {
  'member.user.name': 'Inès Nomtémoin',
  'member.member_handle.handle': 'ines_temoin',
  'member.profile.bio': 'Biographie témoin, unique.',
  'member.profile.favorite_tools': 'OutilFavoriTémoin',
  'project.project.title': 'Titre témoin',
  'project.project.pitch': 'Pitch témoin, unique.',
  'project.project.description': 'Description témoin, unique.',
  'project.project.prompts': 'Prompt témoin, unique.',
  'project.project.tools': 'OutilProjetTémoin',
  // R6b : le nom tapé devient un « Autre » (tool.name) et reste sur le projet (project_tool.label),
  // comme sur le profil (profile_tool.label). Le nom d'un « Autre » rattaché, gardé au journal,
  // n'est ni copié ni exporté : son témoin ne sert qu'à prouver qu'il en a un.
  'project.tool.name': 'OutilProjetTémoin',
  'project.project_tool.label': 'OutilProjetTémoin',
  'member.profile_tool.label': 'OutilFavoriTémoin',
  'project.catalogue_change.merged_name': 'NomRattachéTémoin',
  'project.project.demo_url': 'https://demo-temoin.dev/app',
  // R6a : la description d'une photo, écrite par PATCH /v1/projects/{id}/visuals/{visualId}.
  'project.project_media.description': 'Légende de photo témoin, unique.',
  'note.project_note.body': 'Note témoin, unique.',
  'comment.project_comment.body': 'Commentaire témoin, unique.',
  'report.content_report.details': 'Précision témoin, unique.',
}
const keyOf = (input: MemberInput) => `${input.object}.${input.table}.${input.column}`
const witnessOf = (input: MemberInput) => {
  const witness = WITNESSES[keyOf(input)]
  if (witness === undefined) throw new Error(`no witness for ${keyOf(input)}`)
  return witness
}

/** L'objet du registre et la sorte de cible signalée qui le porte. */
const REPORTED_AS: Partial<Record<InputObject, 'member' | 'project' | 'note' | 'comment'>> = {
  member: 'member',
  project: 'project',
  note: 'note',
  comment: 'comment',
}

describe('every field of the register', () => {
  let ctx: TestContext
  let act: ReturnType<typeof activity>
  let ines: string
  let malik: string
  let zoe: string
  let inesId: string
  let projectId: string
  let zoeProjectId: string
  let noteId: string
  let commentId: string
  /** Les signalements de Malik, par sorte de cible. */
  const reportIds: Record<string, string> = {}

  const SECOND = 1000
  const later = () => vi.setSystemTime(Date.now() + SECOND)

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'))
    ctx = await createTestContext()
    act = activity(ctx)
    ines = await ctx.verifiedMember({
      name: 'Inès',
      email: 'ines@example.com',
      password: 'ines-long-password',
    })
    malik = await ctx.verifiedMember({
      name: 'Malik',
      email: 'malik@example.com',
      password: 'malik-long-password',
    })
    zoe = await ctx.verifiedMember({
      name: 'Zoé',
      email: 'zoe@example.com',
      password: 'zoe-long-password',
    })
    inesId = (await act.me(ines)).id

    // Inès remplit tout ce qu'un membre peut saisir.
    await act.updateProfile(ines, {
      name: WITNESSES['member.user.name'],
      handle: WITNESSES['member.member_handle.handle'],
      bio: WITNESSES['member.profile.bio'],
      favoriteTools: [WITNESSES['member.profile.favorite_tools']],
    })
    const avatar = await ctx.request('/v1/me/avatar', {
      method: 'POST',
      headers: { cookie: ines },
      body: avatarForm(await jpegImage(64, 64)),
    })
    expect(avatar.status).toBe(200)
    const project = await act.publish(ines, WITNESSES['project.project.title'] ?? '', {
      pitch: WITNESSES['project.project.pitch'],
      description: WITNESSES['project.project.description'],
      prompts: [WITNESSES['project.project.prompts']],
      tools: [WITNESSES['project.project.tools']],
      demoUrl: WITNESSES['project.project.demo_url'],
    })
    projectId = project.id
    // Les identifiants des photos, dans l'ordre de la page, relus après chaque envoi.
    let visualIds: string[] = []
    for (const color of ['#7a9e3b', '#3b7a9e']) {
      later()
      const res = await ctx.request(`/v1/projects/${projectId}/visuals`, {
        method: 'POST',
        headers: { cookie: ines },
        body: visualForm(await jpegImage(800, 600, color), 'gallery'),
      })
      expect(res.status).toBe(201)
      visualIds = Project.parse(await res.json()).visuals.map((visual) => visual.id)
    }
    // R6a : Inès décrit sa première photo (la seconde reste sans description).
    later()
    const described = await act.send(
      'PATCH',
      `/v1/projects/${projectId}/visuals/${visualIds[0] ?? ''}`,
      ines,
      { description: WITNESSES['project.project_media.description'] },
    )
    expect(described.status).toBe(200)
    later()
    const note = await act.send('POST', `/v1/projects/${projectId}/notes`, ines, {
      body: WITNESSES['note.project_note.body'],
    })
    expect(note.status).toBe(201)
    noteId = ((await note.json()) as { id: string }).id
    // Le commentaire d'Inès est chez Zoé : le blocage le cache dans un fil qui n'est pas le sien.
    zoeProjectId = (await act.publish(zoe, 'Recettes')).id
    later()
    commentId = (
      await act.comment(zoeProjectId, ines, WITNESSES['comment.project_comment.body'] ?? '')
    ).id
  })

  afterEach(async () => {
    await ctx.close()
    vi.useRealTimers()
  })

  /** Malik signale le profil, le projet, la note et le commentaire d'Inès. */
  const reportEverything = async () => {
    const targets = { member: inesId, project: projectId, note: noteId, comment: commentId }
    for (const [kind, id] of Object.entries(targets)) {
      later()
      const report = await act.report(
        malik,
        { kind: kind as 'member', id },
        'other',
        kind === 'project' ? WITNESSES['report.content_report.details'] : undefined,
      )
      reportIds[kind] = report.id
    }
  }

  const snapshotOf = async (kind: string) => {
    const [row] = await ctx.db
      .select({ snapshot: schema.contentReport.snapshot })
      .from(schema.contentReport)
      .where(eq(schema.contentReport.id, reportIds[kind] ?? ''))
    return ReportSnapshot.parse(row?.snapshot)
  }

  const exportOf = async (cookie: string) => {
    const res = await act.send('GET', '/v1/me/export', cookie)
    expect(res.status).toBe(200)
    return res.text()
  }

  it('has a witness for every field, and an object that can be reported or is a report', () => {
    for (const input of MEMBER_INPUTS) {
      if (input.kind !== 'image') expect(() => witnessOf(input)).not.toThrow()
      expect(input.object === 'report' || REPORTED_AS[input.object] !== undefined).toBe(true)
    }
  })

  it('copies every text of the register when its object is reported', async () => {
    await reportEverything()

    for (const input of MEMBER_INPUTS.filter((i) => i.snapshot && i.kind !== 'image')) {
      const snapshot = await snapshotOf(REPORTED_AS[input.object] ?? '')
      const values = snapshot.filter((entry) => entry.field === input.field).map((e) => e.value)
      expect(values.join('\n'), keyOf(input)).toContain(witnessOf(input))
    }
  })

  // Règle 15 : la copie garde la clé de chaque image, jamais le fichier.
  it('copies the key of every image, and never adds a file to the storage', async () => {
    const filesBefore = [...ctx.storage.files.keys()].sort()
    await reportEverything()

    expect([...ctx.storage.files.keys()].sort()).toEqual(filesBefore)
    const [profile] = await ctx.db
      .select({ key: schema.profile.avatarKey })
      .from(schema.profile)
      .where(eq(schema.profile.userId, inesId))
    const member = await snapshotOf('member')
    expect(member.filter((e) => e.field === 'avatar').map((e) => e.value)).toEqual([profile?.key])
    const media = await ctx.db
      .select({ key: schema.projectMedia.storageKey })
      .from(schema.projectMedia)
      .where(eq(schema.projectMedia.projectId, projectId))
    expect(media).toHaveLength(2)
    const project = await snapshotOf('project')
    const imageValues = project
      .filter((e) => e.field === 'cover' || e.field === 'photo')
      .map((e) => e.value)
      .sort()
    expect(imageValues).toEqual(media.map((m) => m.key).sort())
  })

  // jur-J13 (R6a) : la copie dit quelle photo est décrite. Sa description suit, dans la copie,
  // l'entrée de l'image qu'elle décrit (décision de la session du 9/11/2026, forme `{ field, value }`
  // du contrat inchangée) ; une photo sans description n'en a pas.
  it('puts the description of a photo right after the key of that photo in the copy', async () => {
    await reportEverything()

    const media = await ctx.db
      .select({ key: schema.projectMedia.storageKey })
      .from(schema.projectMedia)
      .where(eq(schema.projectMedia.projectId, projectId))
      .orderBy(asc(schema.projectMedia.position))
    const project = await snapshotOf('project')
    const images = project.filter((e) => ['cover', 'photo', 'photoDescription'].includes(e.field))
    expect(images).toEqual([
      { field: 'cover', value: media[0]?.key },
      { field: 'photoDescription', value: WITNESSES['project.project_media.description'] },
      { field: 'photo', value: media[1]?.key },
    ])
  })

  it("puts every field in its author's export, never in the export of who reports", async () => {
    await reportEverything()
    const inesExport = await exportOf(ines)
    const malikExport = await exportOf(malik)

    for (const input of MEMBER_INPUTS.filter((i) => i.export)) {
      const witness = witnessOf(input)
      // La précision d'un signalement est saisie par Malik : elle est dans son export à lui.
      const [author, other] =
        input.object === 'report' ? [malikExport, inesExport] : [inesExport, malikExport]
      expect(author, `${keyOf(input)} in the export of its author`).toContain(witness)
      expect(other, `${keyOf(input)} out of the other export`).not.toContain(witness)
    }
  })

  it('hides every object of the register from a member blocked by its author', async () => {
    const images = [
      ...(
        await ctx.db.select({ key: schema.projectMedia.storageKey }).from(schema.projectMedia)
      ).map((m) => m.key),
    ]
    await act.block((await act.me(malik)).id, ines)

    /** Les lectures où chaque objet apparaîtrait. */
    const readers: Record<string, string[]> = {
      member: [
        `/v1/members/${inesId}`,
        `/v1/members/mentionable?${new URLSearchParams({ q: 'ines', projectId: zoeProjectId })}`,
      ],
      project: [`/v1/projects/${projectId}`, '/v1/feed/discover'],
      note: [`/v1/projects/${projectId}`, '/v1/feed/discover'],
      comment: [`/v1/projects/${zoeProjectId}/comments`],
    }
    for (const object of new Set(MEMBER_INPUTS.map((i) => i.object))) {
      if (object === 'report') continue
      const paths = readers[object]
      expect(paths, `a read for ${object}`).toBeDefined()
      const texts = await Promise.all(
        (paths ?? []).map(async (path) => (await act.send('GET', path, malik)).text()),
      )
      for (const input of MEMBER_INPUTS.filter((i) => i.object === object && i.kind !== 'image')) {
        for (const text of texts) expect(text, keyOf(input)).not.toContain(witnessOf(input))
      }
      for (const text of texts) for (const key of images) expect(text).not.toContain(key)
    }
    // Témoin : Zoé lit encore le commentaire d'Inès et son projet.
    const zoeComments = await (
      await act.send('GET', `/v1/projects/${zoeProjectId}/comments`, zoe)
    ).text()
    expect(zoeComments).toContain(WITNESSES['comment.project_comment.body'])
    expect((await act.send('GET', `/v1/projects/${projectId}`, zoe)).status).toBe(200)
  })
})

// ─── R6b : les outils lus par les tables du catalogue ────────────────────────────────────────────

// Décisions 6 et 14 du plan R6b : l'export et la copie d'un signalement lisent les outils dans
// project_tool et profile_tool, avec le nom que CE membre a tapé pour un « Autre » (et le nom du
// catalogue pour un outil du catalogue). Les anciennes colonnes (project.tools, profile.favorite_tools)
// sont encore écrites jusqu'en R7, mais plus jamais lues : le test y met un texte qui ne doit sortir
// nulle part. Zoé tape la première « TEACHABLE machine » : c'est le nom partagé de l'« Autre » ;
// Inès tape « teachable MACHINE », et c'est son écriture à elle qui la suit.
describe('the tools of a member, read from the catalogue tables', () => {
  let ctx: TestContext
  let act: ReturnType<typeof activity>
  let ines: string
  let malik: string
  let zoe: string
  let inesId: string

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'))
    ctx = await createTestContext()
    act = activity(ctx)
    ines = await ctx.verifiedMember({
      name: 'Inès',
      email: 'ines@example.com',
      password: 'ines-long-password',
    })
    malik = await ctx.verifiedMember({
      name: 'Malik',
      email: 'malik@example.com',
      password: 'malik-long-password',
    })
    zoe = await ctx.verifiedMember({
      name: 'Zoé',
      email: 'zoe@example.com',
      password: 'zoe-long-password',
    })
    inesId = (await act.me(ines)).id
    await clearCatalogue(ctx.db)
    await addCatalogueTool(ctx.db, { name: 'Claude', family: 'assistant' })
    await act.publish(zoe, 'Tri des déchets', { tools: ['TEACHABLE machine'] })
    vi.setSystemTime(Date.now() + 1000)
    await act.updateProfile(ines, { favoriteTools: ['claude', 'teachable MACHINE'] })
    await act.publish(ines, 'Mon chat qui parle', { tools: ['CLAUDE', 'teachable MACHINE'] })
    // Les anciennes colonnes reçoivent un texte qui ne doit plus jamais être lu.
    await ctx.db.execute(sql`update project set tools = array['AncienneColonne']`)
    await ctx.db.execute(sql`update profile set favorite_tools = array['AncienneColonne']`)
  })

  afterEach(async () => {
    await ctx.close()
    vi.useRealTimers()
  })

  it("exports the member's favourite tools, project tools and the names he typed", async () => {
    const res = await act.send('GET', '/v1/me/export', ines)
    expect(res.status).toBe(200)
    const raw = await res.text()
    const data = AccountExport.parse(JSON.parse(raw))

    expect(data.user.favoriteTools).toEqual(['Claude', 'teachable MACHINE'])
    expect(data.projects.map((project) => project.tools)).toEqual([
      [
        { label: 'Claude', slug: 'claude', inCatalogue: true },
        expect.objectContaining({ label: 'teachable MACHINE', inCatalogue: false }),
      ],
    ])
    for (const leak of ['AncienneColonne', 'TEACHABLE machine']) {
      expect(raw, leak).not.toContain(leak)
    }
  })

  it('copies the favourite tools of a reported profile from profile_tool', async () => {
    const report = await act.report(malik, { kind: 'member', id: inesId })

    const [row] = await ctx.db
      .select({ snapshot: schema.contentReport.snapshot })
      .from(schema.contentReport)
      .where(eq(schema.contentReport.id, report.id))
    const copied = ReportSnapshot.parse(row?.snapshot)
      .filter((entry) => entry.field === 'favoriteTools')
      .map((entry) => entry.value)
      .join('\n')

    expect(copied).toContain('Claude')
    expect(copied).toContain('teachable MACHINE')
    expect(copied).not.toContain('AncienneColonne')
    expect(copied).not.toContain('TEACHABLE machine')
  })
})
