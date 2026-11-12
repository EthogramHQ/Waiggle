// Tests des images du récap habillé (R8, planche R8-Recap, décision A5). Scénario :
// docs/scenarios/refonte.md, « Le récap de la semaine, habillé » ; plan R8, « Les photos du récap »
// et « Le récap habillé (BE-D) ».
//
// Le récap joint au plus quatre petites images à l'e-mail, jamais chargées à distance :
// - recapThumb(storage, key) : la photo d'un projet, relue dans le stockage, réduite à 160 px de
//   côté au plus, ré-encodée en JPEG (qualité 80) sans aucune métadonnée (ni GPS, ni appareil) ;
//   null si le fichier manque ou ne se lit pas (le récap prend alors la tuile, ou rien) ;
// - categoryTile(code) : la tuile miel d'une catégorie (une image PNG fixe, fabriquée une fois par
//   scripts/category-tiles.mts), pour un projet sans photo ou signalé.
//
// `sharp` (la bibliothèque d'images de l'API) relit ce qui sort, comme le ferait une messagerie.
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from '../testing/context'
import { jpegImage, photoWithGps, pngImage } from '../testing/images'
import { categoryTile, recapThumb } from './recap-images'

let ctx: TestContext

beforeEach(async () => {
  ctx = await createTestContext()
})

afterEach(async () => {
  await ctx.close()
})

/** Les huit premiers octets d'un PNG, et les trois d'un JPEG. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((byte, i) => bytes[i] === byte)

/** Une clé du stockage, comme le serveur les fabrique (un identifiant aléatoire, en WebP). */
const newKey = () => `visuals/${randomUUID()}.webp`

/**
 * Range une image dans le stockage, en WebP comme l'envoi des photos ; avec `exif`, elle garde une
 * position GPS et un appareil, pour prouver que la vignette n'en garde rien.
 */
const store = async (image: Buffer, exif = false) => {
  const key = newKey()
  const webp = exif
    ? sharp(image).withExif({ IFD0: { Make: 'Phone', Model: 'Secret model' } })
    : sharp(image)
  await ctx.storage.put(key, await webp.webp().toBuffer())
  return key
}

describe('recapThumb', () => {
  it('shrinks a photo to 160 px at most, as a JPEG without any metadata', async () => {
    // Une vraie photo de téléphone : grande, avec sa position GPS et son appareil.
    const key = await store(await photoWithGps(), true)
    const original = (await ctx.storage.get(key)) ?? new Uint8Array()
    expect((await sharp(original).metadata()).exif).toBeDefined() // témoin : la source en a

    const thumb = await recapThumb(ctx.storage, key)

    if (thumb === null) throw new Error('no thumbnail')
    expect(thumb.contentType).toBe('image/jpeg')
    expect(startsWith(thumb.content, JPEG_SIGNATURE)).toBe(true)
    const meta = await sharp(thumb.content).metadata()
    expect(meta.format).toBe('jpeg')
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(160)
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeGreaterThan(0)
    // Ni EXIF (GPS, appareil), ni XMP, ni IPTC, ni profil de couleur recopié.
    expect(meta.exif).toBeUndefined()
    expect(meta.xmp).toBeUndefined()
    expect(meta.iptc).toBeUndefined()
    // Une vignette, pas une photo : quelques kilo-octets.
    expect(thumb.content.byteLength).toBeLessThan(original.byteLength)
    expect(thumb.content.byteLength).toBeLessThan(30_000)
  })

  it('keeps the shape of a tall photo, its long side at 160 px', async () => {
    const thumb = await recapThumb(ctx.storage, await store(await jpegImage(900, 1600)))

    if (thumb === null) throw new Error('no thumbnail')
    const meta = await sharp(thumb.content).metadata()
    expect(meta.height).toBe(160)
    expect(meta.width).toBe(90)
  })

  it('re-encodes a stored image with transparency as a JPEG', async () => {
    const thumb = await recapThumb(ctx.storage, await store(await pngImage()))

    expect(thumb?.contentType).toBe('image/jpeg')
    expect((await sharp(thumb?.content).metadata()).format).toBe('jpeg')
  })

  it('names the file and the content id without the storage key', async () => {
    const key = await store(await jpegImage(400, 300))
    const id = key.slice('visuals/'.length, -'.webp'.length)

    const thumb = await recapThumb(ctx.storage, key)

    if (thumb === null) throw new Error('no thumbnail')
    // La tâche donne ensuite à chaque image son nom fabriqué (thumb-1, projet-1.jpg) ; la clé du
    // stockage, elle, ne sort jamais dans un e-mail.
    expect(thumb.filename).not.toContain(id)
    expect(thumb.cid).not.toContain(id)
  })

  it('gives null for a missing file or a file that is not an image', async () => {
    const broken = newKey()
    await ctx.storage.put(broken, new TextEncoder().encode('not an image at all'))

    expect(await recapThumb(ctx.storage, newKey())).toBeNull()
    expect(await recapThumb(ctx.storage, broken)).toBeNull()
    // Une clé qui n'est pas du serveur ne lit rien, et ne fait rien tomber.
    expect(await recapThumb(ctx.storage, '../secrets.env')).toBeNull()
  })
})

describe('categoryTile', () => {
  it('gives a fixed PNG tile for each category of the catalogue', async () => {
    const codes = (
      (await ctx.db.execute(sql`select code from category order by code`)) as unknown as {
        rows: { code: string }[]
      }
    ).rows.map((row) => row.code)
    expect(codes).toContain('animals') // témoin : les catégories semées par la migration

    for (const code of codes) {
      const tile = categoryTile(code)
      expect(tile.contentType, code).toBe('image/png')
      expect(startsWith(tile.content, PNG_SIGNATURE), code).toBe(true)
      const meta = await sharp(tile.content).metadata()
      expect(meta.format, code).toBe('png')
      // Une vignette carrée, de la taille des photos réduites.
      expect(meta.width, code).toBe(meta.height)
      expect(meta.width ?? 0, code).toBeLessThanOrEqual(160)
      expect(meta.exif, code).toBeUndefined()
    }
  })

  it('draws a different tile for two categories, and the same one each time', () => {
    const animals = categoryTile('animals')
    const science = categoryTile('science')

    expect(Buffer.from(animals.content).equals(Buffer.from(categoryTile('animals').content))).toBe(
      true,
    )
    expect(Buffer.from(animals.content).equals(Buffer.from(science.content))).toBe(false)
  })

  it('falls back to the tile of « other » for a category without its own tile', () => {
    const unknown = categoryTile('a-category-added-later')

    expect(unknown.contentType).toBe('image/png')
    expect(Buffer.from(unknown.content).equals(Buffer.from(categoryTile('other').content))).toBe(
      true,
    )
  })
})
