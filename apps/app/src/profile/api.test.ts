// Tests de la préparation d'une photo avant envoi. La galerie et l'outil de retouche du téléphone
// sont remplacés par des faux, qui enregistrent ce qu'on leur demande.
import * as ImagePicker from 'expo-image-picker'
import { pickAvatar } from './api'

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
jest.mock('../api/client', () => ({ request: jest.fn() }))

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

describe('pickAvatar', () => {
  it('crops a landscape photo to a centred square, then reduces it to 1024 px', async () => {
    picked(3000, 2000)

    expect(await pickAvatar()).toEqual({ uri: 'file:///prepared.jpg' })
    expect(mockContext.crop).toHaveBeenCalledWith({
      originX: 500,
      originY: 0,
      width: 2000,
      height: 2000,
    })
    expect(mockContext.resize).toHaveBeenCalledWith({ width: 1024, height: 1024 })
  })

  it('leaves a small square picture as it is', async () => {
    picked(800, 800)

    await pickAvatar()

    expect(mockContext.crop).not.toHaveBeenCalled()
    expect(mockContext.resize).not.toHaveBeenCalled()
  })

  it('gives nothing back when the member cancels', async () => {
    jest
      .mocked(ImagePicker.launchImageLibraryAsync)
      .mockResolvedValue({ canceled: true, assets: null } as ImagePicker.ImagePickerResult)

    expect(await pickAvatar()).toBeNull()
  })
})
