// Tests du champ vide d'un formulaire qui charge (R16, scénario « Les squelettes » : « les
// formulaires (profil, réglages) montrent des champs vides »). Le cas simple est dans
// TextField.test.tsx ; ici, la bio (plusieurs lignes) et des champs vides rangés dans un
// `FieldGroup`, comme les vrais champs du profil. Une pièce vide n'a ni rôle ni nom : c'est le
// `Loading` de la zone qui dit « Chargement… », une seule fois.
import { screen } from '@testing-library/react-native'
import { emptyPiece, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { Loading } from './Skeleton'
import { FieldGroup, TextFieldSkeleton } from './TextField'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('TextFieldSkeleton', () => {
  it('draws the empty field of a text of several lines, without any role or name', async () => {
    await renderWithProviders(
      <PieceHost>
        <TextFieldSkeleton multiline />
      </PieceHost>,
    )

    const { drawn, spoken } = emptyPiece()
    expect(drawn).toBeGreaterThan(0)
    expect(spoken).toEqual([])
  })

  it('stands in a group of fields like a real field, without any role or name', async () => {
    await renderWithProviders(
      <PieceHost>
        <FieldGroup>
          <TextFieldSkeleton />
          <TextFieldSkeleton />
        </FieldGroup>
      </PieceHost>,
    )

    const { drawn, spoken } = emptyPiece()
    expect(drawn).toBeGreaterThan(0)
    expect(spoken).toEqual([])
  })

  it('leaves the single loading name to the zone that waits', async () => {
    await renderWithProviders(
      <Loading shown>
        <TextFieldSkeleton />
        <TextFieldSkeleton multiline />
      </Loading>,
    )

    expect(screen.getAllByRole('progressbar', { name: 'Chargement…' })).toHaveLength(1)
    expect(screen.queryByText('Chargement…')).toBeNull()
  })
})
