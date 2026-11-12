// Tests du découpage des marques d'une phrase d'Activité (ui/marks.ts, R8). Chaque phrase
// est une seule clé de traduction (« <b>{{name}}</b> a commenté <b>{{title}}</b> ») : `<b>…</b>`
// marque ce qui s'écrit en gras (noms, titres), `<v>…</v>` une version. La fonction coupe la phrase
// en morceaux, chacun avec son style, puis remplit les `{{…}}` **après** le découpage : un nom ou un
// titre écrit par un membre qui contiendrait « <b> » reste du texte, jamais une marque.
//
// L'API attendue (fixée par ces tests, voir le rapport) :
//   splitMarks(text: string, values?: Record<string, string>): MarkedPart[]
//   MarkedPart = { text: string; style?: 'strong' | 'version' }
import { splitMarks } from './marks'

describe('splitMarks', () => {
  it('keeps a sentence without marks as one plain part', () => {
    expect(splitMarks('3 personnes de plus te suivent')).toEqual([
      { text: '3 personnes de plus te suivent' },
    ])
  })

  it('cuts the bold parts out of the sentence, in order', () => {
    expect(splitMarks('<b>Malik</b> a commenté <b>Météo</b>')).toEqual([
      { text: 'Malik', style: 'strong' },
      { text: ' a commenté ' },
      { text: 'Météo', style: 'strong' },
    ])
  })

  it('cuts a version out of the sentence', () => {
    expect(splitMarks('<b>Décollage !</b> a une mise à jour <v>v1.2</v>')).toEqual([
      { text: 'Décollage !', style: 'strong' },
      { text: ' a une mise à jour ' },
      { text: 'v1.2', style: 'version' },
    ])
  })

  it('leaves out the empty pieces around the marks', () => {
    // Aucun morceau vide au début ni à la fin : la carte ne dessine pas de texte vide.
    const parts = splitMarks('<b>Inès</b>')
    expect(parts).toEqual([{ text: 'Inès', style: 'strong' }])
  })

  it('fills the values after cutting the marks', () => {
    expect(
      splitMarks('<b>{{name}}</b> a commenté <b>{{title}}</b>', {
        name: 'Papi Jean',
        title: 'Le ciel de ce soir',
      }),
    ).toEqual([
      { text: 'Papi Jean', style: 'strong' },
      { text: ' a commenté ' },
      { text: 'Le ciel de ce soir', style: 'strong' },
    ])
  })

  // Sécurité : un titre de projet est écrit par un membre. Ses « <b> » ne deviennent jamais une
  // marque, et ses « {{…}} » ne sont jamais remplis à leur tour.
  it('never reads a mark or a placeholder written by a member', () => {
    expect(
      splitMarks('<b>{{name}}</b> a commenté <b>{{title}}</b>', {
        name: '</b>Malik<v>',
        title: 'Mon <b>gras</b> {{name}}',
      }),
    ).toEqual([
      { text: '</b>Malik<v>', style: 'strong' },
      { text: ' a commenté ' },
      { text: 'Mon <b>gras</b> {{name}}', style: 'strong' },
    ])
  })

  it('keeps an unknown tag as plain text', () => {
    expect(splitMarks('Un <i>mot</i> penché')).toEqual([{ text: 'Un <i>mot</i> penché' }])
  })

  it('gives back the whole sentence once the parts are joined', () => {
    const sentence = 'L’équipe a rangé « <b>Quel papillon ?</b> » dans <b>Animaux</b>'
    expect(
      splitMarks(sentence)
        .map((part) => part.text)
        .join(''),
    ).toBe('L’équipe a rangé « Quel papillon ? » dans Animaux')
  })
})
