import { appName } from '@ruche/brand'
import { describe, expect, it } from 'vitest'
import { existingAccountEmail, verificationEmail } from './templates'

describe('verificationEmail', () => {
  const url = 'https://api.waiggle.io/api/auth/verify-email?token=abc'

  it('is written in French, with the link in the text and in the button', () => {
    const email = verificationEmail('fr', { name: 'Léa', url })

    expect(email.subject).toBe(`Active ton compte ${appName}`)
    expect(email.text).toContain('Bonjour Léa,')
    expect(email.text).toContain(url)
    expect(email.html).toContain(`href="${url}"`)
  })

  it('is written in English for an English-speaking member', () => {
    const email = verificationEmail('en', { name: 'Sam', url })

    expect(email.subject).toBe(`Activate your ${appName} account`)
    expect(email.text).toContain('Hi Sam,')
  })

  it('neutralises HTML hidden in a name, so an email cannot be booby-trapped', () => {
    const email = verificationEmail('fr', { name: '<img src=x onerror=alert(1)>', url })

    expect(email.html).not.toContain('<img')
    expect(email.html).toContain('&lt;img')
  })
})

describe('existingAccountEmail', () => {
  it('tells the owner someone tried to sign up, and points to sign-in', () => {
    const signInUrl = 'https://waiggle.io/sign-in'
    const email = existingAccountEmail('fr', { name: 'Léa', signInUrl })

    expect(email.subject).toBe(`Tentative d’inscription sur ${appName}`)
    expect(email.text).toContain(signInUrl)
  })
})
