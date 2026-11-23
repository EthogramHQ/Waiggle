// Chaque sceau du contrat (packages/contracts, `SEALS`) a son icône dessinée dans l'appli : une
// icône ajoutée au contrat sans passer par scripts/icons.mts laisserait un sceau sans dessin, et
// le typage ne le voit pas (le contrat garde le nom de l'icône en simple texte).
import { SEALS } from '@ruche/contracts'
import { iconPaths } from './icons.generated'

describe('WaxSeal icons', () => {
  it('draws the icon of every seal of the contract', () => {
    const missing = SEALS.map((seal) => seal.icon).filter((icon) => !(icon in iconPaths))
    expect(missing).toEqual([])
  })
})
