// Tests des garde-fous communs à toutes les images envoyées (image.ts), à travers les deux
// traitements qui les utilisent : l'avatar et le visuel de projet. Ajoutés avec l'audit de sécurité
// du 25/10/2026 (C13, partie 3, A3) : le code était déjà juste, ces tests empêchent qu'il cesse de
// l'être.
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { processAvatar } from './avatar'
import { processVisual } from './visual'

/** Une petite image unie, en PNG. */
const plainPng = (background: string) =>
  sharp({ create: { width: 64, height: 64, channels: 3, background } })
    .png()
    .toBuffer()

/** La couleur moyenne d'une image, en [rouge, vert, bleu] de 0 à 255. */
const averageColour = async (data: Uint8Array) => {
  const { channels } = await sharp(data).stats()
  return channels.slice(0, 3).map((channel) => Math.round(channel.mean))
}

describe('image guards', () => {
  // Un SVG est un texte qui peut contenir du JavaScript : servi tel quel par notre domaine, il
  // s'exécuterait chez la personne qui l'ouvre. sharp sait le lire : seul le contrôle du format le
  // refuse, quel que soit le nom ou le type annoncé par le navigateur.
  it('refuses an SVG picture, even one sharp can read', async () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><script>alert(1)</script><rect width="64" height="64"/></svg>',
    )
    expect((await sharp(svg).metadata()).format).toBe('svg')

    expect(await processAvatar(svg)).toEqual({ ok: false, reason: 'unsupported' })
    expect(await processVisual(svg, 'gallery')).toEqual({ ok: false, reason: 'unsupported' })
  })

  // Un WebP peut être animé. On ne garde que sa première image : une animation coûterait bien plus
  // cher à traiter, et pourrait montrer autre chose que ce que l'aperçu laisse voir.
  it('keeps only the first frame of an animated WebP', async () => {
    // join.animated : sharp assemble les deux images (rouge, puis vert) en une animation.
    const animated = await sharp([await plainPng('#ff0000'), await plainPng('#00ff00')], {
      join: { animated: true },
    })
      .webp()
      .toBuffer()
    expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(2)

    for (const result of [
      await processAvatar(new Uint8Array(animated)),
      await processVisual(new Uint8Array(animated), 'gallery'),
    ]) {
      if (!result.ok) throw new Error('the animated WebP should be accepted')
      const pages = (await sharp(result.data, { animated: true }).metadata()).pages ?? 1
      expect(pages).toBe(1)
      // La première image (rouge) est gardée, pas la seconde (verte).
      const [red, green] = await averageColour(result.data)
      expect(red).toBeGreaterThan(200)
      expect(green).toBeLessThan(50)
    }
  })
})
