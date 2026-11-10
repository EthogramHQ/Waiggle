// Tests de la logique de la feuille « Nouvelle mise à jour » (R7a, scénario « Publier une mise à
// jour ») : des fonctions pures, sans écran, qui tiennent les valeurs du formulaire (titre, version,
// lignes de « Ce qui a changé », interrupteur « Avant / après ») et fabriquent ce qu'on envoie à
// l'API. Pures : elles rendent de nouvelles valeurs au lieu de changer celles qu'on leur donne, ce
// qui permet à React de voir le changement (et à ces tests de vérifier l'ancien état intact).
//
// L'interface attendue de `src/updates/form.ts` (plan R7a, « API fixées au lancement ») :
// - `UpdateFormValues = { title; version; lines: UpdateLineValue[]; beforeAfter }`, une ligne étant
//   `{ id, family, text }` (type exporté par `ui/UpdateLinesField`) ;
// - `UpdateFormPhoto = { id: string | null; description: string | null; uploading: boolean }` ;
// - `emptyLine(family = 'new')`, `addLine`, `removeLine`, `setFamily`, `setText`, `isDirty`,
//   `toPayload(values, photos)` → `{ ok: true, payload }` ou `{ ok: false, error }`.
import { NewProjectUpdate, UPDATE_LINES_MAX } from '@ruche/contracts'
import {
  addLine,
  emptyLine,
  isDirty,
  removeLine,
  setFamily,
  setText,
  toPayload,
  type UpdateFormPhoto,
  type UpdateFormValues,
} from './form'

/** Le formulaire à l'ouverture : sans titre ni version, une ligne vide de la famille « Nouveau ». */
const opened = (): UpdateFormValues => ({
  title: '',
  version: '',
  lines: [emptyLine()],
  beforeAfter: false,
})

/** Un formulaire rempli comme celui de Papi Jean : un titre, une version, deux lignes. */
const written = (): UpdateFormValues => ({
  title: 'Le décompte de la fusée',
  version: 'v1.2',
  lines: [
    { ...emptyLine('new'), text: 'Un compte à rebours avant chaque question' },
    { ...emptyLine('fixed'), text: 'Le score ne repart plus à zéro au niveau 3' },
  ],
  beforeAfter: false,
})

/** Une photo déjà envoyée (« en attente » côté API), avec ou sans description. */
const sent = (id: string, description: string | null = null): UpdateFormPhoto => ({
  id,
  description,
  uploading: false,
})
/** Une photo dont l'envoi n'est pas fini : pas encore d'identifiant. */
const uploading: UpdateFormPhoto = { id: null, description: null, uploading: true }

const DAY = '55555555-5555-4555-8555-555555555555'
const NIGHT = '66666666-6666-4666-8666-666666666666'

/** Le texte de chaque ligne, dans l'ordre. */
const texts = (values: UpdateFormValues) => values.lines.map((line) => line.text)

/** Ce que `toPayload` envoie quand tout va bien ; l'échec du test dit l'erreur rendue sinon. */
const payloadOf = (values: UpdateFormValues, photos: UpdateFormPhoto[] = []) => {
  const result = toPayload(values, photos)
  if (!result.ok) throw new Error(`toPayload refused the form: ${result.error}`)
  return result.payload
}

describe('emptyLine', () => {
  // Scénario : « une première ligne vide de la famille « Nouveau » ».
  it('makes an empty line of the « Nouveau » family by default', () => {
    const line = emptyLine()

    expect(line.family).toBe('new')
    expect(line.text).toBe('')
  })

  it('makes an empty line of the family it is given', () => {
    expect(emptyLine('polish')).toMatchObject({ family: 'polish', text: '' })
  })

  // Une clé stable par ligne (jamais son rang) : React garde ainsi le bon champ, et son focus, quand
  // une ligne du milieu part (relecture du plan, interface A1).
  it('gives each new line its own id', () => {
    const ids = new Set([emptyLine().id, emptyLine().id, emptyLine('fixed').id])

    expect(ids.size).toBe(3)
    for (const id of ids) expect(id).toEqual(expect.any(String))
  })
})

