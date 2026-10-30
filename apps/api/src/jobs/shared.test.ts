// Les liens d'un e-mail de notification (linksFor, jobs/shared.ts) : où mène chacun d'eux.
import { describe, expect, it } from 'vitest'
import { linksFor } from './shared'

const deps = {
  appUrl: 'https://waiggle.com',
  apiUrl: 'https://api.waiggle.com',
  secret: 'a-secret-long-enough-for-the-unsubscribe-tokens',
}

describe('the links of a notification e-mail', () => {
  // R2, jur-B5 : « Gérer mes e-mails » ouvre les réglages où chaque e-mail se coupe, pas le profil.
  it('lead "manage my e-mails" to the notification settings', () => {
    expect(linksFor(deps, 'user-1', 'recap').manage).toBe(
      'https://waiggle.com/settings/notifications',
    )
  })

  it('keep every link on our own addresses', () => {
    const links = linksFor(deps, 'user-1', 'recap')

    expect(new URL(links.button).origin).toBe(deps.appUrl)
    expect(new URL(links.unsubscribe).origin).toBe(deps.appUrl)
    expect(new URL(links.oneClick).origin).toBe(deps.apiUrl)
  })
})
