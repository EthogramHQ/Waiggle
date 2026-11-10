// Tests du contrat de « Proches à suivre » (tranche R4) : la forme d'un membre suggéré, la liste
// (cinq au plus) et une suggestion écartée dans l'export des données. Le contrat filtre lui-même
// ce qui peut sortir : l'API passe ses réponses par ces schémas (`.parse`), donc un champ refusé ou
// retiré ici ne peut jamais partir vers l'appli.
import { describe, expect, it } from 'vitest'
import {
  DismissedSuggestionExport,
  MemberSuggestions,
  SUGGESTION_MAX,
  SuggestedMember,
} from './suggestions'

const latestProject = {
  id: '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6',
  author: { id: 'lea-id', name: 'Léa', avatarUrl: null },
  title: 'Mon agent de recettes',
  pitch: 'Un menu avec ce qu’il y a au frigo.',
  status: 'testable',
  visibility: 'public',
  tools: [{ label: 'Claude Code', slug: 'claude-code', inCatalogue: true }],
  cover: null,
  demoUrl: null,
  portraitCover: null,
  primaryCategory: null,
  secondaryCategory: null,
  createdAt: '2026-10-18T08:30:00.000Z',
  updatedAt: '2026-10-18T08:30:00.000Z',
  reactionTotal: 4,
  latestUpdate: null,
  version: null,
}
const lea = { id: 'lea-id', name: 'Léa', avatarUrl: null, latestProject }

describe('SuggestedMember', () => {
  it('accepts a photo, a name and the latest public project, total of reactions included', () => {
    expect(SuggestedMember.parse(lea)).toEqual(lea)
    const withPhoto = { ...lea, avatarUrl: 'https://cdn.example/lea.jpg' }
    expect(SuggestedMember.parse(withPhoto).avatarUrl).toBe('https://cdn.example/lea.jpg')
  })

  // sec-A5 : un schéma strict refuse au lieu de retirer en silence ; une API qui laisserait
  // passer l'adresse, le pseudo ou une date échoue alors en test, au lieu de les envoyer.
  it('refuses a suggested member carrying an email, a handle or a date', () => {
    for (const extra of [
      { email: 'lea@example.com' },
      { handle: 'lea' },
      { createdAt: '2026-10-18T08:30:00.000Z' },
      { lastPublishedAt: '2026-10-18T08:30:00.000Z' },
    ]) {
      expect(SuggestedMember.safeParse({ ...lea, ...extra }).success, Object.keys(extra)[0]).toBe(
        false,
      )
    }
  })

  // jur-J5 : aucune preuve sociale sur la ligne (ni nombre d'abonnés, ni « suivi par »).
  it('refuses any social proof: a number of followers or who follows the member', () => {
    for (const extra of [{ followerCount: 12 }, { followedBy: ['Max'] }]) {
      expect(SuggestedMember.safeParse({ ...lea, ...extra }).success).toBe(false)
    }
  })

  it('requires the latest project', () => {
    const { latestProject: _, ...withoutProject } = lea
    expect(SuggestedMember.safeParse(withoutProject).success).toBe(false)
  })
})

describe('MemberSuggestions', () => {
  it('holds five members at most', () => {
    expect(SUGGESTION_MAX).toBe(5)
    const members = Array.from({ length: SUGGESTION_MAX }, (_, i) => ({ ...lea, id: `m${i}` }))
    expect(MemberSuggestions.parse({ members }).members).toHaveLength(5)
    expect(MemberSuggestions.safeParse({ members: [...members, lea] }).success).toBe(false)
  })

  it('accepts an empty list (nobody to suggest)', () => {
    expect(MemberSuggestions.parse({ members: [] })).toEqual({ members: [] })
  })
})

describe('DismissedSuggestionExport', () => {
  // jur-J4 : comme un blocage dans l'export, le membre écarté est nommé par son pseudo (null s'il
  // n'en a pas), avec la date du choix ; jamais par son nom affiché.
  it('names the dismissed member by identifier and handle, with the date', () => {
    const dismissed = { memberId: 'max-id', handle: 'max', at: '2026-10-31T20:00:00.000Z' }
    expect(DismissedSuggestionExport.parse(dismissed)).toEqual(dismissed)
    expect(DismissedSuggestionExport.parse({ ...dismissed, handle: null }).handle).toBeNull()
  })

  it('never carries the display name of the dismissed member', () => {
    const parsed = DismissedSuggestionExport.parse({
      memberId: 'max-id',
      handle: 'max',
      at: '2026-10-31T20:00:00.000Z',
      name: 'Max',
    })
    expect(parsed).not.toHaveProperty('name')
  })

  it('requires a real date', () => {
    for (const at of ['hier', '2026-10-31', null]) {
      expect(
        DismissedSuggestionExport.safeParse({ memberId: 'max-id', handle: 'max', at }).success,
      ).toBe(false)
    }
  })
})
