// Tests de « Ouvrir ma messagerie » (refonte, tranche R2, accounts/mailbox.ts) : sur ordinateur,
// l'appli propose d'ouvrir le webmail quand l'adresse est d'un service connu (Gmail, Outlook, Yahoo,
// Proton, iCloud, Orange, Free, SFR, La Poste), rien sinon. Relecture de sécurité sec-S15 : une
// table fixe, et le domaine comparé en entier (jamais « finit par ») : « gmail.com.evil.fr » n'est
// pas Gmail. Relecture juridique jur-10 : l'adresse du webmail ne porte rien du membre (ni son
// adresse, ni son nom) : on ouvre la boîte, pas un message pré-rempli.
import { mailboxFor } from './mailbox'

describe('mailboxFor', () => {
  it.each([
    ['lea@gmail.com', 'Gmail'],
    ['lea@googlemail.com', 'Gmail'],
    ['sam@outlook.com', 'Outlook'],
    ['sam@outlook.fr', 'Outlook'],
    ['sam@hotmail.com', 'Outlook'],
    ['sam@hotmail.fr', 'Outlook'],
    ['sam@live.fr', 'Outlook'],
    ['ines@yahoo.com', 'Yahoo'],
    ['ines@yahoo.fr', 'Yahoo'],
    ['max@proton.me', 'Proton'],
    ['max@protonmail.com', 'Proton'],
    ['max@icloud.com', 'iCloud'],
    ['nour@orange.fr', 'Orange'],
    ['nour@wanadoo.fr', 'Orange'],
    ['nour@free.fr', 'Free'],
    ['nour@sfr.fr', 'SFR'],
    ['nour@laposte.net', 'La Poste'],
  ])('knows the mailbox of %s (%s)', (email, name) => {
    const mailbox = mailboxFor(email)

    expect(mailbox?.name).toBe(name)
    expect(mailbox?.url).toMatch(/^https:\/\//)
  })

  it('compares the domain in lower case', () => {
    expect(mailboxFor('Lea.Moreau@GMAIL.COM')?.name).toBe('Gmail')
    expect(mailboxFor('sam@Outlook.Fr')?.name).toBe('Outlook')
  })

  it('knows nothing of an unknown provider', () => {
    expect(mailboxFor('lea@gmail.com')).not.toBeNull() // témoin
    expect(mailboxFor('lea@exemple.fr')).toBeNull()
    expect(mailboxFor('lea@ruche.example')).toBeNull()
  })

  it('refuses a domain that only ends like a known one (whole-domain match, sec-S15)', () => {
    expect(mailboxFor('lea@gmail.com')).not.toBeNull() // témoin
    expect(mailboxFor('lea@gmail.com.evil.fr')).toBeNull()
    expect(mailboxFor('lea@evil-gmail.com')).toBeNull()
    expect(mailboxFor('lea@notgmail.com')).toBeNull()
    expect(mailboxFor('lea@mail.gmail.com')).toBeNull()
  })

  it('knows nothing of a malformed address', () => {
    expect(mailboxFor('lea@gmail.com')).not.toBeNull() // témoin
    expect(mailboxFor('')).toBeNull()
    expect(mailboxFor('pas-une-adresse')).toBeNull()
    expect(mailboxFor('lea@')).toBeNull()
    expect(mailboxFor('@gmail.com')).toBeNull()
    // Deux « @ » : le domaine est ce qui suit le dernier, et ce n'est pas Gmail.
    expect(mailboxFor('lea@gmail.com@evil.fr')).toBeNull()
  })

  it('never puts anything of the member in the webmail address (jur-10)', () => {
    const lea = mailboxFor('lea.moreau@gmail.com')
    const sam = mailboxFor('sam.durand@gmail.com')

    expect(lea?.url).toBeDefined()
    // La même adresse pour deux membres du même service : elle ne dépend pas de la personne.
    expect(lea?.url).toBe(sam?.url)
    expect(lea?.url).not.toMatch(/lea|moreau|@|%40/i)
  })

  it('opens the inbox, not a pre-filled message', () => {
    for (const email of ['lea@gmail.com', 'sam@outlook.com', 'max@proton.me']) {
      const url = mailboxFor(email)?.url ?? ''
      expect(url).toMatch(/^https:\/\//) // témoin
      expect(url).not.toMatch(/^mailto:/)
      expect(url).not.toMatch(/compose|to=|subject=|body=/i)
    }
  })
})
