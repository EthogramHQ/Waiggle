import { describe, expect, it } from 'vitest'
import { ProfileUpdate } from './profile'

describe('ProfileUpdate', () => {
  it('accepts a partial update', () => {
    expect(ProfileUpdate.parse({ bio: 'Je bricole des agents.' })).toEqual({
      bio: 'Je bricole des agents.',
    })
  })

  it('refuses a bio longer than 280 characters', () => {
    expect(ProfileUpdate.safeParse({ bio: 'a'.repeat(281) }).success).toBe(false)
  })

  it('refuses more than 10 favorite tools', () => {
    const tools = Array.from({ length: 11 }, (_, i) => `Outil ${i}`)
    expect(ProfileUpdate.safeParse({ favoriteTools: tools }).success).toBe(false)
  })

  it('removes duplicate tools, whatever their case, and trims them', () => {
    expect(ProfileUpdate.parse({ favoriteTools: ['Claude', ' claude ', 'Cursor'] })).toEqual({
      favoriteTools: ['Claude', 'Cursor'],
    })
  })

  it('refuses fields that cannot be changed here, such as the email address', () => {
    expect(ProfileUpdate.safeParse({ email: 'other@example.com' }).success).toBe(false)
    expect(ProfileUpdate.safeParse({ emailVerified: true }).success).toBe(false)
  })

  it('only accepts supported languages', () => {
    expect(ProfileUpdate.safeParse({ language: 'en' }).success).toBe(true)
    expect(ProfileUpdate.safeParse({ language: 'de' }).success).toBe(false)
  })
})

describe('ProfileUpdate and invisible characters', () => {
  it('refuses the null character anywhere, instead of letting the database fail', () => {
    expect(ProfileUpdate.safeParse({ bio: 'x\u0000' }).success).toBe(false)
    expect(ProfileUpdate.safeParse({ name: 'Léa\u0000' }).success).toBe(false)
    expect(ProfileUpdate.safeParse({ favoriteTools: ['Claude\u0000'] }).success).toBe(false)
  })
})
