// Tests de l'erreur d'une ligne de liste (R6a, relecture du plan ui-B5 ; scénario « Catégorie et
// outils ») : sans catégorie principale, « Publier » dit « Choisis une catégorie » sous la ligne
// « Catégorie » et y met le focus. La ligne porte donc son erreur (`error`) : affichée sous le
// libellé, et liée à la ligne par `aria-describedby` sur le web, pour qu'un lecteur d'écran la lise
// en arrivant sur la ligne ; sur téléphone, où `aria-describedby` n'existe pas, elle est lue dans
// l'indice. Les autres tests de ListRow sont dans components.test.tsx.
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ListGroup, ListRow } from './ListGroup'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const CATEGORY = fr.t(($) => $.project.form.category)
const ERROR = fr.t(($) => $.project.form.chooseCategory)

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = {
  props: Record<string, unknown>
  children: ReadonlyArray<Host | string>
  parent?: Host | null
}

/** L'identifiant (`nativeID`) du premier élément qui contient ce nœud, lui compris. */
const idAround = (node: Host): string | undefined => {
  for (let at: Host | null | undefined = node; at; at = at.parent) {
    if (typeof at.props.nativeID === 'string') return at.props.nativeID
  }
  return undefined
}

describe('ListRow error (R6a)', () => {
  describe('on the web', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'web')
    })
    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('shows the error under the label and describes the row with it', async () => {
      await renderWithProviders(
        <ListGroup>
          <ListRow label={CATEGORY} trailing="chevron" onPress={() => {}} error={ERROR} />
        </ListGroup>,
      )

      const row = screen.getByRole('button', { name: CATEGORY })
      // Affichée : à l'œil, pas seulement aux lecteurs d'écran.
      const shown = screen.getByText(ERROR) as unknown as Host
      const errorId = idAround(shown)
      expect(errorId).toBeTruthy()
      const describedBy = String(row.props['aria-describedby'] ?? '').split(' ')
      expect(describedBy).toContain(errorId)
    })

    it('keeps its hint in the description next to the error', async () => {
      const hint = 'Une principale, et une seconde si tu veux.'
      await renderWithProviders(
        <ListGroup>
          <ListRow label={CATEGORY} onPress={() => {}} hint={hint} error={ERROR} />
        </ListGroup>,
      )

      const row = screen.getByRole('button', { name: CATEGORY })
      const describedBy = String(row.props['aria-describedby'] ?? '').split(' ')
      const errorId = idAround(screen.getByText(ERROR) as unknown as Host)
      const hintId = idAround(
        screen.getByText(hint, { includeHiddenElements: true }) as unknown as Host,
      )
      expect(describedBy).toContain(errorId)
      expect(describedBy).toContain(hintId)
    })

    it('shows the error on a row that cannot be touched, too', async () => {
      await renderWithProviders(
        <ListGroup>
          <ListRow label={CATEGORY} error={ERROR} />
        </ListGroup>,
      )

      expect(screen.getByText(CATEGORY)).toBeTruthy() // témoin
      expect(screen.getByText(ERROR)).toBeTruthy()
    })

    it('describes the row with nothing when there is no error (witness)', async () => {
      await renderWithProviders(
        <ListGroup>
          <ListRow label={CATEGORY} onPress={() => {}} />
        </ListGroup>,
      )

      expect(screen.getByRole('button', { name: CATEGORY }).props['aria-describedby']).toBeFalsy()
      expect(screen.queryByText(ERROR)).toBeNull()
    })
  })

  describe('on a phone', () => {
    it('shows the error and reads it after the name of the row', async () => {
      await renderWithProviders(
        <ListGroup>
          <ListRow label={CATEGORY} onPress={() => {}} error={ERROR} />
        </ListGroup>,
      )

      expect(screen.getByText(ERROR)).toBeTruthy()
      const row = screen.getByRole('button', { name: CATEGORY })
      expect(String(row.props.accessibilityHint ?? '')).toContain(ERROR)
    })
  })
})
