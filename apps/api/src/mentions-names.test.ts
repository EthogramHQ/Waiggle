// Tests d'intégration de R5b côté API : le nom des membres mentionnés (la pastille « @Léa Moreau »
// l'affiche, et il suit la personne si elle en change), le pseudo actuel de l'auteur d'un
// commentaire (« Répondre » sous une réponse préremplit sa mention), et les suggestions après « @ »
// qui cherchent aussi dans les noms, sans tenir compte des accents ni des majuscules. Scénario :
// docs/scenarios/refonte.md, « R5b — Les commentaires », « Les mentions » ; relecture du plan
// (sec-B1, sec-A1, sec-A6 et D2, jur-P5, jur-P8). Les mentions elles-mêmes (écrire, garder par
// identifiant, pseudo changé) sont testées dans mentions.test.ts.
//
// Trois membres inscrits, comme dans mentions.test.ts : Inès (autrice du projet « Météo », pseudo
// ines_morel), Malik (qui commente et cherche, pseudo malik) et Zoé (pseudo zoe). Les autres membres
// sont rangés directement dans la base : plus rapide, et l'inscription est limitée par adresse IP.
// Le temps est maîtrisé par le test (fausse horloge), pour que chaque geste ait sa propre date.
import { randomUUID } from 'node:crypto'
import {
  Comment,
  CommentPage,
  CommentReply,
  ErrorResponse,
  MentionableList,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { avatarForm, jpegImage } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookies de session
let malik: string
let zoe: string
let inesId: string
let malikId: string
let zoeId: string

const SECOND = 1000

const inesAccount = {
  name: 'Inès Morel',
  email: 'ines@example.com',
  password: 'ines-long-password',
}
const malikAccount = { name: 'Malik', email: 'malik@example.com', password: 'malik-long-password' }
const zoeAccount = { name: 'Zoé', email: 'zoe@example.com', password: 'zoe-long-password' }

beforeEach(async () => {
  // La fausse horloge est posée avant de créer l'API : la limite de débit garde la fonction
  // Date.now qu'elle trouve à ce moment-là (voir feed.test.ts).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'))

  ctx = await createTestContext()
  act = activity(ctx)
  ines = await ctx.verifiedMember(inesAccount)
  malik = await ctx.verifiedMember(malikAccount)
  zoe = await ctx.verifiedMember(zoeAccount)
  inesId = (await act.me(ines)).id
  malikId = (await act.me(malik)).id
  zoeId = (await act.me(zoe)).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge d'une seconde : assez pour que les dates diffèrent. */
const later = () => vi.setSystemTime(Date.now() + SECOND)

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

const publish = async (cookie: string, title = 'Météo') => {
  later()
  return act.publish(cookie, title)
}

/**
 * Publie un commentaire (une réponse si `replyTo` est donné) et le renvoie tel que l'API l'a décrit.
 * Le statut est vérifié ici : tant que l'API n'écrit pas le nom des mentions ni le pseudo de
 * l'auteur, sa réponse ne passe pas le contrat et elle répond 500.
 */
const comment = async (projectId: string, cookie: string, body: string, replyTo?: string) => {
  later()
  const res = await act.send(
    'POST',
    `/v1/projects/${projectId}/comments`,
    cookie,
    replyTo === undefined ? { body } : { body, replyTo },
  )
  expect(res.status).toBe(201)
  return Comment.parse(await res.json())
}

/** Ce qu'un membre lit des commentaires d'un projet : le texte brut, et les fils. */
const readComments = async (projectId: string, cookie: string) => {
  const res = await act.send('GET', `/v1/projects/${projectId}/comments`, cookie)
  expect(res.status).toBe(200)
  const text = await res.text()
  return { text, items: CommentPage.parse(JSON.parse(text)).items }
}

/** Change son nom ou son pseudo (PATCH /v1/me), à une date à part. */
const updateProfile = async (cookie: string, body: { name?: string; handle?: string }) => {
  later()
  await act.updateProfile(cookie, body)
}

/**
 * Range directement un membre dans la base, avec son nom et son pseudo. Vérifié par défaut ; son
 * identifiant est `id-<pseudo>`.
 */
const insertMember = async (handle: string, name: string, { verified = true } = {}) => {
  const id = `id-${handle}`
  await ctx.db.insert(schema.user).values({
    id,
    name,
    email: `${handle}@example.com`,
    emailVerified: verified,
  })
  await ctx.db.insert(schema.memberHandle).values({ handle, userId: id, claimedAt: new Date() })
  return id
}

/** Malik suit ce membre : un proche pour lui, sur tous les projets. */
const follow = async (cookie: string, memberId: string) => {
  later()
  await act.followMember(memberId, cookie)
}

const mentionable = (cookie: string | null, q: string, projectId: string) =>
  act.send('GET', `/v1/members/mentionable?${new URLSearchParams({ q, projectId })}`, cookie)

/** Les pseudos proposés à ce membre, dans l'ordre de la réponse (la demande doit réussir). */
const proposed = async (cookie: string, q: string, projectId: string) => {
  const res = await mentionable(cookie, q, projectId)
  expect(res.status, q).toBe(200)
  return MentionableList.parse(await res.json()).members.map((m) => m.handle)
}

// ─── Le nom des membres mentionnés ──────────────────────────────────────────────────────────────

describe('the name of a mentioned member', () => {
  it('gives the current name with each mention, and follows a change of name', async () => {
    const meteo = await publish(ines)

    const published = await comment(meteo.id, malik, 'Merci @ines_morel et @zoe !')

    expect(published.mentions).toEqual([
      { handle: 'ines_morel', memberId: inesId, name: 'Inès Morel' },
      { handle: 'zoe', memberId: zoeId, name: 'Zoé' },
    ])

    // Inès change de nom : la pastille la suit, le pseudo écrit et le lien ne bougent pas.
    await updateProfile(ines, { name: 'Inès Durand' })

    const { items } = await readComments(meteo.id, zoe)
    expect(items[0]?.mentions).toEqual([
      { handle: 'ines_morel', memberId: inesId, name: 'Inès Durand' },
      { handle: 'zoe', memberId: zoeId, name: 'Zoé' },
    ])
  })

  it('gives the name with the mentions of a reply, and in the answer to an edit', async () => {
    const meteo = await publish(ines)
    const root = await comment(meteo.id, malik, 'Super idée.')
    const reply = await comment(meteo.id, zoe, 'Bien vu @malik', root.id)

    expect(reply.mentions).toEqual([{ handle: 'malik', memberId: malikId, name: 'Malik' }])

    // La réponse de la modification porte la pastille sans rechargement.
    later()
    const res = await act.send('PATCH', `/v1/projects/${meteo.id}/comments/${reply.id}`, zoe, {
      body: 'Bien vu @malik et @ines_morel',
    })
    expect(res.status).toBe(200)
    expect(CommentReply.parse(await res.json()).mentions).toEqual([
      { handle: 'malik', memberId: malikId, name: 'Malik' },
      { handle: 'ines_morel', memberId: inesId, name: 'Inès Morel' },
    ])
  })

  it('gives neither link nor name of a mentioned member blocked with the reader, either way', async () => {
    const meteo = await publish(ines)
    await comment(meteo.id, malik, 'Tu as vu, @zoe ?')

    // Inès bloque Zoé : pour Inès, « @zoe » redevient du texte, et le nom de Zoé ne sort pas.
    later()
    await act.block(zoeId, ines)
    let read = await readComments(meteo.id, ines)
    expect(read.items[0]).toMatchObject({ body: 'Tu as vu, @zoe ?', mentions: [] })
    expect(read.text).not.toContain('"name":"Zoé"')

    // L'autre sens : c'est Zoé qui bloque Inès.
    later()
    await act.unblock(zoeId, ines)
    later()
    await act.block(inesId, zoe)
    read = await readComments(meteo.id, ines)
    expect(read.items[0]).toMatchObject({ body: 'Tu as vu, @zoe ?', mentions: [] })
    expect(read.text).not.toContain('"name":"Zoé"')

    // Témoin : Malik, qui n'est bloqué avec personne, lit la pastille et son nom.
    expect((await readComments(meteo.id, malik)).items[0]?.mentions).toEqual([
      { handle: 'zoe', memberId: zoeId, name: 'Zoé' },
    ])
  })
})

// ─── Le pseudo de l'auteur d'un commentaire ─────────────────────────────────────────────────────

describe('the handle of the author of a comment', () => {
  it('gives the current handle of the author of a root and of a reply, and follows a change', async () => {
    const meteo = await publish(ines)
    const root = await comment(meteo.id, malik, 'Super idée.')
    const reply = await comment(meteo.id, zoe, 'Bien vu.', root.id)

    expect(root.author).toEqual({ id: malikId, name: 'Malik', handle: 'malik', avatarUrl: null })
    expect(reply.author?.handle).toBe('zoe')

    // Le pseudo actuel, pas celui du jour de l'écriture.
    await updateProfile(malik, { handle: 'malik_b' })

    const [thread] = (await readComments(meteo.id, ines)).items
    expect(thread?.author).toEqual({
      id: malikId,
      name: 'Malik',
      handle: 'malik_b',
      avatarUrl: null,
    })
    expect(thread?.replies[0]?.author).toEqual({
      id: zoeId,
      name: 'Zoé',
      handle: 'zoe',
      avatarUrl: null,
    })
  })

  it('gives nothing of the author in the place of a deleted comment', async () => {
    const meteo = await publish(ines)
    const root = await comment(meteo.id, malik, 'Un avis.')
    await comment(meteo.id, zoe, 'Une réponse.', root.id) // sa place reste dans la liste
    later()
    await act.deleteComment(meteo.id, root.id, malik)

    const { text, items } = await readComments(meteo.id, ines)

    expect(items[0]).toMatchObject({ id: root.id, state: 'deleted', author: null, body: '' })
    expect(text).not.toContain('"handle":"malik"')
    expect(text).not.toContain('"name":"Malik"')
    // Témoin : la réponse, elle, porte le pseudo de Zoé.
    expect(items[0]?.replies[0]?.author?.handle).toBe('zoe')
  })

  // Relecture du plan, sec-B1 / jur-P5 (bloquant) : sous un blocage, l'auteur garde son nom, mais
  // ni sa photo ni son pseudo (rien qui mène à son profil, rien à préremplir en mention).
  it('keeps the name but never the handle nor the picture of an author read despite a block (rules 1 and 2, both directions)', async () => {
    // Malik a une photo et un pseudo reconnaissable, pour les chercher dans le texte brut.
    await updateProfile(malik, { handle: 'malik_b' })
    const upload = await ctx.request('/v1/me/avatar', {
      method: 'POST',
      headers: { cookie: malik },
      body: avatarForm(await jpegImage(64, 64)),
    })
    expect(upload.status).toBe(200)
    const photo = (await act.me(malik)).avatarUrl ?? 'no avatar'
    const meteo = await publish(ines, 'Météo')
    const recettes = await publish(zoe, 'Recettes')
    // Règle 1 : un commentaire de Malik chez Inès ; règle 2 : un commentaire de Malik chez Zoé qui
    // mentionne Inès.
    const atInes = await comment(meteo.id, malik, 'Un commentaire chez Inès')
    const mention = await comment(recettes.id, malik, 'Tu as vu, @ines_morel ?')
    later()
    await act.block(inesId, malik) // Malik bloque Inès

    const blockedAuthor = { id: malikId, name: 'Malik', handle: null, avatarUrl: null }
    for (const [projectId, commentId] of [
      [meteo.id, atInes.id],
      [recettes.id, mention.id],
    ] as const) {
      const { text, items } = await readComments(projectId, ines)
      expect(
        items.map((item) => [item.id, item.author]),
        projectId,
      ).toEqual([[commentId, blockedAuthor]])
      expect(text, projectId).not.toContain('malik_b')
      expect(text, projectId).not.toContain(photo)
    }

    // L'autre sens de la règle 1 : c'est Inès, l'autrice du projet, qui bloque Malik.
    later()
    await act.unblock(inesId, malik)
    later()
    await act.block(malikId, ines)
    const { text, items } = await readComments(meteo.id, ines)
    expect(items.map((item) => item.author)).toEqual([blockedAuthor])
    expect(text).not.toContain('malik_b')
    expect(text).not.toContain(photo)

    // Témoin : Zoé, qui n'a bloqué personne, lit le pseudo et la photo de Malik chez elle.
    const seen = await readComments(recettes.id, zoe)
    expect(seen.items[0]?.author).toEqual({
      id: malikId,
      name: 'Malik',
      handle: 'malik_b',
      avatarUrl: photo,
    })
  })

  it('gives no author handle for a comment read despite a block', async () => {
    const meteo = await publish(ines)
    const root = await comment(meteo.id, zoe, 'Une question.')
    await comment(meteo.id, malik, 'Une réponse de Malik.', root.id)
    await comment(meteo.id, malik, 'Un commentaire de Malik.')
    later()
    await act.block(malikId, ines) // Inès, autrice du projet, bloque Malik

    // Inès lit encore chez elle les commentaires de Malik (règle 1), racine comme réponse.
    const { items } = await readComments(meteo.id, ines)
    const authors = [
      ...items.map((item) => item.author),
      ...items.flatMap((item) => item.replies.map((reply) => reply.author)),
    ].filter((author) => author?.id === malikId)
    expect(authors).toEqual([
      { id: malikId, name: 'Malik', handle: null, avatarUrl: null },
      { id: malikId, name: 'Malik', handle: null, avatarUrl: null },
    ])

    // Témoin : Zoé lit le pseudo de Malik, racine comme réponse.
    const seen = (await readComments(meteo.id, zoe)).items
    const seenHandles = [
      ...seen.map((item) => item.author),
      ...seen.flatMap((item) => item.replies.map((reply) => reply.author)),
    ]
      .filter((author) => author?.id === malikId)
      .map((author) => author?.handle)
    expect(seenHandles).toEqual(['malik', 'malik'])
  })
})

// ─── Les suggestions après « @ », par le nom ────────────────────────────────────────────────────

describe('the members proposed after « @ », by the name', () => {
  it('finds by « @Lé » the start of a name, a word of a name and a handle, without accents nor capitals', async () => {
    // Léa Moreau, autrice du projet, a un pseudo qui ne commence pas par « le » : trouvée par son
    // nom. Hugo Lefèvre, que Malik suit, par un mot de son nom. Sam Petit, suivi aussi, par son
    // pseudo seul. Tous trois sont des proches : sous 3 caractères, seuls les proches sortent.
    const lea = await ctx.verifiedMember({
      name: 'Léa Moreau',
      email: 'lea@example.com',
      password: 'lea-long-password',
    })
    await updateProfile(lea, { handle: 'moreau' })
    const project = await publish(lea, 'Potager')
    await follow(malik, await insertMember('hugo_l', 'Hugo Lefèvre'))
    await follow(malik, await insertMember('lea_m', 'Sam Petit'))

    const res = await mentionable(malik, '@Lé', project.id)

    expect(res.status).toBe(200)
    const raw = await res.text()
    const { members } = MentionableList.parse(JSON.parse(raw))
    expect(members.map((m) => m.handle).sort()).toEqual(['hugo_l', 'lea_m', 'moreau'])
    expect(members.find((m) => m.handle === 'hugo_l')).toEqual({
      id: 'id-hugo_l',
      name: 'Hugo Lefèvre',
      handle: 'hugo_l',
      avatarUrl: null,
    })
    // Rien d'autre ne sort : ni adresse e-mail, ni date.
    expect(raw).not.toContain('@example.com')
    expect(raw).not.toContain('2026-')
  })

  // Relecture du plan, sec-A6, selon la décision D2 : un mot du nom commence au début du nom, ou
  // après une espace, un tiret ou une apostrophe (droite ou typographique).
  it("finds a word of the name after a space, a hyphen or an apostrophe: « Hugo Lefèvre » by « lef », « Jean-Pierre » by « pie », « O'Brien » by « bri »", async () => {
    const meteo = await publish(ines)
    await insertMember('hugo_l', 'Hugo Lefèvre')
    await insertMember('jp_martin', 'Jean-Pierre Martin')
    await insertMember('siobhan', "Siobhan O'Brien")
    await insertMember('marie_h', 'Marie L’Hôte')

    expect(await proposed(malik, 'lef', meteo.id)).toEqual(['hugo_l'])
    expect(await proposed(malik, 'pie', meteo.id)).toEqual(['jp_martin'])
    expect(await proposed(malik, 'bri', meteo.id)).toEqual(['siobhan'])
    expect(await proposed(malik, 'hot', meteo.id)).toEqual(['marie_h'])
    // Le début du nom aussi, avec ses accents et ses majuscules.
    expect(await proposed(malik, 'JEAN', meteo.id)).toEqual(['jp_martin'])
    // Jamais le milieu d'un mot.
    expect(await proposed(malik, 'efe', meteo.id)).toEqual([])
    expect(await proposed(malik, 'ierre', meteo.id)).toEqual([])
    expect(await proposed(malik, 'rien', meteo.id)).toEqual([])
  })

  // Relecture du plan, jur-P8 : sous 3 caractères, les proches seuls, par le nom comme par le pseudo.
  it('suggests only close members for a two-letter name start', async () => {
    const meteo = await publish(ines)
    await insertMember('durand', 'Léa Durand') // une inconnue pour Malik

    expect(await proposed(malik, 'le', meteo.id)).toEqual([])
    // Témoin : avec un caractère de plus, Léa est proposée.
    expect(await proposed(malik, 'lea', meteo.id)).toEqual(['durand'])
    // Témoin : une proche (l'autrice du projet) est trouvée par deux lettres d'un mot de son nom.
    expect(await proposed(malik, 'mo', meteo.id)).toEqual(['ines_morel'])
  })

  // R5b, sec-A1 : « 𐐀a » compte 2 caractères mais 3 unités UTF-16 ; il ne doit pas ouvrir la
  // recherche dans tout le réseau.
  it('searches only among close members for two characters outside the base plane', async () => {
    const meteo = await publish(ines)
    const deseret = String.fromCodePoint(0x10400)
    await insertMember('deseret_far', `${deseret}ab Loin`) // un inconnu pour Malik
    await follow(malik, await insertMember('deseret_near', `${deseret}ac Près`))

    // Deux caractères : les proches seulement.
    expect(await proposed(malik, `${deseret}a`, meteo.id)).toEqual(['deseret_near'])
    // Témoin : avec un troisième caractère, l'inconnu est trouvé.
    expect(await proposed(malik, `${deseret}ab`, meteo.id)).toEqual(['deseret_far'])
  })

  it('accepts a 30-character query made of characters outside the base plane', async () => {
    const meteo = await publish(ines)
    const res = await mentionable(malik, String.fromCodePoint(0x10400).repeat(30), meteo.id)
    expect(res.status).toBe(200)
    const tooLong = await mentionable(malik, String.fromCodePoint(0x10400).repeat(31), meteo.id)
    expect(tooLong.status).toBe(400)
  })

  // R5b, jur-J11 : un membre suspendu reste nommé et proposé (décision du scénario).
  it('keeps naming and suggesting a suspended member', async () => {
    const meteo = await publish(ines)
    // Zoé est suspendue, sans fin ni levée : la ligne que lit la suspension active (7c).
    await ctx.db.insert(schema.accountSuspension).values({
      id: randomUUID(),
      userId: zoeId,
      startsAt: new Date(),
      endsAt: null,
    })
    // Témoin : Zoé est bien proposée, nommée et prévenue comme avant sa suspension.
    expect(await proposed(malik, 'zoe', meteo.id)).toEqual(['zoe'])
    const published = await comment(meteo.id, malik, 'Merci @zoe !')
    expect(published.mentions.map((m) => m.name)).toEqual(['Zoé'])
    const { items } = await readComments(meteo.id, ines)
    expect(items[0]?.mentions.map((m) => m.name)).toEqual(['Zoé'])
  })

  it('never suggests a member found by name who is blocked either way', async () => {
    const recettes = await publish(zoe, 'Recettes')
    // Témoin : Malik trouve Inès par un mot de son nom (« Morel ») ; son pseudo, lui, commence par
    // « ines ».
    expect(await proposed(malik, 'mor', recettes.id)).toEqual(['ines_morel'])

    later()
    await act.block(malikId, ines) // Inès bloque Malik
    expect(await proposed(malik, 'mor', recettes.id)).toEqual([])
    expect(await proposed(malik, 'ines', recettes.id)).toEqual([])

    later()
    await act.unblock(malikId, ines)
    later()
    await act.block(inesId, malik) // l'autre sens : Malik bloque Inès
    expect(await proposed(malik, 'mor', recettes.id)).toEqual([])
    expect(await proposed(malik, 'ines', recettes.id)).toEqual([])
  })

  // Relecture du plan, sec-A1 : la recherche par le nom s'ajoute aux conditions d'aujourd'hui, qui
  // valent pour elle aussi.
  it('never proposes, by the name either, a member blocked in either direction, an unverified account, nor the viewer', async () => {
    const meteo = await publish(ines)
    // Zoé et Malik prennent des pseudos qui ne commencent pas par leur nom : la recherche ne les
    // trouve que par le nom.
    await updateProfile(zoe, { handle: 'zed' })
    await updateProfile(malik, { handle: 'mk_b' })
    await insertMember('ter_z', 'Zoé Ter', { verified: false })
    await insertMember('roux', 'Malo Roux')

    // Témoins : Zoé est trouvée par son nom, pas le compte non vérifié ; Malo par le début du sien.
    expect(await proposed(malik, 'zoe', meteo.id)).toEqual(['zed'])
    // Malik cherche son propre nom : jamais lui-même.
    expect(await proposed(malik, 'mal', meteo.id)).toEqual(['roux'])
    expect(await proposed(malik, 'malik', meteo.id)).toEqual([])

    later()
    await act.block(malikId, zoe) // Zoé bloque Malik
    expect(await proposed(malik, 'zoe', meteo.id)).toEqual([])

    later()
    await act.unblock(malikId, zoe)
    later()
    await act.block(zoeId, malik) // Malik bloque Zoé
    expect(await proposed(malik, 'zoe', meteo.id)).toEqual([])
  })

  it('proposes 5 members at most, by the name too', async () => {
    const meteo = await publish(ines)
    for (const handle of ['m_one', 'm_two', 'm_three', 'm_four', 'm_five', 'm_six']) {
      await insertMember(handle, `Louise ${handle.slice(2)}`)
    }

    // Aucun n'est un proche : par ordre alphabétique du pseudo, les 5 premiers.
    expect(await proposed(malik, 'lou', meteo.id)).toEqual([
      'm_five',
      'm_four',
      'm_one',
      'm_six',
      'm_three',
    ])
  })

  it('takes « % », « _ » and an apostrophe for plain characters, never for wildcards', async () => {
    const meteo = await publish(ines)
    await insertMember('bon', 'Lxa Bon')
    await insertMember('gris', 'Léa Gris')
    await insertMember('l_ab', 'Paul Blanc')

    // « l_a » ne trouve que le pseudo qui commence vraiment par « l_a » : en SQL, « _ » d'un
    // `like` vaudrait n'importe quelle lettre, et trouverait « Lxa » et « Léa ».
    expect(await proposed(malik, 'l_a', meteo.id)).toEqual(['l_ab'])
    // Témoin : les deux noms sont bien trouvés par leur vrai début.
    expect(await proposed(malik, 'lxa', meteo.id)).toEqual(['bon'])
    expect(await proposed(malik, 'lea', meteo.id)).toEqual(['gris'])
    // « % » et l'apostrophe ne sont pas des caractères d'un mot : la demande est refusée (contrat).
    for (const q of ['l%', 'le%', "o'b", 'o’b']) {
      await expectError(await mentionable(malik, q, meteo.id), 400, 'validation')
    }
  })

  it('ranks the close members first, then a handle found before a name found, then by handle', async () => {
    const meteo = await publish(ines)
    await follow(malik, await insertMember('zorro', 'Léane Zorro')) // une proche, trouvée par le nom
    await insertMember('moreau', 'Léa Moreau')
    await insertMember('lea_b', 'Bob Martin')
    await insertMember('abel', 'Léa Abel')

    expect(await proposed(malik, 'lea', meteo.id)).toEqual(['zorro', 'lea_b', 'abel', 'moreau'])
  })
})
