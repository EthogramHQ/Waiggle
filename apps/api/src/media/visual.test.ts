// Tests du traitement des visuels de projet, sans API autour : on donne des octets, on regarde ce
// qui sort (comme avatar.test.ts pour les avatars).
import { Thumbhash } from '@ruche/contracts'
import sharp from 'sharp'
import { thumbHashToAverageRGBA } from 'thumbhash'
import { describe, expect, it } from 'vitest'
import { jpegImage, photoWithGps, pngBomb } from '../testing/images'
import { processVisual } from './visual'

/** Les octets du ThumbHash, décodés depuis le base64 renvoyé. */
const bytesOf = (thumbhash: string) => Uint8Array.from(Buffer.from(thumbhash, 'base64'))

describe('processVisual, for the gallery', () => {
  it('keeps the proportions and shrinks the photo to 1 600 px at most, in WebP', async () => {
    const result = await processVisual(await jpegImage(4000, 2250), 'gallery')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result).toMatchObject({ width: 1600, height: 900 })
    const info = await sharp(result.data).metadata()
    expect(info).toMatchObject({ format: 'webp', width: 1600, height: 900 })
  })

  it('never enlarges a small photo', async () => {
    const result = await processVisual(await jpegImage(800, 600), 'gallery')

    expect(result).toMatchObject({ ok: true, width: 800, height: 600 })
  })

  it('removes every metadata, starting with the GPS position', async () => {
    const result = await processVisual(await photoWithGps(), 'gallery')

    if (!result.ok) throw new Error('processing failed')
    const info = await sharp(result.data).metadata()
    expect(info.exif).toBeUndefined()
    expect(info.icc).toBeUndefined()
    expect(info.xmp).toBeUndefined()
  })

  it('computes a ThumbHash with the colour of the photo, for the ambient light', async () => {
    // Une photo toute rouge : la couleur moyenne de son résumé doit être rouge aussi.
    const result = await processVisual(await jpegImage(1200, 800, '#d03020'), 'gallery')

    if (!result.ok) throw new Error('processing failed')
    expect(Thumbhash.safeParse(result.thumbhash).success).toBe(true)
    const { r, g, b } = thumbHashToAverageRGBA(bytesOf(result.thumbhash))
    expect(r).toBeGreaterThan(0.6)
    expect(g).toBeLessThan(0.35)
    expect(b).toBeLessThan(0.3)
  })

  it('refuses what the avatar refuses: not an image, a bomb, a very elongated picture', async () => {
    const text = new TextEncoder().encode('ceci n’est pas une image')

    expect(await processVisual(text, 'gallery')).toEqual({ ok: false, reason: 'unsupported' })
    expect(await processVisual(pngBomb(5000, 5000), 'gallery')).toEqual({
      ok: false,
      reason: 'unsupported',
    })
    expect(await processVisual(await jpegImage(2500, 500), 'gallery')).toEqual({
      ok: false,
      reason: 'unsupported',
    })
  })
})

describe('processVisual, for the vertical cover', () => {
  it('accepts a photo taller than wide', async () => {
    const result = await processVisual(await jpegImage(1080, 1920), 'portrait')

    expect(result).toMatchObject({ ok: true, width: 900, height: 1600 })
  })

  it('accepts a phone photo stored lying down, which is taller than wide once turned upright', async () => {
    // Une photo de téléphone tenu droit est souvent enregistrée « couchée » (1920 × 1080) avec
    // l'orientation EXIF 6 (« tourner de 90° ») : redressée, elle est bien verticale.
    const lying = await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: '#3b6ea8' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()

    const result = await processVisual(lying, 'portrait')

    expect(result).toMatchObject({ ok: true, width: 900, height: 1600 })
  })

  it('refuses a 16-bit image, like the avatar', async () => {
    const deep = await sharp({
      create: { width: 200, height: 300, channels: 4, background: '#3b6ea8' },
    })
      .toColourspace('rgb16')
      .png()
      .toBuffer()

    expect(await processVisual(deep, 'gallery')).toEqual({ ok: false, reason: 'unsupported' })
  })

  it('refuses a photo wider than tall: it would not be a vertical cover', async () => {
    expect(await processVisual(await jpegImage(1920, 1080), 'portrait')).toEqual({
      ok: false,
      reason: 'unsupported',
    })
  })
})
