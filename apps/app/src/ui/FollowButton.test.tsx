// Tests de la pastille « Suivre » posée sur la photo d'une carte d'Explorer (refonte, tranche R3,
// « Suivre l'auteur depuis une carte ») : FollowButton en variante `chip`. C'est une pastille de
// verre (jamais le miel du bouton principal : la photo garde la vedette), qui reste un
// interrupteur : « Suivre Nora », non coché ; touchée, elle dit « Tu suis Nora » et passe à coché.
// La coche « ✓ » se voit mais ne se lit pas (relecture de l'interface du plan, « À noter »). Sa zone
// à toucher fait 44 points, une double tape ne compte qu'une fois, et la retoucher plus tard arrête
// de suivre (relecture juridique du plan, jur-J8 : on se désabonne du même geste qu'on s'abonne).
//
// Les tests du bouton ordinaire (pages de membre et de projet) restent dans components.test.tsx,
// sauf celui de son icône (relecture de design de R3), en fin de fichier.
import { layout, palettes } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { FollowButton } from './FollowButton'
import { iconPaths } from './icons.generated'
import { TAP_GUARD_MS } from './tapGuard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const name = 'Nora'
const follow = fr.t(($) => $.follow.member, { name })
const following = fr.t(($) => $.follow.memberFollowing, { name })

/**
 * La pastille telle qu'un écran la pose : l'écran garde l'état « suivi » (ici un useState, là-bas
 * le cache de React Query, changé au toucher) et donne les textes selon cet état. Le nom lu et le
 * texte affiché sont les mêmes (« Suivre Nora », puis « Tu suis Nora ») ; la coche s'ajoute à
 * l'affichage, par le composant.
 */
const Chip = ({ onPress, initial = false }: { onPress: () => void; initial?: boolean }) => {
  // useState : une valeur gardée par React d'un rendu à l'autre ; la changer redessine la pastille.
  const [followed, setFollowed] = useState(initial)
  const text = followed ? following : follow
  return (
    <FollowButton
      variant="chip"
      followed={followed}
      label={text}
      text={text}
      onPress={() => {
        onPress()
        setFollowed((value) => !value)
      }}
    />
  )
}

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; children: (Node | string)[] }

/** Les couleurs de fond de l'élément et de tout ce qu'il contient (la pilule est dans un cadre). */
const backgrounds = (node: Node | string): unknown[] => {
  if (typeof node === 'string') return []
  const own = (StyleSheet.flatten(node.props.style as never) as { backgroundColor?: unknown })
    ?.backgroundColor
  return [own, ...node.children.flatMap(backgrounds)].filter((value) => value !== undefined)
}

/**
 * La hauteur de la zone qu'on peut toucher : celle de l'élément touchable (sa hauteur minimale),
 * plus le débord invisible (hitSlop) en haut et en bas. Même mesure que components.test.tsx.
 */
const touchHeight = (node: ReturnType<typeof screen.getByRole>): number => {
  const style = StyleSheet.flatten(node.props.style) as { minHeight?: unknown; height?: unknown }
  const own = Math.max(
    typeof style?.minHeight === 'number' ? style.minHeight : 0,
    typeof style?.height === 'number' ? style.height : 0,
  )
  const slop: unknown = node.props.hitSlop
  const extra =
    typeof slop === 'number'
      ? 2 * slop
      : slop && typeof slop === 'object'
        ? Number((slop as { top?: number }).top ?? 0) +
          Number((slop as { bottom?: number }).bottom ?? 0)
        : 0
  return own + extra
}

