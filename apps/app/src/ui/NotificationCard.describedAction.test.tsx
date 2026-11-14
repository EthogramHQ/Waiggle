// Tests du lien entre le geste d'une notification et sa phrase (R9) : sur la page Activité,
// plusieurs « Contester » portent le même nom ; chacun est décrit par la phrase de sa ligne, en
// indice sur téléphone et par `aria-describedby` sur le web (une carte répétée d'une liste relie
// ses contrôles à son extrait).
import { fireEvent, screen } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import { Linking, Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { NotificationCard } from './NotificationCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Props = ComponentProps<typeof NotificationCard>

const CONTEST = fr.t(($) => $.notifications.contest)
const CHOOSE = fr.t(($) => $.notifications.chooseHandle)
const SENTENCE = 'Ton commentaire sur Météo a été retiré par la modération'

const base: Props = {
  leading: { kind: 'icon', icon: 'flag', tone: 'danger' },
  parts: [
    { text: 'Ton commentaire sur ' },
    { text: 'Météo', style: 'strong' },
    { text: ' a été retiré par la modération' },
  ],
  when: '12 nov.',
  isNew: false,
  onPress: () => {},
}

type Host = { props: Record<string, unknown>; children: (Host | string)[] }

/** Le texte entier de la vue rendue qui porte `nativeID === id` (RNTL 14 : on parcourt l'arbre). */
const textWithId = (id: unknown): string | null => {
  const text = (node: Host | string): string =>
    typeof node === 'string' ? node : node.children.map(text).join('')
  const find = (node: Host | string): Host | null => {
    if (typeof node === 'string') return null
    if (node.props.nativeID === id) return node
    for (const child of node.children) {
      const found = find(child)
      if (found) return found
    }
    return null
  }
  const found = find(screen.root as unknown as Host)
  return found ? text(found) : null
}

describe('NotificationCard action, described by its sentence', () => {
  it('reads the sentence of its row after « Contester » on a phone', async () => {
    await renderWithProviders(
      <NotificationCard {...base} action={{ label: CONTEST, contact: { subject: 'Objet' } }} />,
    )

    expect(screen.getByRole('link', { name: CONTEST }).props.accessibilityHint).toBe(SENTENCE)
  })

  it('reads the sentence of its row after a gesture of the screen on a phone', async () => {
    await renderWithProviders(
      <NotificationCard {...base} action={{ label: CHOOSE, onPress: () => {} }} />,
    )

    expect(screen.getByRole('button', { name: CHOOSE }).props.accessibilityHint).toBe(SENTENCE)
  })

  it('points to the sentence of its row on the web', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    const web = jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <NotificationCard {...base} action={{ label: CONTEST, contact: { subject: 'Objet' } }} />,
      )

      const contest = screen.getByRole('link', { name: CONTEST })
      const id = contest.props['aria-describedby']
      expect(typeof id).toBe('string')
      // La phrase porte cet identifiant : c'est elle que le lecteur d'écran lit après le nom.
      expect(textWithId(id)).toBe(SENTENCE)
      await fireEvent.press(contest)
      expect(openURL).toHaveBeenCalledTimes(1)
    } finally {
      web.restore()
      openURL.mockRestore()
    }
  })
})
