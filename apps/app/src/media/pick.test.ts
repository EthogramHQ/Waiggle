// Tests de la préparation des photos de projet avant l'envoi (l'avatar est testé dans
// profile/api.test.ts). La galerie et l'outil de retouche du téléphone sont remplacés par des faux,
// qui enregistrent ce qu'on leur demande.
import * as ImagePicker from 'expo-image-picker'
import { pickImage } from './pick'

const mockContext = {
  crop: jest.fn(),
  resize: jest.fn(),
  renderAsync: jest.fn(),
}
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }))
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: () => mockContext },
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
