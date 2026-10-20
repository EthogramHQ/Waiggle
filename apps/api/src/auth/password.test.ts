// Test de garde du hachage des mots de passe. Les tests de l'API remplacent scrypt par un hachage
// rapide (testing/context.ts) : celui-ci vérifie que la configuration de production, elle, garde
// bien scrypt, et que le hachage des tests distingue deux mots de passe.
import { createTestPgliteDb } from '@ruche/db/pglite'
import { verifyPassword } from 'better-auth/crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryMailer } from '../email/mailer'
import { createMemoryStorage } from '../media/storage'
import { createTestContext, fastPasswordHashing } from '../testing/context'
import { createAuth } from './auth'

const closers: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const close of closers.splice(0)) await close()
})

describe('password hashing', () => {
  it('keeps scrypt in the production configuration', async () => {
    const { db, close } = await createTestPgliteDb()
    closers.push(close)
    // Les mêmes options que src/index.ts : aucune option `password`.
    const auth = createAuth({
      db,
      mailer: createMemoryMailer(),
      storage: createMemoryStorage(),
      secret: 'production-like-secret-long-enough-for-tests',
      publicApiUrl: 'https://api.example.com',
      appUrl: 'https://app.example.com',
      rateLimit: true,
      inviteCode: 'Miel-2026-Noel',
    })
    // $context : la configuration que Better Auth s'est réellement construite.
    const { password } = await auth.$context
    const hash = await password.hash('correct-horse-battery')

    // L'empreinte de scrypt dans Better Auth : « sel:clé » en hexadécimal (16 et 64 octets).
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/)
    expect(await verifyPassword({ hash, password: 'correct-horse-battery' })).toBe(true)
    expect(await fastPasswordHashing.verify({ hash, password: 'correct-horse-battery' })).toBe(
      false,
    )
  })

  it('uses the fast hashing in tests, which still tells two passwords apart', async () => {
    const ctx = await createTestContext()
    closers.push(ctx.close)
    const { password } = await ctx.auth.$context
    const hash = await password.hash('correct-horse-battery')

    expect(hash).toMatch(/^test-sha256:/)
    expect(await password.verify({ hash, password: 'correct-horse-battery' })).toBe(true)
    expect(await password.verify({ hash, password: 'correct-horse-batterY' })).toBe(false)
    // Deux empreintes du même mot de passe diffèrent : chacune a son sel.
    expect(await password.hash('correct-horse-battery')).not.toBe(hash)
  })
})
