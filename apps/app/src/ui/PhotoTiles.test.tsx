// Tests des tuiles de photos de la feuille de publication (R6a, « Les photos ») : une tuile par
// photo, le badge « Couverture » sur la première, une croix « Retirer la photo 2 », une poignée pour
// la déplacer ; une tuile « + Ajouter » tant qu'il reste de la place (6 au plus) ; une photo en
// cours d'envoi montre sa progression, une photo refusée dit pourquoi, les autres continuent ; sur
// ordinateur, une zone « Glisse tes images ici, ou choisis-les » où déposer des fichiers.
//
// Sans glisser (relecture du plan, ui-B1) : la poignée est un bouton « Déplacer la photo N » qui
// ouvre un menu (« Mettre en couverture », « Avancer », « Reculer ») ; le focus suit la photo
// déplacée et sa place est annoncée ; sur téléphone, les mêmes gestes sont des actions
// d'accessibilité de la tuile. Ce qui reprend `VisualEditor` (réduit à la couverture verticale) :
// boutons nommés d'après leur photo, limite de 6, focus gardé après un retrait (tuile voisine).
//
// L'interface attendue de `src/ui/PhotoTiles.tsx` (plan R6a, découpage, ligne U1) :
// `PhotoTiles({ tiles: PhotoTile[]; max; labels: PhotoTilesLabels; selectedKey: string | null;
// onSelect(key); onAdd(); onDropFiles?(files: File[]); onMove(from, to); onRemove(key); busy? })`,
// `PhotoTile = { key; image: CoverImage; state: 'ready' | 'uploading' | 'failed'; error?: string }`
// (`error` : la raison, « elle dépasse 5 Mo. »). `PhotoTilesLabels`, que le découpage ne détaille
// pas, est fixé ici (les clés `project.form.*`) : voir `labels` plus bas.
//
// Ce que Jest ne prouve pas (essai `--explore` de la session) : le glisser au doigt et à la souris,
// l'anneau miel, le badge à 200 % sur une tuile étroite (ui-M4).
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef, type ReactNode, useState } from 'react'
import { AccessibilityInfo, Platform, View } from 'react-native'
import { lendWebPage } from '../testing/arrivedFocus'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { type PhotoTile, PhotoTiles, type PhotoTilesLabels } from './PhotoTiles'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Les blancs de la typographie française (insécables, fines) ramenés à des espaces. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

