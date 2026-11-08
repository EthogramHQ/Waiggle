// Tests de la préparation des photos de projet avant l'envoi (l'avatar est testé dans
// profile/api.test.ts). La galerie et l'outil de retouche du téléphone sont remplacés par des faux,
// qui enregistrent ce qu'on leur demande.
//
// R6a (scénario « Les photos ») : `pickVisuals(slot, remaining, onChosen)` choisit plusieurs photos
// d'un coup, jusqu'à compléter les 6 (`selectionLimit: remaining`), et prépare chacune comme
// `pickImage` le fait pour une seule (mêmes contrôles par fichier). Interface attendue (plan R6a,
// découpage, ligne U1) : `onChosen(images)` est appelé une fois, dès le choix, avec les images
// choisies, jamais si le membre annule ; la promesse rend les images préparées, dans l'ordre du
// choix (une liste vide si le membre annule).
import * as ImagePicker from 'expo-image-picker'
import { pickImage, pickVisuals } from './pick'

const mockContext = {
  crop: jest.fn(),
  resize: jest.fn(),
  renderAsync: jest.fn(),
}
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }))
// L'adresse de chaque photo passée à l'outil de retouche (R6a : une préparation par fichier).
const mockManipulate = jest.fn((_uri: string) => mockContext)
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: (uri: string) => mockManipulate(uri) },
  SaveFormat: { JPEG: 'jpeg' },
}))

const picked = (width: number, height: number) =>
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///photo.jpg', width, height }],
  } as ImagePicker.ImagePickerResult)

beforeEach(() => {
  mockContext.crop.mockReset().mockReturnValue(mockContext)
  mockContext.resize.mockReset().mockReturnValue(mockContext)
  mockContext.renderAsync.mockReset().mockResolvedValue({
    saveAsync: jest.fn().mockResolvedValue({ uri: 'file:///prepared.jpg' }),
  })
})

describe('pickImage for a gallery photo', () => {
  it('keeps the proportions and reduces the photo to 2 048 px at most', async () => {
    picked(4000, 3000)

    expect(await pickImage('free')).toEqual({
      uri: 'file:///prepared.jpg',
      width: 2048,
      height: 1536,
    })
    expect(mockContext.crop).not.toHaveBeenCalled()
    expect(mockContext.resize).toHaveBeenCalledWith({ width: 2048, height: 1536 })
  })

  it('says a photo was chosen before preparing it, and never when the member cancels', async () => {
    picked(4000, 3000)
    const onChosen = jest.fn()
    await pickImage('free', onChosen)
    expect(onChosen).toHaveBeenCalledTimes(1)

    jest
      .mocked(ImagePicker.launchImageLibraryAsync)
      .mockResolvedValue({ canceled: true, assets: null } as ImagePicker.ImagePickerResult)
    const onCancelled = jest.fn()
    expect(await pickImage('free', onCancelled)).toBeNull()
    expect(onCancelled).not.toHaveBeenCalled()
  })

  it('does not crop: the member chooses freely', async () => {
    picked(1200, 1600)

    await pickImage('free')

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ allowsEditing: false }),
    )
  })
})

describe('pickImage for the vertical cover', () => {
  it('offers a 9:16 crop on the phone', async () => {
    picked(1080, 1920)

    await pickImage('portrait')

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ allowsEditing: true, aspect: [9, 16] }),
    )
  })

  it('crops a landscape photo to a centred 9:16 strip (the web cannot crop when choosing)', async () => {
    picked(1920, 1080)

    const result = await pickImage('portrait')

    // 1 080 × 9 / 16 = 607 pixels de large, au centre.
    expect(mockContext.crop).toHaveBeenCalledWith({
      originX: 656,
      originY: 0,
      width: 607,
      height: 1080,
    })
    expect(result).toMatchObject({ width: 607, height: 1080 })
  })
})

// --- R6a : plusieurs photos d'un coup ---------------------------------------------------------

