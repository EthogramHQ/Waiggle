// Tests du contrat des projets publics (tranche R12) : la visibilité `web`, les listes blanches
// des réponses lues par un visiteur, la demande de la tête des pages et le signalement d'un visiteur.
import { describe, expect, it } from 'vitest'
import { HeadQuery } from './head'
import { PublicMember } from './members'
import { ProjectChanges, ProjectInput, ProjectVisibility, PublicProjectCard } from './projects'
import { VisitorReport } from './reports'
import { ShowcaseOrder } from './showcase'

const projectId = '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6'
const card = {
  id: projectId,
  title: 'Météo',
  pitch: 'Le temps du jardin.',
  status: 'idea',
  cover: null,
}

describe('ProjectVisibility (R12)', () => {
  it('accepts web, the public projects', () => {
    expect(ProjectVisibility.options).toEqual(['public', 'hive', 'private', 'web'])
  })

  it('refuses a hive sent with web, as with any visibility other than hive', () => {
    const base = { title: 'Météo', pitch: 'Le temps du jardin.', primaryCategory: 'home-garden' }
    expect(ProjectInput.safeParse({ ...base, visibility: 'web' }).success).toBe(true)
    expect(
      ProjectInput.safeParse({
        ...base,
        visibility: 'web',
        hiveId: '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f7',
      }).success,
    ).toBe(false)
    expect(ProjectChanges.safeParse({ visibility: 'web' }).success).toBe(true)
  })
})

describe('the answers a visitor reads', () => {
  it('let no field out that they do not name', () => {
    expect(PublicProjectCard.safeParse(card).success).toBe(true)
    expect(PublicProjectCard.safeParse({ ...card, commentCount: 3 }).success).toBe(false)
    const member = { id: 'ines-id', name: 'Inès', avatarUrl: null }
    expect(PublicMember.safeParse(member).success).toBe(true)
    expect(PublicMember.safeParse({ ...member, handle: 'ines' }).success).toBe(false)
  })
})

describe('HeadQuery', () => {
  it('never refuses a request: an unreadable path or language becomes the neutral head', () => {
    expect(HeadQuery.parse({ path: '/fr/projects/x', lang: 'en' })).toEqual({
      path: '/fr/projects/x',
      lang: 'en',
    })
    expect(HeadQuery.parse({ path: '/a b', lang: 'de' })).toEqual({ path: null, lang: 'fr' })
    expect(HeadQuery.parse({ path: 'x"><script>' })).toEqual({ path: null, lang: 'fr' })
    expect(HeadQuery.parse({})).toEqual({ path: null, lang: 'fr' })
  })
})

describe('VisitorReport', () => {
  const report = { target: { kind: 'project', id: projectId }, reason: 'scam_spam' }

  it('takes an optional e-mail address, an empty box counting as none', () => {
    expect(VisitorReport.parse({ ...report, email: '  ines@example.org ' }).email).toBe(
      'ines@example.org',
    )
    expect(VisitorReport.parse({ ...report, email: '   ' }).email).toBeUndefined()
    expect(VisitorReport.safeParse({ ...report, email: 'not an address' }).success).toBe(false)
  })

  it('only targets a project, an update or a member page', () => {
    const comment = { ...report, target: { kind: 'comment', id: projectId } }
    expect(VisitorReport.safeParse(comment).success).toBe(false)
  })

  it('asks for an explanation of an illegal content, as for a member', () => {
    expect(VisitorReport.safeParse({ ...report, reason: 'illegal' }).success).toBe(false)
  })
})

describe('ShowcaseOrder', () => {
  it('takes four projects at most, each once', () => {
    expect(ShowcaseOrder.safeParse({ projectIds: [projectId] }).success).toBe(true)
    expect(ShowcaseOrder.safeParse({ projectIds: [projectId, projectId] }).success).toBe(false)
    expect(ShowcaseOrder.safeParse({ projectIds: [] }).success).toBe(true)
  })
})
