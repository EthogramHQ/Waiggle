// Tests des pages de liste : la page d'un membre et la page d'une étiquette.
import { describe, expect, it } from 'vitest'
import { Member, MemberId } from './members'
import { PROJECT_LIST_MAX, TagPage, TagParam } from './projects'

const summary = {
  id: '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6',
  author: { id: 'lea-id', name: 'Léa', avatarUrl: null },
  title: 'Mon agent de recettes',
  pitch: 'Un menu avec ce qu’il y a au frigo.',
  status: 'idea',
  visibility: 'public',
  tools: [{ label: 'Claude Code', slug: 'claude-code' }],
  cover: null,
  portraitCover: null,
  createdAt: '2026-10-18T08:30:00.000Z',
  updatedAt: '2026-10-18T08:30:00.000Z',
}

const lea = {
  id: 'lea-id',
  name: 'Léa',
  avatarUrl: null,
  bio: 'Je bricole des agents.',
  favoriteTools: [{ label: 'Claude Code', slug: 'claude-code' }],
  isMe: false,
  projects: [summary],
}

describe('Member', () => {
  it('describes a member page with her projects', () => {
    expect(Member.parse(lea)).toEqual(lea)
  })

  it('never lets private account details out, even if they were read by mistake', () => {
    const page = Member.parse({
      ...lea,
      email: 'lea@example.com',
      language: 'fr',
      emailVerified: true,
    })
    expect(page).not.toHaveProperty('email')
    expect(page).not.toHaveProperty('language')
    expect(page).not.toHaveProperty('emailVerified')
  })

  it('lists at most 50 projects', () => {
    const many = Array.from({ length: PROJECT_LIST_MAX + 1 }, () => summary)
    expect(Member.safeParse({ ...lea, projects: many }).success).toBe(false)
  })
})

describe('TagPage', () => {
  it('names the tag after the most recent project that carries it', () => {
    const page = { slug: 'claude-code', label: 'Claude Code', projects: [summary] }
    expect(TagPage.parse(page)).toEqual(page)
  })

  it('may have no project and no name, like an unknown tag', () => {
    expect(TagPage.parse({ slug: 'claude-code', label: null, projects: [] }).projects).toEqual([])
  })
})

describe('MemberId', () => {
  it('accepts the identifiers Better Auth makes, and nothing that could escape a path or a query', () => {
    expect(MemberId.safeParse('AbC123_xyz-9').success).toBe(true)
    for (const id of ['', '../me', "x' or '1'='1", 'é', 'a'.repeat(65)]) {
      expect(MemberId.safeParse(id).success).toBe(false)
    }
  })
})

describe('TagParam', () => {
  it('accepts any way of writing a tool, up to 200 characters', () => {
    expect(TagParam.safeParse('Claude Code').success).toBe(true)
    expect(TagParam.safeParse('').success).toBe(false)
    expect(TagParam.safeParse('a'.repeat(201)).success).toBe(false)
  })
})