/** La galerie rend ces photos, dans cet ordre (le membre en a choisi plusieurs). */
const pickedMany = (sizes: [number, number][]) =>
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: sizes.map(([width, height], index) => ({
      uri: `file:///photo-${index + 1}.jpg`,
      width,
      height,
    })),
  } as ImagePicker.ImagePickerResult)

describe('pickVisuals for the photos of a project (R6a)', () => {
  beforeEach(() => {
    mockManipulate.mockClear()
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockClear()
    // Chaque préparation rend sa propre adresse : on suit ainsi chaque photo jusqu'au bout.
    let saved = 0
    mockContext.renderAsync.mockImplementation(async () => {
      saved += 1
      const uri = `file:///prepared-${saved}.jpg`
      return { saveAsync: jest.fn().mockResolvedValue({ uri }) }
    })
  })

  it('lets the member choose several photos at once, up to the places left', async () => {
    pickedMany([[800, 600]])

    await pickVisuals('gallery', 4, () => {})

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 4,
        // Choisir plusieurs photos et recadrer ne vont pas ensemble : la galerie ne recadre pas.
        allowsEditing: false,
      }),
    )
  })

  it('asks for the places left, never more: 1 when five photos are already there', async () => {
    pickedMany([[800, 600]])

    await pickVisuals('gallery', 1, () => {})

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ selectionLimit: 1 }),
    )
  })

  it('prepares each photo on its own, like a single one, and keeps the order chosen', async () => {
    // La première est grande (réduite à 2 048 px), la seconde petite (gardée telle quelle).
    pickedMany([
      [4000, 3000],
      [1200, 1600],
    ])

    const images = await pickVisuals('gallery', 6, () => {})

    expect(mockManipulate.mock.calls.map(([uri]) => uri)).toEqual([
      'file:///photo-1.jpg',
      'file:///photo-2.jpg',
    ])
    expect(mockContext.resize).toHaveBeenCalledTimes(1)
    expect(mockContext.resize).toHaveBeenCalledWith({ width: 2048, height: 1536 })
    expect(mockContext.crop).not.toHaveBeenCalled()
    expect(images).toEqual([
      { uri: 'file:///prepared-1.jpg', width: 2048, height: 1536 },
      { uri: 'file:///prepared-2.jpg', width: 1200, height: 1600 },
    ])
  })

  it('says once which photos were chosen, before preparing them, and never on cancel', async () => {
    pickedMany([
      [800, 600],
      [600, 800],
      [500, 500],
    ])
    // Au moment où l'écran apprend le choix, aucune photo n'est encore préparée : il peut montrer
    // trois tuiles « en cours d'envoi » tout de suite.
    let preparedWhenChosen = -1
    const onChosen = jest.fn((_images: unknown[]) => {
      preparedWhenChosen = mockManipulate.mock.calls.length
    })

    await pickVisuals('gallery', 6, onChosen)

    expect(onChosen).toHaveBeenCalledTimes(1)
    expect(onChosen.mock.calls[0]?.[0]).toHaveLength(3)
    expect(preparedWhenChosen).toBe(0)

    jest
      .mocked(ImagePicker.launchImageLibraryAsync)
      .mockResolvedValue({ canceled: true, assets: null } as ImagePicker.ImagePickerResult)
    const onCancelled = jest.fn()
    expect(await pickVisuals('gallery', 6, onCancelled)).toEqual([])
    expect(onCancelled).not.toHaveBeenCalled()
  })

  it('keeps a single 9:16 photo for the vertical cover', async () => {
    pickedMany([[1920, 1080]])

    const images = await pickVisuals('portrait', 1, () => {})

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.not.objectContaining({ allowsMultipleSelection: true }),
    )
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ allowsEditing: true, aspect: [9, 16] }),
    )
    // Plus large que haute (le web ne recadre pas au choix) : la bande du centre, comme pickImage.
    expect(mockContext.crop).toHaveBeenCalledWith({
      originX: 656,
      originY: 0,
      width: 607,
      height: 1080,
    })
    expect(images).toEqual([{ uri: 'file:///prepared-1.jpg', width: 607, height: 1080 }])
  })
})
