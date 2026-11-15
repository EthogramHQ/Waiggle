// Les ruches des tests de visibilité de R10, écrites directement en base : ces tests vérifient ce
// que voit chacun (projets réservés, Fil d'une ruche, suggestions, recherche), pas la création
// d'une ruche, testée par ses propres routes (hives.test.ts). Une ruche, ses membres, et un projet
// « réservé » à elle (visibility = 'hive', hive_id posé : la contrainte `project_hive_check` veut
// les deux ensemble). Rien ici n'est utilisé en production.
import { schema } from '@ruche/db'
import { and, eq } from 'drizzle-orm'
import type { TestContext } from './context'

export const hiveRows = (ctx: TestContext) => ({
  /**
   * Une ruche, animée par `animatorId`, avec ses membres (l'animateur compris). Les dates viennent
   * de `new Date()` : la fausse horloge du test.
   */
  createHive: async (name: string, animatorId: string, memberIds: string[] = []) => {
    const id = crypto.randomUUID()
    const now = new Date()
    await ctx.db.insert(schema.hive).values({
      id,
      name,
      icon: 'house-line',
      animatorId,
      nameSetBy: animatorId,
      createdBy: animatorId,
      createdAt: now,
      updatedAt: now,
    })
    const members = [animatorId, ...memberIds.filter((member) => member !== animatorId)]
    await ctx.db.insert(schema.hiveMember).values(
      members.map((userId) => ({
        hiveId: id,
        userId,
        invitedBy: userId === animatorId ? null : animatorId,
        joinedAt: now,
      })),
    )
    return id
  },

  /** Un membre de plus dans la ruche. */
  addMember: async (hiveId: string, userId: string) => {
    await ctx.db.insert(schema.hiveMember).values({ hiveId, userId, joinedAt: new Date() })
  },

  /**
   * Un membre quitte la ruche : sa ligne s'efface, rien d'autre (la route de sortie, qui rend aussi
   * privés ses projets réservés, est testée ailleurs).
   */
  removeMember: async (hiveId: string, userId: string) => {
    await ctx.db
      .delete(schema.hiveMember)
      .where(and(eq(schema.hiveMember.hiveId, hiveId), eq(schema.hiveMember.userId, userId)))
  },

  /**
   * Réserve un projet déjà publié à une ruche, directement en base : sa date de publication
   * (`published_at`) reste celle de sa première publication.
   */
  reserve: async (projectId: string, hiveId: string) => {
    await ctx.db
      .update(schema.project)
      .set({ visibility: 'hive', hiveId })
      .where(eq(schema.project.id, projectId))
  },

  /** La date de la dernière visite d'une ruche (`seen_at`), telle que la base la garde. */
  seenAt: async (hiveId: string, userId: string) => {
    const [row] = await ctx.db
      .select({ seenAt: schema.hiveMember.seenAt })
      .from(schema.hiveMember)
      .where(and(eq(schema.hiveMember.hiveId, hiveId), eq(schema.hiveMember.userId, userId)))
    return row?.seenAt ?? null
  },

  /** Pose la dernière visite d'une ruche. */
  setSeenAt: async (hiveId: string, userId: string, at: Date) => {
    await ctx.db
      .update(schema.hiveMember)
      .set({ seenAt: at })
      .where(and(eq(schema.hiveMember.hiveId, hiveId), eq(schema.hiveMember.userId, userId)))
  },

  /**
   * « Ne pas me proposer aux autres », posé en base (le réglage par PATCH /v1/me est testé avec le
   * compte) : le profil existe ou non selon ce que le membre a déjà rempli.
   */
  hideFromSuggestions: async (userId: string) => {
    await ctx.db
      .insert(schema.profile)
      .values({ userId, hideFromSuggestions: true })
      .onConflictDoUpdate({ target: schema.profile.userId, set: { hideFromSuggestions: true } })
  },
})
