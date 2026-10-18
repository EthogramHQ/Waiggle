// Tests du traitement des avatars, sans API autour : on donne des octets, on regarde ce qui sort.
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { jpegImage, photoWithGps, pngBomb, pngImage } from '../testing/images'
import { processAvatar } from './avatar'

describe('processAvatar', () => {
  it('turns a photo into a 512 × 512 WebP square', async () => {
    const result = await processAvatar(await photoWithGps())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const info = await sharp(result.data).metadata()
    expect(info).toMatchObject({ format: 'webp', width: 512, height: 512 })
  })

  it('removes every metadata, starting with the GPS position', async () => {
    const input = await photoWithGps()
    // On vérifie d'abord que la photo de départ contient bien des métadonnées…
    expect((await sharp(input).metadata()).exif).toBeDefined()

    const result = await processAvatar(input)

    // … puis qu'il n'en reste aucune.
    if (!result.ok) throw new Error('processing failed')
    const info = await sharp(result.data).metadata()
    expect(info.exif).toBeUndefined()
    expect(info.icc).toBeUndefined()
    expect(info.xmp).toBeUndefined()
  })

  it('accepts PNG images too', async () => {
    const result = await processAvatar(await pngImage())

    expect(result.ok).toBe(true)
  })

  it('refuses anything that is not a JPEG, PNG or WebP image', async () => {
    const text = new TextEncoder().encode('ceci n’est pas une image')
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } })
      .gif()
      .toBuffer()

    expect(await processAvatar(text)).toEqual({ ok: false, reason: 'unsupported' })
    expect(await processAvatar(gif)).toEqual({ ok: false, reason: 'unsupported' })
  })

  it('accepts an ordinary phone photo of 12 megapixels', async () => {
    const result = await processAvatar(await jpegImage(4032, 3024))

    expect(result.ok).toBe(true)
  })

  it('refuses a decompression bomb: a tiny file announcing a huge picture', async () => {
    // 5 000 × 5 000 = 25 millions de pixels, dans un fichier de quelques dizaines de Ko.
    const bomb = pngBomb(5000, 5000)
    expect(bomb.length).toBeLessThan(100_000)
    expect(await sharp(bomb).metadata()).toMatchObject({ width: 5000, height: 5000 })

    expect(await processAvatar(bomb)).toEqual({ ok: false, reason: 'unsupported' })
  })

  it('refuses a very elongated picture, costly to process', async () => {
    // Une bande 5 fois plus large que haute (le traitement de ces formes coûte cher en mémoire).
    expect(await processAvatar(await jpegImage(2500, 500))).toEqual({
      ok: false,
      reason: 'unsupported',
    })
  })

  it('refuses a 16-bit image, twice as costly to decode for no visible gain', async () => {
    const deep = await sharp({
      create: { width: 200, height: 200, channels: 4, background: '#3b6ea8' },
    })
      .toColourspace('rgb16')
      .png()
      .toBuffer()
    expect((await sharp(deep).metadata()).depth).toBe('ushort')

    expect(await processAvatar(deep)).toEqual({ ok: false, reason: 'unsupported' })
  })
})