describe('FollowButton, as a chip on a photo', () => {
  it('is a switch « Suivre Nora », not checked, showing the same words', async () => {
    await renderWithProviders(<Chip onPress={() => {}} />)

    const chip = screen.getByRole('switch', { name: follow })
    expect(chip).not.toBeChecked()
    expect(screen.getByText(follow)).toBeTruthy()
  })

  // Une pastille de verre, pas le bouton miel : sur une photo, une seule chose attire l'œil (la
  // carte elle-même) ; le miel est gardé pour l'action principale de la page.
  it('is a glass chip, never the honey of a main button', async () => {
    await renderWithProviders(<Chip onPress={() => {}} />)

    const chip = screen.getByRole('switch', { name: follow })
    const colors = backgrounds(chip as unknown as Node)
    expect(colors).not.toContain(palettes.day.honey)
    expect(colors).not.toContain(palettes.day.honeyDisabled)
  })

  it('says « Tu suis Nora » once touched, checked, the tick shown but not read', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<Chip onPress={onPress} />)

    await fireEvent.press(screen.getByRole('switch', { name: follow }))

    expect(onPress).toHaveBeenCalledTimes(1)
    // Le nom lu, exactement : « Tu suis Nora », sans la coche (un signe n'est pas un mot).
    const chip = screen.getByRole('switch', { name: following })
    expect(chip).toBeChecked()
    expect(String(chip.props.accessibilityLabel ?? chip.props['aria-label'])).not.toContain('✓')
    // Ce qui se voit : « Tu suis Nora », suivi ou non de la coche dessinée.
    expect(
      screen.getByText(new RegExp(`^${following}`), { includeHiddenElements: true }),
    ).toBeTruthy()
    expect(screen.queryByRole('switch', { name: follow })).toBeNull()
  })

  it('gives a touch zone of at least 44 points, followed or not', async () => {
    await renderWithProviders(<Chip onPress={() => {}} />)

    expect(touchHeight(screen.getByRole('switch', { name: follow }))).toBeGreaterThanOrEqual(
      layout.touchTarget,
    )
    await fireEvent.press(screen.getByRole('switch', { name: follow }))
    expect(touchHeight(screen.getByRole('switch', { name: following }))).toBeGreaterThanOrEqual(
      layout.touchTarget,
    )
  })

  // La pastille est petite et posée sur une carte qu'on fait défiler : une double tape ne doit pas
  // suivre puis aussitôt ne plus suivre. Même garde que les fenêtres et « Tester » (TAP_GUARD_MS).
  describe('against a double tap', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('follows once for two taps in a row, and stays followed', async () => {
      const onPress = jest.fn()
      await renderWithProviders(<Chip onPress={onPress} />)

      await fireEvent.press(screen.getByRole('switch', { name: follow }))
      await fireEvent.press(screen.getByRole('switch', { name: following }))

      expect(onPress).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('switch', { name: following })).toBeChecked()
    })

    // jur-J8 : « Tu suis Nora ✓ » n'est pas un état figé. La retoucher, plus tard, arrête de
    // suivre : la pastille redevient « Suivre Nora », non cochée.
    it('stops following when « Tu suis Nora » is touched again later (jur-J8)', async () => {
      const onPress = jest.fn()
      await renderWithProviders(<Chip onPress={onPress} />)

      await fireEvent.press(screen.getByRole('switch', { name: follow }))
      await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
      await fireEvent.press(screen.getByRole('switch', { name: following }))

      expect(onPress).toHaveBeenCalledTimes(2)
      const chip = screen.getByRole('switch', { name: follow })
      expect(chip).not.toBeChecked()
    })
  })

  // Arrivé sur une carte dont on suit déjà l'auteur (il vient de le suivre ailleurs) : la pastille
  // le dit, et un toucher arrête de suivre.
  it('stops following from a chip that starts followed (jur-J8)', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<Chip onPress={onPress} initial />)

    const chip = screen.getByRole('switch', { name: following })
    expect(chip).toBeChecked()
    await fireEvent.press(chip)

    expect(onPress).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('switch', { name: follow })).not.toBeChecked()
  })
})

/** Les tracés SVG dessinés dans l'élément et tout ce qu'il contient (les `d` des `Path`). */
const pathsIn = (node: Node | string): string[] => {
  if (typeof node === 'string') return []
  const own = typeof node.props.d === 'string' ? [node.props.d] : []
  return [...own, ...node.children.flatMap(pathsIn)]
}

// Relecture de design de R3 (#8) : sur la page d'un autre membre, au téléphone, « + Suivre » et le
// « + » de Publier, dans la barre d'onglets, étaient deux ronds miel au même signe, pour deux gestes
// différents. Le bouton dessine une personne avec un « + », comme la pastille et la planche
// R3-Membre ; son nom lu ne change pas.
describe('FollowButton, as the button of a page', () => {
  it('draws a person with a plus, not the plain plus of « Publier »', async () => {
    await renderWithProviders(
      <FollowButton followed={false} onPress={jest.fn()} label={follow} text="Suivre" />,
    )

    const button = screen.getByRole('switch', { name: follow })
    const drawn = pathsIn(button as unknown as Node)
    expect(drawn).toEqual(iconPaths['user-plus'])
    expect(drawn).not.toEqual(iconPaths.plus)
  })

  it('draws the tick once followed, with the same name read', async () => {
    await renderWithProviders(
      <FollowButton followed onPress={jest.fn()} label={following} text={following} />,
    )

    const button = screen.getByRole('switch', { name: following })
    expect(button).toBeChecked()
    expect(pathsIn(button as unknown as Node)).toEqual(iconPaths.check)
  })
})
