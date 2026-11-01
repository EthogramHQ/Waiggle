// Le garde des captures (scripts/loading-guard.ts) : une capture qui montre encore le chargement,
// ou l'échec du chargement, fait échouer le script des captures, sauf si elle le montre exprès.
import { resources } from '@ruche/i18n'
import { loadingProblem, unfinishedTexts, waitUntilLoaded } from './loading-guard'

const fr = resources.fr.translation
const texts = unfinishedTexts(fr)

// Le texte visible d'une page, tel que le rend `innerText` dans le navigateur : une ligne par bloc.
const pageText = (...lines: string[]) => lines.join('\n')

describe('loadingProblem', () => {
  it('flags a capture still showing the loading text, and names it', () => {
    const problem = loadingProblem(
      'suspendre-telephone-jour',
      pageText('Waiggle', fr.common.loading, 'Revenir'),
      { texts, page: 'suspendre' },
    )
    expect(problem).toContain('suspendre-telephone-jour')
    expect(problem).toContain(fr.common.loading)
  })

  it('flags a capture showing the load failure', () => {
    const problem = loadingProblem(
      'lever-ordinateur-nuit',
      pageText('Waiggle', fr.states.errorTitle, 'Réessayer', 'Revenir'),
      { texts, page: 'lever' },
    )
    expect(problem).toContain('lever-ordinateur-nuit')
    expect(problem).toContain(fr.states.errorTitle)
  })

  it('lets a loaded page through, even when a longer text starts like the loading one', () => {
    expect(
      loadingProblem(
        'projet-telephone-jour',
        pageText('Recettes du frigo', fr.project.comments.loading, 'Tester la démo'),
        { texts, page: 'projet' },
      ),
    ).toBeNull()
  })

  it('reads the line whatever its spaces (the browser may turn non-breaking ones into plain ones)', () => {
    const spaced = `  ${fr.states.errorTitle.replaceAll(' ', ' ')}  `
    expect(loadingProblem('lever-telephone-jour', pageText(spaced), { texts })).not.toBeNull()
  })

  it('lets through a capture listed as showing the loading or the failure on purpose', () => {
    expect(
      loadingProblem('erreur-telephone-jour', pageText(fr.states.errorTitle), {
        texts,
        page: 'erreur',
        intended: ['catalogue', 'erreur'],
      }),
    ).toBeNull()
  })
})

// L'attente avant le garde : sur une machine chargée (la CI de main, le 31/10/2026), une page de
// modération montrait encore son squelette quand le garde la lisait. Le script attend donc que la
// page ait fini de charger, avec une patience bornée. Une fausse horloge remplace l'attente réelle.
describe('waitUntilLoaded', () => {
  // Une page qui rend les problèmes donnés, un par lecture, puis le dernier pour toujours.
  const pageReading = (...problems: (string | null)[]) => {
    let reads = 0
    const read = async () => problems[Math.min(reads++, problems.length - 1)] ?? null
    return { read, reads: () => reads }
  }
  const clock = () => {
    let now = 0
    const sleep = async (ms: number) => {
      now += ms
    }
    return { now: () => now, sleep }
  }

  it('waits for a page that is still loading, and lets it through once loaded', async () => {
    const page = pageReading('chargement', 'chargement', null)
    const time = clock()
    const problem = await waitUntilLoaded(page.read, { patience: 10_000, step: 250, ...time })
    expect(problem).toBeNull()
    expect(page.reads()).toBe(3)
  })

  it('still reports a page that never finishes loading, once its patience is spent', async () => {
    const page = pageReading('moderation-ordinateur-nuit : chargement')
    const time = clock()
    const problem = await waitUntilLoaded(page.read, { patience: 10_000, step: 250, ...time })
    expect(problem).toBe('moderation-ordinateur-nuit : chargement')
    expect(time.now()).toBeGreaterThanOrEqual(10_000)
  })

  it('does not wait at all for a page already loaded', async () => {
    const page = pageReading(null)
    const time = clock()
    expect(await waitUntilLoaded(page.read, { patience: 10_000, step: 250, ...time })).toBeNull()
    expect(time.now()).toBe(0)
  })
})
