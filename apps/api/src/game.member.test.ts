// Tests d'unité de R19 : le titre d'un membre (choix 12 du plan), tel que sa page et sa récolte le
// montrent. La famille épinglée seulement si elle est obtenue (100 pollen depuis toujours), sinon
// celle de plus de pollen sur les 28 derniers jours, sinon aucun titre.
import { describe, expect, it } from 'vitest'
import { type FamilyPollen, type StoredGameSettings, titleOf } from './game/member'

const settings = (patch: Partial<StoredGameSettings> = {}): StoredGameSettings => ({
  titleForm: 'f',
  pinnedFamily: null,
  inRankings: true,
  harvestNotices: true,
  levelSeen: 1,
  decorated: false,
  tint: 'honey',
  pattern: 'smooth',
  ...patch,
})

const pollen = (patch: Partial<FamilyPollen> = {}): FamilyPollen => ({
  forager: { total: 0, recent: 0 },
  builder: { total: 0, recent: 0 },
  keeper: { total: 0, recent: 0 },
  dancer: { total: 0, recent: 0 },
  ...patch,
})

describe('the title of a member', () => {
  it('gives no title without pollen in the last 28 days', () => {
    expect(titleOf(pollen({ builder: { total: 300, recent: 0 } }), settings())).toBeNull()
  })

  it('takes the family with the most pollen in the last 28 days, in the chosen form', () => {
    const recent = pollen({
      forager: { total: 500, recent: 20 },
      keeper: { total: 40, recent: 40 },
    })
    expect(titleOf(recent, settings({ titleForm: 'm' }))).toEqual({
      family: 'keeper',
      form: 'm',
      pinned: false,
    })
  })

  it('keeps the pinned family once it is obtained', () => {
    const recent = pollen({ forager: { total: 100, recent: 0 }, keeper: { total: 40, recent: 40 } })
    expect(titleOf(recent, settings({ pinnedFamily: 'forager' }))).toEqual({
      family: 'forager',
      form: 'f',
      pinned: true,
    })
  })

  it('falls back on the gestures when the pinned family is no longer obtained', () => {
    const recent = pollen({ forager: { total: 99, recent: 0 }, keeper: { total: 40, recent: 40 } })
    expect(titleOf(recent, settings({ pinnedFamily: 'forager' }))).toEqual({
      family: 'keeper',
      form: 'f',
      pinned: false,
    })
  })
})
