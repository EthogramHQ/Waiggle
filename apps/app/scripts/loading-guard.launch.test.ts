// Le garde des captures et le lancement de l'appli (R1) : « Waiggle se lance… », le nom du logo
// animé, est aussi une attente. Sa traduction s'écrit avec un paramètre (« {{appName}} se
// lance… ») : le garde la reconnaît quel que soit le nom, sans le confondre avec une autre ligne.
import { appName } from '@ruche/brand'
import { resources } from '@ruche/i18n'
import { loadingProblem, unfinishedTexts } from './loading-guard'

const fr = resources.fr.translation
const texts = unfinishedTexts(fr)
const launching = fr.common.loadingApp.replace('{{appName}}', appName)

describe('loadingProblem and the app launch', () => {
  it('flags a capture still showing « {{appName}} se lance… », the name filled in', () => {
    const problem = loadingProblem('accueil-telephone-jour', ['Accueil', launching].join('\n'), {
      texts,
    })
    expect(problem).toContain(fr.common.loadingApp)
  })

  // Témoin : une ligne qui ne fait que commencer comme le lancement passe.
  it('lets through a longer line that only starts like the launch text', () => {
    expect(loadingProblem('accueil-telephone-jour', `${launching} Et voilà.`, { texts })).toBeNull()
  })
})
