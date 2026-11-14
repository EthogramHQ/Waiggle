// Des ruches écrites directement dans leurs tables, pour les tests de R10 qui lisent les ruches
// (notifications, e-mails, récap, export, suppression du compte, modération) sans passer par les
// routes qui les créent : chaque test pose l'état exact dont il a besoin, dates comprises. Rien ici
// n'est utilisé en production.
//
// Les dates viennent de la fausse horloge (`new Date()`), jamais de `now()` en SQL : un test qui
// avance l'horloge range ainsi ses gestes dans l'ordre voulu.
import { randomUUID } from 'node:crypto'
import type { HiveIcon } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import type { TestContext } from './context'

type Member = { id: string; invitedBy?: string | null; joinedAt?: Date; seenAt?: Date | null }

export const hiveRows = (ctx: TestContext) => ({
  /**
   * Une ruche, son animateur et ses membres (l'animateur en premier, s'il n'est pas dans la liste).
   * `nameSetBy` : qui a écrit le nom (l'animateur par défaut) ; la modération vise ce membre.
   */
  create: async (input: {
    name: string
    animatorId: string | null
    members: Member[]
    icon?: HiveIcon
    nameSetBy?: string | null
    createdBy?: string | null
  }) => {
    const id = randomUUID()
    const now = new Date()
    await ctx.db.insert(schema.hive).values({
      id,
      name: input.name,
      icon: input.icon ?? 'heart',
      animatorId: input.animatorId,
      nameSetBy: input.nameSetBy === undefined ? input.animatorId : input.nameSetBy,
      createdBy: input.createdBy === undefined ? input.animatorId : input.createdBy,
      createdAt: now,
      updatedAt: now,
    })
    const members = [...input.members]
    if (input.animatorId && !members.some((m) => m.id === input.animatorId)) {
      members.unshift({ id: input.animatorId })
    }
    for (const member of members) {
      await ctx.db.insert(schema.hiveMember).values({
        hiveId: id,
        userId: member.id,
        invitedBy: member.invitedBy ?? null,
        joinedAt: member.joinedAt ?? now,
        seenAt: member.seenAt ?? null,
      })
    }
    return id
  },

  /** Un membre de plus dans la ruche (accepter une invitation, en base). */
  join: (hiveId: string, member: Member) =>
    ctx.db.insert(schema.hiveMember).values({
      hiveId,
      userId: member.id,
      invitedBy: member.invitedBy ?? null,
      joinedAt: member.joinedAt ?? new Date(),
      seenAt: member.seenAt ?? null,
    }),

  /** Une invitation, en attente par défaut ; `refusedAt` : refusée (elle reste jusqu'à 30 jours). */
  invite: async (input: {
    hiveId: string
    inviteeId: string
    inviterId: string | null
    createdAt?: Date
    refusedAt?: Date | null
  }) => {
    const id = randomUUID()
    await ctx.db.insert(schema.hiveInvitation).values({
      id,
      hiveId: input.hiveId,
      inviteeId: input.inviteeId,
      inviterId: input.inviterId,
      createdAt: input.createdAt ?? new Date(),
      refusedAt: input.refusedAt ?? null,
    })
    return id
  },

  /** Une trace gardée pour l'Activité (retiré, animation confiée, ruche supprimée). */
  notice: async (input: {
    recipientId: string
    kind: 'removed' | 'animator' | 'deleted'
    hiveId: string | null
    hiveName: string
    createdAt?: Date
  }) => {
    const id = randomUUID()
    await ctx.db.insert(schema.hiveNotice).values({
      id,
      recipientId: input.recipientId,
      kind: input.kind,
      hiveId: input.hiveId,
      hiveName: input.hiveName,
      createdAt: input.createdAt ?? new Date(),
    })
    return id
  },

  /** Réserve un projet déjà publié à une ruche (la visibilité « Une ruche » et sa ruche ensemble). */
  reserve: (projectId: string, hiveId: string) =>
    ctx.db
      .update(schema.project)
      .set({ visibility: 'hive', hiveId })
      .where(eq(schema.project.id, projectId)),

  /** L'animateur épingle un projet. */
  pin: (hiveId: string, projectId: string, by: string) =>
    ctx.db
      .update(schema.hive)
      .set({ pinnedProjectId: projectId, pinnedBy: by, pinnedAt: new Date() })
      .where(eq(schema.hive.id, hiveId)),

  /** La ruche telle qu'en base (null si elle n'existe plus). */
  row: async (hiveId: string) => {
    const [row] = await ctx.db.select().from(schema.hive).where(eq(schema.hive.id, hiveId))
    return row ?? null
  },

  /** Ses membres, en base. */
  members: (hiveId: string) =>
    ctx.db.select().from(schema.hiveMember).where(eq(schema.hiveMember.hiveId, hiveId)),
})
