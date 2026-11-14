// Tests des règles du contrat des ruches (R10) : les limites du scénario, le nom d'une ruche, les
// douze icônes, ce que les routes acceptent, et la ruche qui va avec la visibilité « Une ruche ».
// Le contrat est écrit avant ces tests : ils passent dès l'écriture, et gardent les règles contre
// un changement qui les affaiblirait.
import { describe, expect, it } from 'vitest'
import { ErrorCode } from './errors'
import {
  HIVE_ICONS,
  HIVE_LIMITS,
  HiveCreate,
  HiveIcon,
  HiveInvite,
  HiveName,
  HivePatch,
  HiveSummary,
  InvitableQuery,
  MyHives,
} from './hives'
import { ProjectChanges, ProjectInput } from './projects'

/** Des caractères invisibles, écrits par leur code : l'éditeur ne les montrerait pas. */
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b)
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(0x202e)
const HIVE_ID = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f'

const summary = {
  id: HIVE_ID,
  name: 'Famille',
  icon: 'house-line',
  memberCount: 4,
  animator: { id: 'papi-jean', name: 'Papi Jean' },
  faces: [],
  news: 2,
  role: 'member',
}

describe('the limits of the hives', () => {
  it('follows the scenario: 50 members, 10 created, 20 joined, 20 invitations a day, 30 days', () => {
    expect(HIVE_LIMITS).toEqual(
      expect.objectContaining({
        members: 50,
        created: 10,
        joined: 20,
        invitationsPerDay: 20,
        invitationDays: 30,
      }),
    )
  })

  it('refuses a summary of more than 50 members or 4 faces, and more than 20 hives', () => {
    expect(HiveSummary.safeParse(summary).success).toBe(true)
    expect(HiveSummary.safeParse({ ...summary, memberCount: 51 }).success).toBe(false)
    const face = { id: 'lea', name: 'Léa', avatarUrl: null }
    expect(HiveSummary.safeParse({ ...summary, faces: Array(5).fill(face) }).success).toBe(false)
    const mine = (count: number) => ({
      hives: Array(count).fill(summary),
      invitations: [],
      createdCount: 0,
    })
    expect(MyHives.safeParse(mine(20)).success).toBe(true)
    expect(MyHives.safeParse(mine(21)).success).toBe(false)
  })

  it('has a code for each refusal of the hives', () => {
    for (const code of [
      'hive_full',
      'hives_created_limit',
      'hives_joined_limit',
      'already_hive_member',
      'already_invited',
      'invitation_expired',
      'pin_not_visible',
    ]) {
      expect(ErrorCode.safeParse(code).success, code).toBe(true)
    }
  })
})

describe('the name and the icon of a hive', () => {
  it('trims the name and accepts 1 to 40 characters', () => {
    expect(HiveName.parse('  Famille  ')).toBe('Famille')
    expect(HiveName.safeParse('x'.repeat(40)).success).toBe(true)
    expect(HiveName.safeParse('x'.repeat(41)).success).toBe(false)
    // 40 emojis comptent pour 40 caractères (des points de code, pas des unités UTF-16).
    expect(HiveName.safeParse('🐝'.repeat(40)).success).toBe(true)
  })

  it('refuses an empty name, a blank one, a line break, an invisible or direction-changing character', () => {
    for (const name of [
      '',
      '     ',
      'Famille\nHaddad',
      ZERO_WIDTH_SPACE.repeat(3),
      `Famille${RIGHT_TO_LEFT_OVERRIDE}elliamaF`,
    ]) {
      expect(HiveName.safeParse(name).success, JSON.stringify(name)).toBe(false)
    }
  })

  it('offers twelve different icons, and nothing else', () => {
    expect(HIVE_ICONS).toHaveLength(12)
    expect(new Set(HIVE_ICONS).size).toBe(12)
    expect(HiveIcon.safeParse('house-line').success).toBe(true)
    expect(HiveIcon.safeParse('skull').success).toBe(false)
  })
})

describe('what the hive routes accept', () => {
  it('creates a hive from a name and an icon only', () => {
    expect(HiveCreate.parse({ name: ' Famille ', icon: 'heart' })).toEqual({
      name: 'Famille',
      icon: 'heart',
    })
    expect(HiveCreate.safeParse({ name: 'Famille' }).success).toBe(false)
    expect(
      HiveCreate.safeParse({ name: 'Famille', icon: 'heart', animatorId: 'lea' }).success,
    ).toBe(false)
  })

  it('patches any part, unpins with null, and refuses another field', () => {
    expect(HivePatch.safeParse({}).success).toBe(true)
    expect(HivePatch.safeParse({ invitePolicy: 'animator' }).success).toBe(true)
    expect(HivePatch.safeParse({ pinnedProjectId: null }).success).toBe(true)
    expect(HivePatch.safeParse({ pinnedProjectId: HIVE_ID }).success).toBe(true)
    expect(HivePatch.safeParse({ pinnedProjectId: 'not-a-uuid' }).success).toBe(false)
    expect(HivePatch.safeParse({ invitePolicy: 'everyone' }).success).toBe(false)
    expect(HivePatch.safeParse({ animatorId: 'lea' }).success).toBe(false)
  })

  it('invites a member by its id, and nothing else', () => {
    expect(HiveInvite.safeParse({ userId: 'aB3_-x' }).success).toBe(true)
    expect(HiveInvite.safeParse({ userId: 'lea@example.com' }).success).toBe(false)
    expect(HiveInvite.safeParse({ userId: 'lea', hiveId: HIVE_ID }).success).toBe(false)
  })

  it('searches the members to invite from 2 to 50 characters, once trimmed', () => {
    expect(InvitableQuery.parse({ q: '  ma ' })).toEqual({ q: 'ma' })
    expect(InvitableQuery.safeParse({ q: ' m ' }).success).toBe(false)
    expect(InvitableQuery.safeParse({ q: 'm'.repeat(51) }).success).toBe(false)
  })
})

describe('a project reserved to a hive', () => {
  const project = {
    title: 'Le plan de table',
    pitch: 'Qui est assis à côté de qui.',
    primaryCategory: 'other',
  }

  it('needs its hive with the visibility « hive », and only with it', () => {
    expect(
      ProjectInput.safeParse({ ...project, visibility: 'hive', hiveId: HIVE_ID }).success,
    ).toBe(true)
    expect(ProjectInput.safeParse({ ...project, visibility: 'hive' }).success).toBe(false)
    expect(
      ProjectInput.safeParse({ ...project, visibility: 'public', hiveId: HIVE_ID }).success,
    ).toBe(false)
    expect(ProjectInput.safeParse({ ...project, hiveId: HIVE_ID }).success).toBe(false)
  })

  it('moves to a hive with both fields at once', () => {
    expect(ProjectChanges.safeParse({ visibility: 'hive', hiveId: HIVE_ID }).success).toBe(true)
    expect(ProjectChanges.safeParse({ visibility: 'hive' }).success).toBe(false)
    expect(ProjectChanges.safeParse({ hiveId: HIVE_ID }).success).toBe(false)
    expect(ProjectChanges.safeParse({ visibility: 'private' }).success).toBe(true)
  })
})
