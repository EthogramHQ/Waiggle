// Tests de la carte compacte d'une décision (R9, planche R9-Moderation-Desktop) : l'historique
// récent, à droite de la modération sur ordinateur (« Décisions récentes » sur téléphone), montre
// une ligne courte par décision (« a retiré un commentaire », « a suspendu un compte pour 7 jours »)
// avec une icône de couleur par action : retrait, retrait d'une partie, rétablissement, classement,
// suspension, levée (scénario « La modération sur ordinateur »).
//
// L'interface attendue : `DecisionCard` gagne `compact?: boolean` ; la carte écrit elle-même sa
// ligne à partir de `moderation.recent` (et de `moderation.parts` pour une partie, par
// `partText`) ; six couleurs par rôle dans `colors.ts`. Sans `compact`, rien ne change
// (DecisionCard.test.tsx).
//
// La couleur ne se cherche pas sur un élément précis (les tests ne lisent pas le style d'un
// élément nommé) : on relève toutes les couleurs que dessine chaque carte, et l'on vérifie que deux
// actions différentes ne dessinent pas la même chose. La phrase dit l'action en mots : la couleur
// n'est jamais seule à la porter.
import type { DecisionHistoryItem } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { StyleSheet, View } from 'react-native'
import {
  dismissByGoneAdminDecision,
  liftDecision,
  removeDecision,
  suspendDecision,
} from '../testing/moderation'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { DecisionCard } from './DecisionCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const photoId = '2b3c4d5e-6f70-4a81-9b2c-3d4e5f607182'
const meteoId = '6e7f8091-a2b3-4dc4-9ed5-e6f708192a3b'

// R9 : chaque décision porte sa partie (null : le contenu entier, ou une décision sur un membre).
const remove: DecisionHistoryItem = { ...removeDecision, part: null }
const removePart: DecisionHistoryItem = {
  ...removeDecision,
  target: { kind: 'project', id: meteoId },
  projectId: meteoId,
  part: { field: 'photo', mediaId: photoId, position: 2 },
  explanation: 'Une personne reconnaissable sur son balcon, sans son accord.',
}
const restore: DecisionHistoryItem = {
  ...removeDecision,
  action: 'restore',
  ground: null,
  explanation: null,
  part: null,
}
const restorePart: DecisionHistoryItem = { ...removePart, action: 'restore', ground: null }
const dismiss: DecisionHistoryItem = { ...dismissByGoneAdminDecision, part: null }
const suspend: DecisionHistoryItem = { ...suspendDecision, part: null }
const suspendIndefinite: DecisionHistoryItem = { ...suspend, duration: 'indefinite' }
const lift: DecisionHistoryItem = { ...liftDecision, part: null }
const liftError: DecisionHistoryItem = { ...lift, liftCause: 'error' }

const show = (decision: DecisionHistoryItem) =>
  renderWithProviders(<DecisionCard decision={decision} compact />)

const what = (kind: 'comment' | 'project') => fr.t(($) => $.moderation.recent.what[kind])

describe('DecisionCard compact (R9)', () => {
  it('says a removal in one short line: « a retiré un commentaire »', async () => {
    await show(remove)

    expect(
      screen.getByText(
        containing(fr.t(($) => $.moderation.recent.remove, { what: what('comment') })),
      ),
    ).toBeTruthy()
  })

  it('names the part of a part removal: « a retiré la photo 2 d’un projet »', async () => {
    await show(removePart)

    const part = fr.t(($) => $.moderation.parts.photo, { n: 2 })
    expect(
      screen.getByText(
        containing(fr.t(($) => $.moderation.recent.removePart, { part, what: what('project') })),
      ),
    ).toBeTruthy()
  })

  it('says a restoration, of a content or of a part', async () => {
    await show(restorePart)

    const part = fr.t(($) => $.moderation.parts.photo, { n: 2 })
    expect(
      screen.getByText(
        containing(fr.t(($) => $.moderation.recent.restorePart, { part, what: what('project') })),
      ),
    ).toBeTruthy()
  })

  it('says a restoration of a whole content', async () => {
    await show(restore)

    expect(
      screen.getByText(
        containing(fr.t(($) => $.moderation.recent.restore, { what: what('comment') })),
      ),
    ).toBeTruthy()
  })

  it('says a dismissal', async () => {
    await show(dismiss)

    expect(screen.getByText(containing(fr.t(($) => $.moderation.recent.dismiss)))).toBeTruthy()
  })

  it('says a suspension with its duration, or without end', async () => {
    await show(suspend)

    expect(
      screen.getByText(
        containing(
          fr.t(($) => $.moderation.recent.suspend, {
            duration: fr.t(($) => $.moderation.durations['7d']),
          }),
        ),
      ),
    ).toBeTruthy()
  })

  it('says a suspension without end', async () => {
    await show(suspendIndefinite)

    expect(
      screen.getByText(containing(fr.t(($) => $.moderation.recent.suspendIndefinite))),
    ).toBeTruthy()
  })

  it('says a lift, and a lift for an error in its own words (J10)', async () => {
    await show(liftError)

    expect(screen.getByText(containing(fr.t(($) => $.moderation.recent.liftError)))).toBeTruthy()
  })

  it('says a lift earlier than planned', async () => {
    await show(lift)

    const line = fr.t(($) => $.moderation.recent.lift)
    expect(screen.getByText(containing(line))).toBeTruthy()
    // Pas la phrase de l'erreur : elle commence pareil, la levée plus tôt n'en est pas une.
    expect(screen.queryByText(containing(fr.t(($) => $.moderation.recent.liftError)))).toBeNull()
  })

  it('keeps the line short: neither the explanation, nor the ground, nor the link', async () => {
    await show(remove)

    expect(
      screen.getByText(
        containing(fr.t(($) => $.moderation.recent.remove, { what: what('comment') })),
      ),
    ).toBeTruthy() // témoin
    expect(screen.queryByText(containing(remove.explanation ?? ''))).toBeNull()
    expect(screen.queryByText(containing(fr.t(($) => $.moderation.grounds.rules)))).toBeNull()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('draws each of the six actions in its own colour', async () => {
    // Un seul rendu (charte) : les six cartes l'une sous l'autre, chacune dans une vue repérée.
    const six = { remove, removePart, restore, dismiss, suspend, lift }
    await renderWithProviders(
      <View>
        {Object.entries(six).map(([name, decision]) => (
          <View key={name} testID={`card-${name}`}>
            <DecisionCard decision={decision} compact />
          </View>
        ))}
      </View>,
    )

    type Node = { props: Record<string, unknown>; children: (Node | string)[] }
    /** Toutes les couleurs dessinées sous ce nœud : textes, fonds, bords, tracés d'icônes. */
    const colorsUnder = (node: Node | string): string[] => {
      if (typeof node === 'string') return []
      const style = (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>
      const own = [
        style.color,
        style.backgroundColor,
        style.borderColor,
        style.borderLeftColor,
        node.props.color,
        node.props.fill,
        node.props.stroke,
        node.props.tintColor,
      ].filter((value): value is string => typeof value === 'string' && value !== 'none')
      return [...own, ...node.children.flatMap(colorsUnder)]
    }
    const signature = (name: string) => {
      const card = screen.getByTestId(`card-${name}`, {
        includeHiddenElements: true,
      }) as unknown as Node
      return [...new Set(colorsUnder(card))].sort().join(' ')
    }

    const signatures = Object.keys(six).map(signature)
    expect(signatures.every((colors) => colors !== '')).toBe(true) // témoin
    expect(new Set(signatures).size).toBe(6)
  })
})
