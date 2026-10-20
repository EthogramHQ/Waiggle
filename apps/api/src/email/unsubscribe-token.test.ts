// Tests du jeton des liens de désinscription (tranche 6c). Le jeton dit « le membre X peut couper
// telle sorte d'e-mail » et porte une signature : une empreinte HMAC-SHA256 (un calcul qui mêle le
// texte et une clé secrète ; sans la clé, impossible de fabriquer l'empreinte d'un autre texte).
// Forme fixe : `v1.<id en base64url>.<sorte>.<signature en 43 caractères>`.
//
// Règles (plan 6c, relecture de sécurité S-A2) :
// - la clé est dérivée de BETTER_AUTH_SECRET, jamais le secret brut ;
// - tout jeton faux, abîmé ou d'une autre forme est refusé (null), sans jamais lever d'erreur :
//   la comparaison à temps constant (timingSafeEqual) lève une erreur si les longueurs diffèrent,
//   ce qui donnerait un 500 au lieu du 400 commun.
import { createHmac } from 'node:crypto'
import { UnsubscribeToken } from '@ruche/contracts'
import { describe, expect, it } from 'vitest'
import { createUnsubscribeToken, readUnsubscribeToken } from './unsubscribe-token'

const secret = 'a-secret-that-is-long-enough-for-the-tests'
const userId = 'Xk3vQ9pLm2RtY7wZ4aBcD8eFgH1jKlMn'

/** Le jeton découpé en ses quatre parties. */
const partsOf = (token: string) => {
  const [version, id, kind, signature] = token.split('.')
  return { version, id, kind, signature }
}

describe('createUnsubscribeToken', () => {
  it('writes the fixed form « v1.<id>.<kind>.<signature> », as the contract expects', () => {
    for (const kind of ['recap', 'mentions'] as const) {
      const token = createUnsubscribeToken(secret, userId, kind)

      expect(UnsubscribeToken.safeParse(token).success).toBe(true)
      expect(partsOf(token)).toMatchObject({
        version: 'v1',
        id: Buffer.from(userId, 'utf8').toString('base64url'),
        kind,
      })
      expect(partsOf(token).signature).toHaveLength(43)
    }
  })

  it('never signs with the raw secret, but with a key derived from it', () => {
    const token = createUnsubscribeToken(secret, userId, 'recap')
    const signed = token.slice(0, token.lastIndexOf('.'))
    const withRawSecret = createHmac('sha256', secret).update(signed).digest('base64url')

    expect(partsOf(token).signature).not.toBe(withRawSecret)
  })

  it('gives a different token to each member, each kind and each secret', () => {
    const tokens = new Set([
      createUnsubscribeToken(secret, userId, 'recap'),
      createUnsubscribeToken(secret, userId, 'mentions'),
      createUnsubscribeToken(secret, 'another-member-id', 'recap'),
      createUnsubscribeToken(`${secret}-rotated`, userId, 'recap'),
    ])

    expect(tokens.size).toBe(4)
  })
})

describe('readUnsubscribeToken', () => {
  it('gives back the member and the kind of a token it signed', () => {
    expect(readUnsubscribeToken(secret, createUnsubscribeToken(secret, userId, 'recap'))).toEqual({
      userId,
      kind: 'recap',
    })
    expect(
      readUnsubscribeToken(secret, createUnsubscribeToken(secret, userId, 'mentions')),
    ).toEqual({ userId, kind: 'mentions' })
  })

  it('refuses a token signed with another secret', () => {
    const token = createUnsubscribeToken('another-secret-that-is-long-enough', userId, 'recap')

    expect(readUnsubscribeToken(secret, token)).toBeNull()
  })

  it('refuses a token whose member, kind or signature was changed', () => {
    const token = createUnsubscribeToken(secret, userId, 'recap')
    const { id, signature } = partsOf(token)
    const otherId = Buffer.from('another-member-id', 'utf8').toString('base64url')
    // Une lettre changée dans la signature : la première, pour rester dans l'alphabet base64url.
    const flipped = `${signature?.[0] === 'A' ? 'B' : 'A'}${signature?.slice(1)}`

    for (const forged of [
      `v1.${otherId}.recap.${signature}`,
      `v1.${id}.mentions.${signature}`,
      `v1.${id}.recap.${flipped}`,
      `v2.${id}.recap.${signature}`,
    ]) {
      expect(readUnsubscribeToken(secret, forged), forged).toBeNull()
    }
  })

  it('refuses any other form without ever throwing', () => {
    const token = createUnsubscribeToken(secret, userId, 'recap')
    const { id, signature } = partsOf(token)
    // L'identifiant avec un remplissage « = » : il se décode pareil, mais ce n'est pas le texte signé.
    const padded = `${Buffer.from(userId, 'utf8').toString('base64')}=`

    for (const malformed of [
      '',
      'v1',
      `v1.${id}.recap`,
      `v1.${id}.weekly.${signature}`,
      `v1.${id}.recap.${signature?.slice(0, 1)}`,
      `v1.${id}.recap.${signature}A`,
      `v1.${id}.recap.${signature}.extra`,
      `v1..recap.${signature}`,
      `v1.${padded}.recap.${signature}`,
      `${token}${token}`,
      `${token} `,
      `v1.%00.recap.${'A'.repeat(43)}`,
      'x'.repeat(10_000),
    ]) {
      expect(() => readUnsubscribeToken(secret, malformed), malformed).not.toThrow()
      expect(readUnsubscribeToken(secret, malformed), malformed).toBeNull()
    }
  })
})
