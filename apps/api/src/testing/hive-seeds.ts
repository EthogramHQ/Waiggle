// Prépare des ruches directement en base, pour les tests de R10 qui visent une seule route (une
// course, une suspension, un blocage, le nom) : la ruche, ses membres et ses invitations existent
// avant le geste essayé, sans dépendre des routes de création et d'invitation, testées ailleurs
// (hives.test.ts, hives.invitations.test.ts). Ainsi un test échoue sur sa propre règle, et non sur
// la préparation. Les lignes écrites ici sont celles que l'API écrirait : le créateur est l'animateur
// et le premier membre, il a écrit le nom (`name_set_by`). Rien ici n'est utilisé en production.
import { randomUUID } from 'node:crypto'
import type { HiveIcon } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { and, eq } from 'drizzle-orm'
import type { TestContext } from './context'

type Db = TestContext['db']

/**
 * Une ruche : `members` dans l'ordre d'entrée (le premier, le plus ancien, reprendrait l'animation),
 * l'animateur compris ou non (il est ajouté en tête s'il manque). Les dates d'entrée viennent de
 * l'horloge du test (fausse le plus souvent), une milliseconde d'écart entre deux membres.
 */
export const seedHive = async (
  db: Db,
  {
    name = 'Famille',
    icon = 'house-line',
    animatorId,
    members = [],
    invitePolicy = 'members',
  }: {
    name?: string
    icon?: HiveIcon
    animatorId: string
    members?: string[]
    invitePolicy?: 'members' | 'animator'
  },
) => {
  const id = randomUUID()
  const now = Date.now()
  await db.insert(schema.hive).values({
    id,
    name,
    icon,
    animatorId,
    nameSetBy: animatorId,
    createdBy: animatorId,
    invitePolicy,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  })
  const all = [animatorId, ...members.filter((member) => member !== animatorId)]
  await db.insert(schema.hiveMember).values(
    all.map((userId, rank) => ({
      hiveId: id,
      userId,
      invitedBy: rank === 0 ? null : animatorId,
      joinedAt: new Date(now + rank),
    })),
  )
  return id
}

/** Une invitation en attente (ou refusée, si `refusedAt`), datée de l'horloge du test. */
export const seedInvitation = async (
  db: Db,
  {
    hiveId,
    inviteeId,
    inviterId,
    refusedAt = null,
  }: { hiveId: string; inviteeId: string; inviterId: string | null; refusedAt?: Date | null },
) => {
  const id = randomUUID()
  await db.insert(schema.hiveInvitation).values({
    id,
    hiveId,
    inviteeId,
    inviterId,
    createdAt: new Date(),
    refusedAt,
  })
  return id
}

/**
 * Des comptes vérifiés écrits en base, sans session : de quoi remplir une ruche jusqu'à ses 50
 * places sans passer 50 fois par l'inscription (son quota par adresse IP le refuserait).
 */
export const seedBareMembers = async (db: Db, count: number, prefix = 'bare') => {
  const ids = Array.from({ length: count }, (_, i) => `${prefix}-member-${i}`)
  if (ids.length === 0) return ids
  await db.insert(schema.user).values(
    ids.map((id, i) => ({
      id,
      name: `Membre ${i}`,
      email: `${id}@example.com`,
      emailVerified: true,
    })),
  )
  return ids
}

/** Ajoute des membres à une ruche existante, après ceux qui y sont déjà. */
export const addMembers = async (db: Db, hiveId: string, userIds: string[]) => {
  if (userIds.length === 0) return
  const now = Date.now()
  await db
    .insert(schema.hiveMember)
    .values(userIds.map((userId, i) => ({ hiveId, userId, joinedAt: new Date(now + i) })))
}

/** La ligne de la ruche en base, ou null si elle n'existe plus. */
export const hiveRow = async (db: Db, hiveId: string) => {
  const [row] = await db.select().from(schema.hive).where(eq(schema.hive.id, hiveId))
  return row ?? null
}

/** Les identifiants des membres de la ruche, en base. */
export const memberIdsOf = async (db: Db, hiveId: string) =>
  (
    await db
      .select({ userId: schema.hiveMember.userId })
      .from(schema.hiveMember)
      .where(eq(schema.hiveMember.hiveId, hiveId))
  )
    .map((row) => row.userId)
    .sort()

/** Vrai si ce membre est dans cette ruche, en base. */
export const isMemberOf = async (db: Db, hiveId: string, userId: string) =>
  (
    await db
      .select({ userId: schema.hiveMember.userId })
      .from(schema.hiveMember)
      .where(and(eq(schema.hiveMember.hiveId, hiveId), eq(schema.hiveMember.userId, userId)))
  ).length === 1

/** L'invitation en base, ou null si elle n'existe plus. */
export const invitationRow = async (db: Db, invitationId: string) => {
  const [row] = await db
    .select()
    .from(schema.hiveInvitation)
    .where(eq(schema.hiveInvitation.id, invitationId))
  return row ?? null
}
