// Tests du catalogue semé (tranche R6b, docs/scenarios/refonte.md, « R6b », « Le catalogue ») : chaque
// outil de `catalogue/tools.json`, que la migration 0016 copie en base, respecte les règles du
// contrat (nom, famille, deux descriptions d'une phrase, site), et rien ne s'y confond : deux noms
// ou alias qui se replient pareil (« Chat GPT », « ChatGPT ») feraient échouer la migration.
//
// Le texte de ces descriptions est écrit par nous sur les outils d'autres éditeurs : il reste
// neutre (ni prix, ni « gratuit », ni superlatif, ni promesse, ni partenariat), et un site ne porte
// aucun paramètre de suivi ou d'affiliation (relecture juridique jur-T7, corps du test recopié du
// rapport ; décisions du plan, points 10 et 12).
//
// Le contrat est lu par un chemin relatif : ce paquet ne dépend pas de @ruche/contracts (la base ne
// sert que l'API), et ce test, hors de `src`, n'est lu que par Vitest.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  foldTool,
  ShortLabel,
  TOOL_FAMILIES,
  TOOL_NAME_MAX,
  ToolAdmit,
  ToolSlug,
  toolSlug,
} from '../contracts/src/index'

/**
 * Une entrée du fichier : les champs de `ToolAdmit` (ce qu'un administrateur envoie pour ajouter un
 * outil), plus ses alias. `ToolAdmit` est un `strictObject`, et `extend` garde cette règle : un
 * champ de trop (un « prix », un « éditeur ») est refusé. (Zod n'est pas une dépendance de ce
 * paquet : on part des schémas du contrat, sans importer `z`.)
 */
const CatalogueEntry = ToolAdmit.extend({ aliases: ShortLabel(TOOL_NAME_MAX).array() })

/** Le fichier tel qu'il est écrit, sans le passer par le contrat (pour tester son contenu brut). */
type RawEntry = {
  name: string
  family: string
  descriptionFr: string
  descriptionEn: string
  siteUrl: string | null
  aliases: string[]
}
const catalogue: RawEntry[] = JSON.parse(
  readFileSync(new URL('./catalogue/tools.json', import.meta.url), 'utf8'),
)

describe('the seeded catalogue', () => {
  it('counts about 120 tools, in every family', () => {
    // Le scénario : « environ 120 outils connus » ; chaque pastille de famille a ses outils.
    expect(catalogue.length).toBeGreaterThanOrEqual(100)
    expect(catalogue.length).toBeLessThanOrEqual(500) // la liste de GET /v1/tools en rend 500 au plus
    for (const family of TOOL_FAMILIES) {
      expect(
        catalogue.some((tool) => tool.family === family),
        family,
      ).toBe(true)
    }
  })

  it('validates every entry of tools.json with the contract schemas and finds no folded collision', () => {
    const folded = new Map<string, string>()
    for (const tool of catalogue) {
      const parsed = CatalogueEntry.safeParse(tool)
      expect(parsed.error?.issues ?? [], tool.name).toEqual([])
      // Le nom est écrit tel qu'on l'affiche : sans espaces autour, et le contrat ne le change pas.
      expect(parsed.data?.name, tool.name).toBe(tool.name)
      // Un slug d'adresse bien formé (/tags/<slug>).
      expect(ToolSlug.safeParse(toolSlug(tool.name)).success, tool.name).toBe(true)

      // Ni deux outils, ni un outil et un alias, ni deux alias ne se replient pareil : la base
      // garde le repli unique sur les outils et les alias ensemble (sec-A3). Un alias qui se replie
      // comme son propre nom (« Chat GPT » pour « ChatGPT ») ne sert à rien : refusé aussi.
      for (const name of [tool.name, ...tool.aliases]) {
        const key = foldTool(name)
        expect(folded.get(key), `${tool.name} / ${name}`).toBeUndefined()
        folded.set(key, tool.name)
      }
    }
  })

  it('keeps every catalogue description neutral and every site free of tracking', () => {
    const banned =
      /(?<!\p{L})(gratuite?s?|free|meilleure?s?|best|leader|incontournables?|révolutionnaires?|revolutionary|sûre?s?|safe|sécurisée?s?|secure|officiel(le)?s?|official|recommandée?s?|recommended|partenaires?|partner|sponsorisée?s?|sponsored)(?!\p{L})|n°\s?1|#1|€|\$|!/iu
    for (const tool of catalogue) {
      expect(tool.descriptionFr, tool.name).not.toMatch(banned)
      expect(tool.descriptionEn, tool.name).not.toMatch(banned)
      if (tool.siteUrl !== null) {
        const url = new URL(tool.siteUrl)
        expect(url.protocol, tool.name).toBe('https:')
        expect(url.search, tool.name).toBe('')
        expect(url.hash, tool.name).toBe('')
      }
    }
  })
})
