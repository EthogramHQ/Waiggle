// Le garde des captures (scripts/loading-guard.ts) : une capture qui montre encore le chargement,
// ou l'échec du chargement, fait échouer le script des captures, sauf si elle le montre exprès.
import { resources } from '@ruche/i18n'
import { loadingProblem, unfinishedTexts } from './loading-guard'

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
