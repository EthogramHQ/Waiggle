// La fabrication d'un pseudo à partir du nom (tranche 6a) : « Inès Morel » donne « ines_morel ».
// Des fonctions pures, sans base ni réseau : elles proposent des pseudos, et c'est claim.ts qui
// choisit le premier libre dans la base. Scénario : docs/scenarios/phase-1.md, règle « Fabrication ».
import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH, Handle } from '@ruche/contracts'
import type { Language } from '@ruche/i18n'

/** La base tirée du nom : 16 caractères au plus, pour qu'un numéro tienne encore dans les 20. */
export const HANDLE_BASE_MAX_LENGTH = 16

// Le début d'un pseudo fabriqué pour un nom qui commence par un chiffre, ou dont il ne reste rien
// (un nom écrit dans un autre alphabet) : dans la langue du compte.
const memberWord: Record<Language, string> = { fr: 'membre', en: 'member' }

// Quelques lettres latines qui ne se décomposent pas en « lettre + accent » (voir plus bas) : on
// les écrit à la main, plutôt que de les perdre (« Søren » donne « soren », pas « s_ren »).
const plainLetters: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
}

/**
 * Le nom réduit aux caractères d'un pseudo : sans accents, en minuscules, et tout le reste
 * (espaces, tirets, apostrophes, emoji, autres alphabets) changé en un seul « _ », jamais au début
 * ni à la fin. Peut être vide.
 *
 * normalize('NFKD') sépare une lettre accentuée en deux caractères : la lettre, puis son accent
 * (« é » devient « e » + « ´ »). \p{M} désigne ces accents (les « marques » d'Unicode) : on les
 * retire, il reste la lettre. NFKD ramène aussi les formes décoratives à la lettre simple
 * (« ﬁ » en « fi », « Ａ » en « A »).
 */
const plainName = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[ßæœøłđðþı]/g, (letter) => plainLetters[letter] ?? '_')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

/** Coupe à 16 caractères, sans laisser de « _ » à la fin (« alexandre_dumas_ » → « alexandre_dumas »). */
const cut = (text: string) => text.slice(0, HANDLE_BASE_MAX_LENGTH).replace(/_+$/, '')

/**
 * La base du pseudo d'un membre : son nom réduit (voir plainName), coupé à 16 caractères. Elle
 * peut être trop courte pour un pseudo (« al ») : handleCandidates y ajoute alors un numéro.
 * Un nom qui commence par un chiffre devient « membre_2pac » ; un nom dont il ne reste rien,
 * « membre_ » (numéroté ensuite : « membre_1 »).
 */
export const handleBase = (name: string, language: Language) => {
  const plain = plainName(name)
  if (plain === '') return `${memberWord[language]}_`
  if (/^[0-9]/.test(plain)) return cut(`${memberWord[language]}_${plain}`)
  return cut(plain)
}

/**
 * Le premier numéro ajouté à une base. Une base assez longue s'essaie d'abord seule (« ines_morel »,
 * puis « ines_morel2 », « ines_morel3 »…). Une base trop courte reçoit toujours un numéro, assez
 * long pour atteindre 3 caractères : « al1 », « al2 »… ; « a10 », « a11 »… ; « membre_1 »…
 */
const firstNumber = (base: string) => {
  if (base.endsWith('_')) return 1
  if (base.length >= HANDLE_MIN_LENGTH) return null
  return 10 ** (HANDLE_MIN_LENGTH - base.length - 1)
}

/**
 * Les pseudos qu'on peut proposer pour une base, dans l'ordre, de la position `from` à
 * `from + count` (exclue) : la base seule (si elle suffit), puis numérotée. Les mots réservés
 * (« admin », le nom de l'appli…) sont sautés : « admin » donne « admin2 ». Tous ont la forme d'un
 * pseudo valide (le schéma Handle des contrats le vérifie), et 20 caractères au plus.
 */
export const handleCandidates = (base: string, from: number, count: number): string[] => {
  const start = firstNumber(base)
  const candidates: string[] = []
  for (let position = from; position < from + count; position++) {
    // Sans premier numéro imposé : la position 0 est la base seule, la position 1 donne « base2 ».
    const candidate =
      start === null
        ? position === 0
          ? base
          : `${base}${position + 1}`
        : `${base}${start + position}`
    if (candidate.length > HANDLE_MAX_LENGTH) break
    if (Handle.safeParse(candidate).success) candidates.push(candidate)
  }
  return candidates
}

/**
 * Le pseudo proposé pour un nom, avant de savoir s'il est libre : le premier candidat de sa base.
 * claim.ts essaie ensuite les suivants si celui-ci est pris.
 */
export const suggestHandle = (name: string, language: Language): string => {
  const base = handleBase(name, language)
  // Une base a toujours au moins un candidat valide dans ses premières positions : un seul mot
  // réservé peut l'empêcher (la base seule), et le suivant est numéroté.
  const [first] = handleCandidates(base, 0, 2)
  if (!first) throw new Error('no handle can be made from this name')
  return first
}
