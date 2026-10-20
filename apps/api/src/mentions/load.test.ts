// Tests unitaires de matchMentions : retrouver, dans le texte d'un commentaire, le pseudo écrit pour
// chaque membre mentionné, quand la base ne garde que l'identifiant du membre.
import { describe, expect, it } from 'vitest'
import { matchMentions } from './load'

const handles = (current: string | null, former: string[] = []) => ({ current, former })

describe('matchMentions', () => {
  it('finds each member by the handle written, current or former, in the order of the text', () => {
    const found = matchMentions(
      '@zoe et @ines_morel',
      ['ines', 'zoe'],
      new Map([
        ['ines', handles('ines', ['ines_morel'])],
        ['zoe', handles('zoe')],
      ]),
    )
    expect(found).toEqual([
      { handle: 'zoe', memberId: 'zoe' },
      { handle: 'ines_morel', memberId: 'ines' },
    ])
  })

  it('pairs a member whose former handle is gone with the only handle left', () => {
    expect(
      matchMentions('Merci @ines_morel', ['ines'], new Map([['ines', handles('ines')]])),
    ).toEqual([{ handle: 'ines_morel', memberId: 'ines' }])
  })

  it('gives no link rather than a wrong one when two handles are left', () => {
    // « @personne » ne désignait personne ; « @ines_morel » désignait Inès, qui en a changé et
    // dont l'ancien pseudo n'est plus gardé : impossible de savoir lequel est le sien.
    expect(
      matchMentions('@personne @ines_morel', ['ines'], new Map([['ines', handles('ines')]])),
    ).toEqual([])
  })
})