describe('addLine', () => {
  // Scénario : « une ligne vide apparaît, de la famille « Nouveau », et le compteur dit « 2 / 5 » ».
  it('adds an empty « Nouveau » line at the end', () => {
    const before = written()
    before.lines[1] = { ...(before.lines[1] as (typeof before.lines)[number]), family: 'polish' }

    const after = addLine(before)

    expect(after.lines).toHaveLength(3)
    expect(after.lines.slice(0, 2)).toEqual(before.lines)
    expect(after.lines[2]).toMatchObject({ family: 'new', text: '' })
    expect(before.lines.map((line) => line.id)).not.toContain(after.lines[2]?.id)
  })

  it('leaves the values it was given untouched', () => {
    const before = written()

    addLine(before)

    expect(before.lines).toHaveLength(2)
  })

  // Scénario : « à cinq lignes, « Ajouter une ligne » disparaît » ; la fonction ne va pas au-delà.
  it('adds nothing beyond five lines', () => {
    let values = opened()
    for (let i = 0; i < 10; i++) values = addLine(values)

    expect(values.lines).toHaveLength(UPDATE_LINES_MAX)
    expect(UPDATE_LINES_MAX).toBe(5) // témoin : la limite du scénario
  })
})

describe('removeLine', () => {
  it('removes the line it is asked to, and keeps the others with their families', () => {
    const three = addLine(written())
    const [first, middle, last] = three.lines
    if (!first || !middle || !last) throw new Error('three lines expected')

    const after = removeLine(three, middle.id)

    expect(after.lines).toEqual([first, last])
    expect(three.lines).toHaveLength(3) // les valeurs données ne changent pas
  })

  // Scénario : « chaque ligne a un bouton « Retirer cette ligne », sauf quand il n'en reste qu'une ».
  it('never removes the last line left', () => {
    const one = opened()
    const [only] = one.lines
    if (!only) throw new Error('one line expected')

    const after = removeLine(one, only.id)

    expect(after.lines).toEqual([only])
  })
})

describe('setFamily and setText', () => {
  // Scénario : « un petit menu propose les trois familles ; la ligne prend celle qu'il choisit ».
  it('changes the family of one line only', () => {
    const before = written()
    const [first, second] = before.lines
    if (!first || !second) throw new Error('two lines expected')

    const after = setFamily(before, second.id, 'polish')

    expect(after.lines).toEqual([first, { ...second, family: 'polish' }])
    expect(before.lines[1]?.family).toBe('fixed')
  })

  it('changes the text of one line only', () => {
    const before = written()
    const [first, second] = before.lines
    if (!first || !second) throw new Error('two lines expected')

    const after = setText(before, first.id, 'Un mode nuit')

    expect(after.lines).toEqual([{ ...first, text: 'Un mode nuit' }, second])
    expect(texts(before)[0]).toBe('Un compte à rebours avant chaque question')
  })
})

describe('isDirty', () => {
  // Scénario : « la feuille sans changement se ferme tout de suite ».
  it('is false for a sheet left as it opened', () => {
    const initial = opened()

    expect(isDirty(initial, initial, [])).toBe(false)
  })

  it('is true once a line is written', () => {
    const initial = opened()
    const [line] = initial.lines
    if (!line) throw new Error('one line expected')

    expect(isDirty(initial, setText(initial, line.id, 'Un mode nuit'), [])).toBe(true)
  })

  it('is true once a title or a version is written', () => {
    const initial = opened()

    expect(isDirty(initial, { ...initial, title: 'Le décompte' }, [])).toBe(true)
    expect(isDirty(initial, { ...initial, version: 'v1.3' }, [])).toBe(true)
  })

  it('is true once a line is added or a family changed', () => {
    const initial = opened()
    const [line] = initial.lines
    if (!line) throw new Error('one line expected')

    expect(isDirty(initial, addLine(initial), [])).toBe(true)
    expect(isDirty(initial, setFamily(initial, line.id, 'fixed'), [])).toBe(true)
  })

  // Une photo envoyée part à la purge si l'on abandonne : la feuille doit demander avant.
  it('is true once a photo is added, even still uploading', () => {
    const initial = opened()

    expect(isDirty(initial, initial, [sent(DAY)])).toBe(true)
    expect(isDirty(initial, initial, [uploading])).toBe(true)
  })

  // Décision de la session (relecture B2) : une feuille préremplie par le changement de statut se
  // ferme sur « Annuler » sans question ; on compare aux valeurs d'ouverture, pas à une feuille vide.
  it('compares with the values at opening, so a sheet prefilled by the status is not changed', () => {
    const prefilled: UpdateFormValues = {
      ...opened(),
      lines: [{ ...emptyLine('new'), text: 'Le projet passe en « Testable ».' }],
    }

    expect(isDirty(prefilled, prefilled, [])).toBe(false)
    expect(isDirty(opened(), prefilled, [])).toBe(true) // témoin : comparée à vide, elle l'est
  })

  it('is false again when a change is undone', () => {
    const initial = opened()
    const [line] = initial.lines
    if (!line) throw new Error('one line expected')
    const typed = setText(initial, line.id, 'Un mode nuit')

    expect(isDirty(initial, setText(typed, line.id, ''), [])).toBe(false)
  })
})

