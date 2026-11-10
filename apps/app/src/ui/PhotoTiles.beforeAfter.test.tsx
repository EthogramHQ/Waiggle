// Tests des tuiles de photos dans la feuille « Nouvelle mise à jour » (R7a, relecture du plan,
// interface B1). Les tuiles servaient à la publication d'un projet : la première photo y est la
// couverture (badge « Couverture », « Mettre en couverture » dans le menu de la poignée). Une mise à
// jour n'a pas de couverture, mais elle peut montrer un avant / après : la première photo est
// « Avant », la deuxième « Après ». Deux props, fixées au lancement :
// - `badges?: (string | null)[]` : l'étiquette de chaque rang, montrée sur la tuile et lue dans son
//   nom (« Photo 1 sur 2, Avant ») ; `null` : pas d'étiquette à ce rang. Elle suit le rang, pas la
//   photo : une photo avancée en première place devient « Avant » ;
// - `cover?: boolean` : `false`, ni badge « Couverture » ni « Mettre en couverture » ; `true` par
//   défaut, la feuille de publication ne change pas.
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { type PhotoTile, PhotoTiles, type PhotoTilesLabels } from './PhotoTiles'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Les textes, tels que l'écran les donne (le composant ne connaît pas les clés) : ceux de la
// publication, que la feuille de la mise à jour reprend.
const labels: PhotoTilesLabels = {
  list: fr.t(($) => $.project.updates.photos),
  add: fr.t(($) => $.project.updates.addPhotos),
  addLabel: fr.t(($) => $.project.form.addPhotosLabel),
  cover: fr.t(($) => $.project.form.cover),
  tile: (number: number, cover: boolean) =>
    cover
      ? fr.t(($) => $.project.form.photoTileCover, { number })
      : fr.t(($) => $.project.form.photoTile, { number }),
  uploading: (number: number) => fr.t(($) => $.project.form.photoUploading, { number }),
  failed: (number: number, reason: string) =>
    fr.t(($) => $.project.form.photoFailed, { number, reason }),
  move: (number: number) => fr.t(($) => $.project.form.movePhoto, { number }),
  makeCover: fr.t(($) => $.project.form.makeCover),
  earlier: fr.t(($) => $.project.form.movePhotoEarlier),
  later: fr.t(($) => $.project.form.movePhotoLater),
  moved: (place: number) => fr.t(($) => $.project.form.photoMoved, { place }),
  remove: (number: number) => fr.t(($) => $.project.form.removePhoto, { number }),
  dropZone: fr.t(($) => $.project.form.dropZone),
  dropZoneChoose: fr.t(($) => $.project.form.dropZoneChoose),
}

const BEFORE = fr.t(($) => $.project.updates.before)
const AFTER = fr.t(($) => $.project.updates.after)
const COVER = labels.cover

/** Une photo prête : la fusée de jour, puis de nuit, puis vue de près. */
const tile = (n: number): PhotoTile => ({
  key: `photo-${n}`,
  image: { source: { uri: `https://api.example/${n}.webp` }, label: `La fusée, vue ${n}` },
  state: 'ready',
})
const tiles = (count: number) => Array.from({ length: count }, (_, i) => tile(i + 1))

/** Les tuiles d'une mise à jour en avant / après, qui gardent leur ordre comme le formulaire. */
const UpdateTiles = ({ start, onMove }: { start: PhotoTile[]; onMove?: jest.Mock }) => {
  const [list, setList] = useState(start)
  return (
    <PhotoTiles
      tiles={list}
      max={4}
      labels={labels}
      selectedKey={null}
      badges={[BEFORE, AFTER]}
      cover={false}
      onSelect={jest.fn()}
      onAdd={jest.fn()}
      onMove={(from, to) => {
        onMove?.(from, to)
        setList((current) => {
          const next = [...current]
          const [moved] = next.splice(from, 1)
          if (moved) next.splice(to, 0, moved)
          return next
        })
      }}
      onRemove={(key) => setList((current) => current.filter((one) => one.key !== key))}
    />
  )
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })

afterEach(() => jest.restoreAllMocks())

describe('PhotoTiles for an update, before / after (R7a)', () => {
  it('names the first two tiles « Avant » and « Après » and offers no cover', async () => {
    await renderWithProviders(<UpdateTiles start={tiles(3)} />)

    expect(button(/Photo 1.*Avant/)).toBeTruthy()
    expect(button(/Photo 2.*Après/)).toBeTruthy()
    // La troisième n'a pas d'étiquette (`badges` s'arrête au deuxième rang).
    expect(button(labels.tile(3, false))).toBeTruthy()
    expect(screen.queryByText(COVER, { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByRole('button', { name: /couverture/i })).toBeNull()

    // Le menu de la poignée : avancer et reculer, jamais « Mettre en couverture ».
    await fireEvent.press(button(labels.move(2)))
    expect(screen.getByRole('menuitem', { name: labels.earlier })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: labels.makeCover })).toBeNull()
  })

  it('shows « Avant » and « Après » on the tiles, once each', async () => {
    await renderWithProviders(<UpdateTiles start={tiles(2)} />)

    expect(screen.getAllByText(BEFORE, { includeHiddenElements: true })).toHaveLength(1)
    expect(screen.getAllByText(AFTER, { includeHiddenElements: true })).toHaveLength(1)
  })

  it('keeps « Avant » on the first place when another photo moves there', async () => {
    const onMove = jest.fn()
    await renderWithProviders(<UpdateTiles start={tiles(2)} onMove={onMove} />)

    await fireEvent.press(button(labels.move(2)))
    await fireEvent.press(screen.getByRole('menuitem', { name: labels.earlier }))

    expect(onMove).toHaveBeenLastCalledWith(1, 0)
    // La photo de nuit est passée devant : c'est elle, maintenant, la photo 1, « Avant ».
    expect(button(/Photo 1.*Avant/)).toBeTruthy()
    expect(button(/Photo 2.*Après/)).toBeTruthy()
  })

  it('offers no « Mettre en couverture » among the actions of a tile on a phone', async () => {
    await renderWithProviders(<UpdateTiles start={tiles(3)} />)

    const second = button(/Photo 2/)
    const actions = (second.props.accessibilityActions ?? []) as { label?: string }[]
    // Témoin : les autres gestes restent.
    expect(actions.map((action) => action.label)).toEqual(
      expect.arrayContaining([labels.earlier, labels.later]),
    )
    expect(actions.map((action) => action.label)).not.toContain(labels.makeCover)
  })

  it('keeps the cover of a project by default (témoin)', async () => {
    await renderWithProviders(
      <PhotoTiles
        tiles={tiles(2)}
        max={6}
        labels={labels}
        selectedKey={null}
        onSelect={jest.fn()}
        onAdd={jest.fn()}
        onMove={jest.fn()}
        onRemove={jest.fn()}
      />,
    )

    expect(button(labels.tile(1, true))).toBeTruthy()
    expect(screen.getAllByText(COVER, { includeHiddenElements: true })).toHaveLength(1)
    expect(screen.queryByText(BEFORE, { includeHiddenElements: true })).toBeNull()
  })
})