// Les textes, tels que l'écran les donnera (le composant ne connaît pas les clés).
const labels: PhotoTilesLabels = {
  list: fr.t(($) => $.project.form.photosList),
  add: fr.t(($) => $.project.form.addPhotos),
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

/** Une photo prête ; `n` la suit d'un bout à l'autre (sa clé, son adresse). */
const tile = (n: number, state: PhotoTile['state'] = 'ready', error?: string): PhotoTile => ({
  key: `photo-${n}`,
  image: { source: { uri: `https://api.example/${n}.webp` }, label: `Un potager, vue ${n}` },
  state,
  ...(error ? { error } : null),
})
const tiles = (count: number) => Array.from({ length: count }, (_, i) => tile(i + 1))

const handlers = () => ({
  onSelect: jest.fn(),
  onAdd: jest.fn(),
  onDropFiles: jest.fn(),
  onMove: jest.fn(),
  onRemove: jest.fn(),
})

/** Les tuiles, qui gardent leur ordre comme le formulaire : déplacer et retirer changent la liste. */
const Sample = ({ start, on }: { start: PhotoTile[]; on: ReturnType<typeof handlers> }) => {
  const [list, setList] = useState(start)
  return (
    <PhotoTiles
      tiles={list}
      max={6}
      labels={labels}
      selectedKey={null}
      onSelect={on.onSelect}
      onAdd={on.onAdd}
      onDropFiles={on.onDropFiles}
      onMove={(from, to) => {
        on.onMove(from, to)
        setList((current) => {
          const next = [...current]
          const [moved] = next.splice(from, 1)
          if (moved) next.splice(to, 0, moved)
          return next
        })
      }}
      onRemove={(key) => {
        on.onRemove(key)
        setList((current) => current.filter((one) => one.key !== key))
      }}
    />
  )
}

const button = (name: string) => screen.getByRole('button', { name })

type Node = { props: Record<string, unknown>; parent: Node | null; children: (Node | string)[] }

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole

/** Le texte d'un élément et de ses enfants, mis bout à bout. */
const textOf = (node: Node | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('')

/** Le nom lu d'une vue native : son libellé, ou le premier texte qu'elle contient. */
const nameOf = (node: unknown): string => {
  const props = (node as { props?: Record<string, unknown> } | null)?.props
  if (!props) return ''
  const label = props.accessibilityLabel ?? props['aria-label']
  if (typeof label === 'string') return label
  const search = (child: unknown): string | undefined => {
    if (typeof child === 'string') return child
    if (Array.isArray(child)) {
      for (const one of child) {
        const found = search(one)
        if (found !== undefined) return found
      }
      return undefined
    }
    const childProps = (child as { props?: { children?: unknown } } | null)?.props
    return childProps ? search(childProps.children) : undefined
  }
  return search(props.children) ?? ''
}

/** Vrai si `message` a été annoncé : demandé à VoiceOver, ou écrit dans une région lue d'elle-même. */
const announced = (message: string): boolean => {
  const said = plain(message)
  const spoken = jest
    .mocked(AccessibilityInfo.announceForAccessibility)
    .mock.calls.some(([text]) => plain(String(text)) === said)
  if (spoken) return true
  const regions = [
    ...screen.queryAllByRole('status', { includeHiddenElements: true }),
    ...screen.queryAllByRole('alert', { includeHiddenElements: true }),
  ] as unknown as Node[]
  return regions.some((region) => plain(textOf(region)).includes(said))
}

/** Vrai si un ancêtre de l'élément est un bouton ou un lien. */
const insideControl = (element: unknown): boolean => {
  for (let parent = (element as Node).parent; parent; parent = parent.parent) {
    if (['button', 'link'].includes(String(roleOf(parent.props)))) return true
  }
  return false
}

/**
 * Le focus, écouté pendant un test. Sur le web, on écoute `focus` sur les vues natives (toutes
 * partagent le prototype de la vue témoin, comme `testing/arrivedFocus.tsx`) ; « cette place
 * contient-elle le focus ? » répond oui (comme `Screen.keepAside.test.tsx`). Sur téléphone, le
 * lecteur d'écran se pose sur une vue par `AccessibilityInfo.sendAccessibilityEvent(vue, 'focus')`,
 * comme `ActionMenu`. `names()` rend le nom de chaque vue qui a reçu le focus, lu au moment même.
 */
async function renderWatchingFocus(ui: ReactNode) {
  const probe = createRef<View>()
  await renderWithProviders(
    <>
      <View ref={probe} />
      {ui}
    </>,
  )
  type Patched = { contains?: unknown; focus?: unknown }
  const proto = Object.getPrototypeOf(probe.current) as Patched
  const hadContains = Object.hasOwn(proto, 'contains')
  const originalContains = proto.contains
  const hadFocus = Object.hasOwn(proto, 'focus')
  const originalFocus = proto.focus
  const names: string[] = []
  proto.contains = () => true
  proto.focus = function focus(this: unknown) {
    names.push(nameOf(this))
  }
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation((node, event) => {
    if (event === 'focus') names.push(nameOf(node))
  })
  return {
    names,
    restore: () => {
      if (hadContains) proto.contains = originalContains
      else delete proto.contains
      if (hadFocus) proto.focus = originalFocus
      else delete proto.focus
    },
  }
}

beforeEach(() => {
  // mockClear : le mock de React Native garde les annonces des tests précédents, que spyOn ne vide
  // pas ; sans lui, un témoin « rien n'est encore annoncé » échoue selon l'ordre des tests.
  jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => {})
    .mockClear()
})
afterEach(() => {
  jest.restoreAllMocks()
})

describe('PhotoTiles, the tiles', () => {
  it('names each tile after its photo and puts the cover badge on the first one only', async () => {
    await renderWithProviders(<Sample start={tiles(3)} on={handlers()} />)

    expect(button(labels.tile(1, true))).toBeTruthy()
    expect(button(labels.tile(2, false))).toBeTruthy()
    expect(button(labels.tile(3, false))).toBeTruthy()
    expect(screen.getAllByText(labels.cover, { includeHiddenElements: true })).toHaveLength(1)
  })

  it('selects a photo when its tile is touched', async () => {
    const on = handlers()
    await renderWithProviders(<Sample start={tiles(3)} on={on} />)

    await fireEvent.press(button(labels.tile(2, false)))

    expect(on.onSelect).toHaveBeenCalledWith('photo-2')
  })

  it('removes a photo from its named cross', async () => {
    const on = handlers()
    await renderWithProviders(<Sample start={tiles(3)} on={on} />)

    await fireEvent.press(button(labels.remove(2)))

    expect(on.onRemove).toHaveBeenCalledWith('photo-2')
    expect(screen.queryByRole('button', { name: labels.tile(3, false) })).toBeNull()
  })

  it('offers « Ajouter » until the sixth photo, never after', async () => {
    const on = handlers()
    const { rerender } = await renderWithProviders(
      <PhotoTiles tiles={tiles(5)} max={6} labels={labels} selectedKey={null} {...on} />,
    )
    await fireEvent.press(button(labels.addLabel))
    expect(on.onAdd).toHaveBeenCalledTimes(1)

    await rerender(
      <PhotoTiles tiles={tiles(6)} max={6} labels={labels} selectedKey={null} {...on} />,
    )

    expect(screen.queryByRole('button', { name: labels.addLabel })).toBeNull()
    expect(button(labels.tile(6, false))).toBeTruthy()
  })

  it('shows the selected tile as pressed, on the web and on the phone', async () => {
    const on = handlers()
    const { rerender } = await renderWithProviders(
      <PhotoTiles tiles={tiles(3)} max={6} labels={labels} selectedKey="photo-2" {...on} />,
    )
    // Sur téléphone : l'état « sélectionné », que VoiceOver et TalkBack annoncent.
    expect(screen.getByRole('button', { name: labels.tile(2, false), selected: true })).toBeTruthy()
    expect(screen.getByRole('button', { name: labels.tile(1, true), selected: false })).toBeTruthy()

    // Sur le web : `aria-pressed` (voir `pressed` dans aria.ts).
    jest.replaceProperty(Platform, 'OS', 'web')
    await rerender(
      <PhotoTiles tiles={tiles(3)} max={6} labels={labels} selectedKey="photo-3" {...on} />,
    )
    expect(button(labels.tile(3, false)).props['aria-pressed']).toBe(true)
    expect(button(labels.tile(2, false)).props['aria-pressed']).toBe(false)
  })

  it('never puts the remove or move button inside the tile button', async () => {
    await renderWithProviders(<Sample start={tiles(2)} on={handlers()} />)

    // Témoins : les deux boutons existent ; puis aucun n'est dans un autre bouton.
    const remove = button(labels.remove(2))
    const move = button(labels.move(2))
    expect(insideControl(remove)).toBe(false)
    expect(insideControl(move)).toBe(false)
    expect(insideControl(button(labels.tile(2, false)))).toBe(false)
  })
})

describe('PhotoTiles, changing the order without dragging', () => {
  /** Ouvre le menu de la photo `number` et choisit `action`. */
  const moveFromMenu = async (number: number, action: string) => {
    await fireEvent.press(button(labels.move(number)))
    await fireEvent.press(screen.getByRole('menuitem', { name: action }))
  }

  it('moves a photo without dragging, from a visible button', async () => {
    const on = handlers()
    await renderWithProviders(<Sample start={tiles(3)} on={on} />)

    await moveFromMenu(2, labels.earlier)
    expect(on.onMove).toHaveBeenLastCalledWith(1, 0)

    // La photo 2 est devenue la couverture ; l'ancienne couverture est maintenant la photo 2.
    await moveFromMenu(2, labels.later)
    expect(on.onMove).toHaveBeenLastCalledWith(1, 2)

    await moveFromMenu(3, labels.makeCover)
    expect(on.onMove).toHaveBeenLastCalledWith(2, 0)
    expect(on.onMove).toHaveBeenCalledTimes(3)
  })

  it('offers make cover, earlier and later as accessibility actions on each tile (native)', async () => {
    const on = handlers()
    await renderWithProviders(
      <PhotoTiles tiles={tiles(3)} max={6} labels={labels} selectedKey={null} {...on} />,
    )
    const second = button(labels.tile(2, false))
    const actions = (second.props.accessibilityActions ?? []) as { name: string; label?: string }[]
    const named = (label: string) => {
      const found = actions.find((action) => action.label === label)
      expect(found).toBeDefined()
      return found?.name ?? ''
    }

    expect(actions.map((action) => action.label)).toEqual(
      expect.arrayContaining([labels.makeCover, labels.earlier, labels.later]),
    )
    await fireEvent(second, 'accessibilityAction', {
      nativeEvent: { actionName: named(labels.earlier) },
    })
    expect(on.onMove).toHaveBeenLastCalledWith(1, 0)
    await fireEvent(second, 'accessibilityAction', {
      nativeEvent: { actionName: named(labels.later) },
    })
    expect(on.onMove).toHaveBeenLastCalledWith(1, 2)
    await fireEvent(second, 'accessibilityAction', {
      nativeEvent: { actionName: named(labels.makeCover) },
    })
    expect(on.onMove).toHaveBeenLastCalledWith(1, 0)
  })

  it('keeps the focus on the moved photo and announces its new place', async () => {
    const on = handlers()
    const focus = await renderWatchingFocus(<Sample start={tiles(3)} on={on} />)
    try {
      expect(announced(labels.moved(1))).toBe(false) // témoin : rien n'est dit avant le geste

      await moveFromMenu(2, labels.earlier)

      expect(on.onMove).toHaveBeenLastCalledWith(1, 0)
      // La photo déplacée est maintenant la première : son focus la suit, sur sa tuile ou sur
      // son bouton « Déplacer » (jamais sur la photo qui a pris son ancienne place).
      expect([labels.tile(1, true), labels.move(1)]).toContain(focus.names.at(-1))
      expect(announced(labels.moved(1))).toBe(true)
    } finally {
      focus.restore()
    }
  })
})

describe('PhotoTiles, the focus on the web', () => {
  let restorePage: () => void
  beforeEach(() => {
    restorePage = lendWebPage()
  })
  afterEach(() => {
    restorePage()
  })

  it('gives the focus to the neighbouring tile when a photo is removed', async () => {
    const on = handlers()
    const focus = await renderWatchingFocus(<Sample start={tiles(3)} on={on} />)
    try {
      await fireEvent.press(button(labels.remove(2)))

      expect(on.onRemove).toHaveBeenCalledWith('photo-2')
      // La voisine : celle qui a pris sa place (l'ancienne photo 3), ou celle d'avant ; son
      // bouton de tuile, de déplacement ou de retrait. Jamais rien, jamais « Ajouter ».
      const neighbours = [1, 2].flatMap((n) => [
        labels.tile(n, n === 1),
        labels.move(n),
        labels.remove(n),
      ])
      expect(neighbours).toContain(focus.names.at(-1))
    } finally {
      focus.restore()
    }
  })

  it('gives the focus to the last tile when the sixth photo hides « Ajouter »', async () => {
    const on = handlers()
    const ui = (count: number) => (
      <PhotoTiles tiles={tiles(count)} max={6} labels={labels} selectedKey={null} {...on} />
    )
    const probe = createRef<View>()
    const { rerender } = await renderWithProviders(
      <>
        <View ref={probe} />
        {ui(5)}
      </>,
    )
    type Patched = { contains?: unknown; focus?: unknown }
    const proto = Object.getPrototypeOf(probe.current) as Patched
    const hadFocus = Object.hasOwn(proto, 'focus')
    const hadContains = Object.hasOwn(proto, 'contains')
    const originalFocus = proto.focus
    const originalContains = proto.contains
    const names: string[] = []
    // « Ajouter » a le focus du clavier : son `onFocus` a eu lieu, et sa place le contient.
    proto.contains = () => true
    proto.focus = function focus(this: unknown) {
      names.push(nameOf(this))
    }
    try {
      const add = button(labels.addLabel)
      await fireEvent(add, 'focus')
      await fireEvent.press(add)
      // La sixième photo arrive : « Ajouter » disparaît.
      await rerender(
        <>
          <View ref={probe} />
          {ui(6)}
        </>,
      )

      expect(screen.queryByRole('button', { name: labels.addLabel })).toBeNull() // témoin
      expect([labels.tile(6, false), labels.move(6), labels.remove(6)]).toContain(names.at(-1))
    } finally {
      if (hadContains) proto.contains = originalContains
      else delete proto.contains
      if (hadFocus) proto.focus = originalFocus
      else delete proto.focus
    }
  })
})

describe('PhotoTiles, sending and refusing', () => {
  it('names an uploading tile as a progress bar', async () => {
    await renderWithProviders(
      <PhotoTiles
        tiles={[tile(1), tile(2, 'uploading')]}
        max={6}
        labels={labels}
        selectedKey={null}
        {...handlers()}
      />,
    )

    expect(screen.getByRole('progressbar', { name: labels.uploading(2) })).toBeTruthy()
    expect(screen.queryByRole('progressbar', { name: labels.uploading(1) })).toBeNull()
    expect(button(labels.tile(1, true))).toBeTruthy()
  })

  it('reads and announces why a photo failed, the others staying ready', async () => {
    const reason = fr.t(($) => $.project.form.photoTooLarge)
    const sentence = plain(labels.failed(2, reason))
    const on = handlers()
    const { rerender } = await renderWithProviders(
      <PhotoTiles
        tiles={[tile(1), tile(2, 'uploading'), tile(3)]}
        max={6}
        labels={labels}
        selectedKey={null}
        {...on}
      />,
    )
    expect(announced(sentence)).toBe(false) // témoin : rien n'a encore échoué

    await rerender(
      <PhotoTiles
        tiles={[tile(1), tile(2, 'failed', reason), tile(3)]}
        max={6}
        labels={labels}
        selectedKey={null}
        {...on}
      />,
    )

    // La raison est écrite sous la tuile, et annoncée.
    expect(screen.getByText(sentence)).toBeTruthy()
    expect(announced(sentence)).toBe(true)
    // Les autres photos restent là, prêtes ; la photo refusée peut être retirée.
    expect(button(labels.tile(1, true))).toBeTruthy()
    expect(button(labels.tile(3, false))).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
    await fireEvent.press(button(labels.remove(2)))
    expect(on.onRemove).toHaveBeenCalledWith('photo-2')
  })
})

describe('PhotoTiles, the drop zone (web)', () => {
  type Listener = (event: unknown) => void

  it('accepts dropped files only, and ignores a tile dragged onto the drop zone (web)', async () => {
    const restorePage = lendWebPage()
    // La zone de dépôt n'existe que sur ordinateur (scénario R6a, relecture du design).
    const restoreWindow = setDesktopWindow()
    const probe = createRef<View>()
    // react-native-web ne transmet pas `onDrop` au navigateur : la zone écoute `drop` par
    // `addEventListener` sur sa vue. On note ces écoutes (sur le prototype des vues natives), et on
    // accepte aussi une propriété `onDrop`, au cas où.
    type Patched = { addEventListener?: unknown }
    const listeners: Listener[] = []
    const on = handlers()
    try {
      await renderWithProviders(<View ref={probe} />)
      const proto = Object.getPrototypeOf(probe.current) as Patched
      const had = Object.hasOwn(proto, 'addEventListener')
      const original = proto.addEventListener
      proto.addEventListener = (type: string, listener: Listener) => {
        if (type === 'drop') listeners.push(listener)
      }
      try {
        await renderWithProviders(
          <PhotoTiles tiles={tiles(2)} max={6} labels={labels} selectedKey={null} {...on} />,
        )
      } finally {
        if (had) proto.addEventListener = original
        else delete proto.addEventListener
      }

      // La zone se lit : « Glisse tes images ici, ou », puis le bouton « choisis-les ».
      expect(screen.getByText(labels.dropZone)).toBeTruthy()
      await fireEvent.press(button(labels.dropZoneChoose))
      expect(on.onAdd).toHaveBeenCalledTimes(1)

      // Les écoutes de `drop` : celles de `addEventListener`, ou la propriété `onDrop` d'un ancêtre
      // du texte de la zone.
      for (
        let node = (screen.getByText(labels.dropZone) as unknown as Node).parent;
        node;
        node = node.parent
      ) {
        if (typeof node.props.onDrop === 'function') listeners.push(node.props.onDrop as Listener)
      }
      expect(listeners.length).toBeGreaterThan(0)
      const drop = (dataTransfer: object) => {
        for (const listener of listeners) {
          listener({
            type: 'drop',
            preventDefault: () => {},
            stopPropagation: () => {},
            dataTransfer,
            nativeEvent: { dataTransfer },
          })
        }
      }

      // Une tuile glissée sur la zone (elle porte du texte, pas de fichier) : rien n'est ajouté.
      drop({ files: [], types: ['text/plain'], items: [] })
      expect(on.onDropFiles).not.toHaveBeenCalled()

      // Deux fichiers déposés : ils sont ajoutés, comme par le bouton.
      const files = [
        new File(['a'], 'potager.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'semis.png', { type: 'image/png' }),
      ]
      drop({ files, types: ['Files'], items: [] })
      expect(on.onDropFiles).toHaveBeenCalledTimes(1)
      expect(on.onDropFiles.mock.calls[0]?.[0]).toEqual(files)
    } finally {
      restoreWindow()
      restorePage()
    }
  })
})
