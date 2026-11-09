// Tests des règles des catégories (tranche R6b, docs/scenarios/refonte.md, « R6b », « Les catégories
// en filtre » et « Ranger les « Autre » ») : le code d'une catégorie, son icône choisie dans une
// liste fixe, son nom de 30 caractères au plus, et ce qu'un administrateur envoie pour en créer une.
import { describe, expect, it } from 'vitest'
import {
  CATEGORY_ICON_CHOICES,
  CATEGORY_NAME_MAX,
  Category,
  CategoryCode,
  CategoryIcon,
  CategoryName,
  OTHER_CATEGORY,
} from './categories'
import { CategoryCreate } from './moderation-catalogue'
import { PROJECT_CATEGORIES } from './projects'

describe('CategoryCode', () => {
  it('accepts lowercase letters, digits and dashes, up to 40 characters', () => {
    for (const code of ['cooking', 'home-garden', '3d', 'u7d20', 'a'.repeat(40)]) {
      expect(CategoryCode.safeParse(code).success, code).toBe(true)
    }
  })

  it('refuses capitals, accents, spaces, other signs, an empty code and 41 characters', () => {
    for (const code of ['Cuisine', 'cuisiné', 'home garden', 'a_b', 'a/b', '', 'a'.repeat(41)]) {
      expect(CategoryCode.safeParse(code).success, code).toBe(false)
    }
  })

  it('keeps the sixteen codes of R6a valid, « other » last', () => {
    for (const code of PROJECT_CATEGORIES) expect(CategoryCode.safeParse(code).success).toBe(true)
    expect(PROJECT_CATEGORIES).toHaveLength(16)
    expect(PROJECT_CATEGORIES.at(-1)).toBe(OTHER_CATEGORY)
  })
})

describe('CategoryIcon', () => {
  it('accepts an icon of the list and refuses any other', () => {
    expect(CategoryIcon.safeParse('flower').success).toBe(true)
    expect(CategoryIcon.safeParse('cooking-pot').success).toBe(true)
    for (const icon of ['pizza', 'Flower', '', '../flower', 'https://example.com/icon.svg']) {
      expect(CategoryIcon.safeParse(icon).success, icon).toBe(false)
    }
  })

  it('offers thirty-two different icons', () => {
    expect(new Set(CATEGORY_ICON_CHOICES).size).toBe(32)
  })
})

describe('CategoryName', () => {
  it('accepts 30 characters and refuses 31', () => {
    // Des lettres accentuées : la limite compte des caractères, pas des octets.
    expect(CATEGORY_NAME_MAX).toBe(30)
    expect(CategoryName.safeParse('é'.repeat(30)).success).toBe(true)
    expect(CategoryName.safeParse('é'.repeat(31)).success).toBe(false)
  })

  it('refuses an empty name and a name on two lines', () => {
    expect(CategoryName.safeParse('').success).toBe(false)
    expect(CategoryName.safeParse('Jardin\nPotager').success).toBe(false)
  })
})

describe('CategoryCreate', () => {
  const garden = { nameFr: 'Jardinage', nameEn: 'Gardening', icon: 'flower' }

  it('takes a French name, an English name and an icon of the list', () => {
    expect(CategoryCreate.safeParse(garden).success).toBe(true)
  })

  it('refuses an icon out of the list, a 31-character name, and a code sent by the client', () => {
    expect(CategoryCreate.safeParse({ ...garden, icon: 'pizza' }).success).toBe(false)
    expect(CategoryCreate.safeParse({ ...garden, nameEn: 'G'.repeat(31) }).success).toBe(false)
    // Le code est tiré du nom français par l'API : le client ne le choisit pas.
    expect(CategoryCreate.safeParse({ ...garden, code: 'other' }).success).toBe(false)
  })
})

describe('Category', () => {
  it('describes a category with its name, its icon and a count of projects', () => {
    const cooking = { code: 'cooking', name: 'Cuisine', icon: 'cooking-pot', projectCount: 3 }
    expect(Category.safeParse(cooking).success).toBe(true)
    expect(Category.safeParse({ ...cooking, icon: 'pizza' }).success).toBe(false)
    expect(Category.safeParse({ ...cooking, projectCount: -1 }).success).toBe(false)
  })
})