describe('toPayload', () => {
  it('sends the title, the version and the lines, without the ids of the form', () => {
    const payload = payloadOf(written())

    expect(payload).toEqual({
      title: 'Le décompte de la fusée',
      version: 'v1.2',
      lines: [
        { family: 'new', text: 'Un compte à rebours avant chaque question' },
        { family: 'fixed', text: 'Le score ne repart plus à zéro au niveau 3' },
      ],
      photos: [],
      beforeAfter: false,
    })
    // Ce qui part est accepté par le contrat de l'API.
    expect(NewProjectUpdate.safeParse(payload).success).toBe(true)
  })

  // Scénario : « titre, facultatif », « numéro de version, facultatif » ; le contrat veut null.
  it('sends an empty title and an empty version as null', () => {
    const payload = payloadOf({ ...written(), title: '', version: '' })

    expect(payload.title).toBeNull()
    expect(payload.version).toBeNull()
  })

  // Des espaces seules ne font pas un titre (le contrat refuserait un titre sans lettre visible).
  it('sends a title or a version made only of spaces as null', () => {
    const payload = payloadOf({ ...written(), title: '   ', version: ' ' })

    expect(payload.title).toBeNull()
    expect(payload.version).toBeNull()
    expect(NewProjectUpdate.safeParse(payload).success).toBe(true)
  })

  // Scénario : « les lignes vides sont ignorées ».
  it('leaves out the empty lines', () => {
    const values = written()
    const withBlanks: UpdateFormValues = {
      ...values,
      lines: [emptyLine(), ...values.lines, { ...emptyLine('polish'), text: '   ' }],
    }

    const payload = payloadOf(withBlanks)

    expect(payload.lines).toEqual([
      { family: 'new', text: 'Un compte à rebours avant chaque question' },
      { family: 'fixed', text: 'Le score ne repart plus à zéro au niveau 3' },
    ])
    expect(NewProjectUpdate.safeParse(payload).success).toBe(true)
  })

  // Scénario : « Quand il touche « Publier » sans aucune ligne écrite », la première ligne dit
  // « Écris au moins un changement avant de publier. » : la fonction rend l'erreur `required`.
  it('refuses a form with no line written', () => {
    const blanks: UpdateFormValues = {
      ...opened(),
      title: 'Le décompte de la fusée',
      lines: [emptyLine(), { ...emptyLine('fixed'), text: '  ' }],
    }

    expect(toPayload(blanks, [])).toEqual({ ok: false, error: 'required' })
  })

  // Relecture du plan, interface A6 : `it('does not publish while a photo is still uploading')`.
  it('does not publish while a photo is still uploading', () => {
    expect(toPayload(written(), [sent(DAY), uploading])).toEqual({
      ok: false,
      error: 'uploading',
    })
  })

  it('sends the photos in their order, each with its description', () => {
    const payload = payloadOf(written(), [sent(DAY, 'La fusée de jour'), sent(NIGHT)])

    expect(payload.photos).toEqual([
      { id: DAY, description: 'La fusée de jour' },
      { id: NIGHT, description: null },
    ])
  })

  it('keeps « Avant / après » with two photos', () => {
    const payload = payloadOf({ ...written(), beforeAfter: true }, [sent(DAY), sent(NIGHT)])

    expect(payload.beforeAfter).toBe(true)
    expect(NewProjectUpdate.safeParse(payload).success).toBe(true)
  })

  // Relecture du plan, interface A6 : `it('turns « Avant / après » off when only one photo is
  // left')` → `toPayload(...).beforeAfter` faux (sinon l'API répond 400 : le contrat le refuse).
  it('turns « Avant / après » off when only one photo is left', () => {
    const payload = payloadOf({ ...written(), beforeAfter: true }, [sent(DAY)])

    expect(payload.beforeAfter).toBe(false)
    expect(NewProjectUpdate.safeParse(payload).success).toBe(true)
  })

  it('turns « Avant / après » off when no photo is left', () => {
    expect(payloadOf({ ...written(), beforeAfter: true }, []).beforeAfter).toBe(false)
  })
})
