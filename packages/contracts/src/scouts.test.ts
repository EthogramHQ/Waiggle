// Les règles du contrat des Éclaireuses (R20) : la gravité qui va avec la sorte, les longueurs,
// l'écran joint, les missions de la semaine et la fin du mois, heure de Paris.
import { describe, expect, it } from 'vitest'
import { MeScout } from './accounts'
import { SealCode, sealCategory } from './game'
import {
  JoinScouts,
  programEndOf,
  SCOUT_MISSIONS_MAX,
  SCOUT_PLACES,
  SCOUT_PROGRAM_DAYS,
  SCOUT_REPORT_DAILY,
  ScoutContext,
  ScoutMissionsInput,
  ScoutRemoval,
  ScoutReport,
  ScoutReportInput,
  ScoutReportPatch,
  ScoutScreen,
  ScoutSettings,
  screenPathOf,
} from './scouts'

const context = {
  screen: '/projects/42',
  platform: 'web',
  width: 390,
  appVersion: '1.4.0',
  language: 'fr',
  scheme: 'night',
} as const

const missionId = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f'

describe('the scouts numbers', () => {
  it('keeps 30 places, 30 days, 20 reports a day and 3 missions a week', () => {
    expect(SCOUT_PLACES).toBe(30)
    expect(SCOUT_PROGRAM_DAYS).toBe(30)
    expect(SCOUT_REPORT_DAILY).toBe(20)
    expect(SCOUT_MISSIONS_MAX).toBe(3)
  })
})

describe('ScoutReportInput', () => {
  it('wants a severity for a bug or a confusing spot', () => {
    for (const kind of ['bug', 'confusing'] as const) {
      expect(ScoutReportInput.safeParse({ kind, text: 'Ça coince' }).success).toBe(false)
      expect(
        ScoutReportInput.safeParse({ kind, severity: 'blocking', text: 'Ça coince' }).success,
      ).toBe(true)
    }
  })

  it('refuses a severity on an idea or a « J’adore »', () => {
    for (const kind of ['idea', 'love'] as const) {
      expect(ScoutReportInput.safeParse({ kind, text: 'Bravo' }).success).toBe(true)
      expect(ScoutReportInput.safeParse({ kind, severity: 'minor', text: 'Bravo' }).success).toBe(
        false,
      )
    }
  })

  it('accepts a text of 2 000 characters, not one more, and never an empty one', () => {
    expect(ScoutReportInput.safeParse({ kind: 'idea', text: 'a'.repeat(2000) }).success).toBe(true)
    expect(ScoutReportInput.safeParse({ kind: 'idea', text: 'a'.repeat(2001) }).success).toBe(false)
    expect(ScoutReportInput.safeParse({ kind: 'idea', text: '   ' }).success).toBe(false)
    expect(ScoutReportInput.safeParse({ kind: 'idea', text: '​' }).success).toBe(false)
  })

  it('takes a mission and the joined context, and nothing else', () => {
    expect(
      ScoutReportInput.safeParse({ kind: 'love', text: 'Top', missionId, context }).success,
    ).toBe(true)
    expect(ScoutReportInput.safeParse({ kind: 'love', text: 'Top', missionId: '42' }).success).toBe(
      false,
    )
    expect(ScoutReportInput.safeParse({ kind: 'love', text: 'Top', memberId: 'x' }).success).toBe(
      false,
    )
    expect(ScoutReportInput.safeParse({ kind: 'praise', text: 'Top' }).success).toBe(false)
  })
})

describe('ScoutContext', () => {
  it('accepts what the sheet joins', () => {
    expect(ScoutContext.safeParse(context).success).toBe(true)
    expect(ScoutContext.safeParse({ ...context, platform: 'ios', scheme: 'day' }).success).toBe(
      true,
    )
  })

  it('refuses a screen that does not start with « / »', () => {
    for (const screen of ['projects/42', 'https://waiggle.example/projects', '', ' /projects']) {
      expect(ScoutScreen.safeParse(screen).success, screen).toBe(false)
    }
    expect(ScoutScreen.safeParse('/').success).toBe(true)
  })

  it('refuses a screen with a space or a line break, or longer than 200', () => {
    expect(ScoutScreen.safeParse('/projects/a b').success).toBe(false)
    expect(ScoutScreen.safeParse('/projects\n/42').success).toBe(false)
    expect(ScoutScreen.safeParse(`/${'a'.repeat(199)}`).success).toBe(true)
    expect(ScoutScreen.safeParse(`/${'a'.repeat(200)}`).success).toBe(false)
  })

  it('keeps the address without its parameters', () => {
    expect(screenPathOf('/projects/42?token=abc')).toBe('/projects/42')
    expect(screenPathOf('/settings#scouts')).toBe('/settings')
    expect(screenPathOf('/feed')).toBe('/feed')
  })

  it('bounds the width, the version, the platform, the language and the scheme', () => {
    expect(ScoutContext.safeParse({ ...context, width: 10_000 }).success).toBe(true)
    expect(ScoutContext.safeParse({ ...context, width: 10_001 }).success).toBe(false)
    expect(ScoutContext.safeParse({ ...context, width: -1 }).success).toBe(false)
    expect(ScoutContext.safeParse({ ...context, width: 390.5 }).success).toBe(false)
    expect(ScoutContext.safeParse({ ...context, appVersion: 'v'.repeat(64) }).success).toBe(true)
    expect(ScoutContext.safeParse({ ...context, appVersion: 'v'.repeat(65) }).success).toBe(false)
    expect(ScoutContext.safeParse({ ...context, platform: 'windows' }).success).toBe(false)
    expect(ScoutContext.safeParse({ ...context, language: 'de' }).success).toBe(false)
    expect(ScoutContext.safeParse({ ...context, scheme: 'dusk' }).success).toBe(false)
  })
})

describe('ScoutMissionsInput', () => {
  it('takes 0 to 3 missions, English optional', () => {
    expect(ScoutMissionsInput.safeParse({ missions: [] }).success).toBe(true)
    const three = [
      { textFr: 'Publie un projet avec une photo', textEn: 'Publish a project with a photo' },
      { id: missionId, textFr: 'Essaie Waiggle sur ton téléphone' },
      { textFr: 'Invite un proche' },
    ]
    expect(ScoutMissionsInput.safeParse({ missions: three }).success).toBe(true)
    expect(
      ScoutMissionsInput.safeParse({ missions: [...three, { textFr: 'Une de trop' }] }).success,
    ).toBe(false)
  })

  it('wants a French text of 1 to 200 characters on one line, and each mission once', () => {
    expect(ScoutMissionsInput.safeParse({ missions: [{ textFr: '' }] }).success).toBe(false)
    expect(ScoutMissionsInput.safeParse({ missions: [{ textFr: 'a'.repeat(200) }] }).success).toBe(
      true,
    )
    expect(ScoutMissionsInput.safeParse({ missions: [{ textFr: 'a'.repeat(201) }] }).success).toBe(
      false,
    )
    expect(ScoutMissionsInput.safeParse({ missions: [{ textFr: 'a\nb' }] }).success).toBe(false)
    expect(ScoutMissionsInput.safeParse({ missions: [{ textEn: 'Only English' }] }).success).toBe(
      false,
    )
    expect(
      ScoutMissionsInput.safeParse({
        missions: [
          { id: missionId, textFr: 'Une' },
          { id: missionId, textFr: 'Deux' },
        ],
      }).success,
    ).toBe(false)
  })
})

describe('ScoutReportPatch', () => {
  it('changes a status, a private note or the note for the scout', () => {
    for (const body of [
      { status: 'read' },
      { status: 'parked' },
      { adminNote: 'Vu sur iPhone SE' },
      { adminNote: null },
      { status: 'fixed', fixedNote: 'Corrigé le 28/11, merci !' },
      { fixedNote: 'Corrigé le 28/11, merci !' },
    ]) {
      expect(ScoutReportPatch.safeParse(body).success, JSON.stringify(body)).toBe(true)
    }
  })

  it('refuses an empty body, « sent », a note for the scout without « fixed », and long notes', () => {
    for (const body of [
      {},
      { status: 'sent' },
      { status: 'read', fixedNote: 'Merci' },
      { fixedNote: 'a'.repeat(301) },
      { adminNote: 'a'.repeat(2001) },
      { status: 'read', memberId: 'x' },
    ]) {
      expect(ScoutReportPatch.safeParse(body).success, JSON.stringify(body)).toBe(false)
    }
    expect(ScoutReportPatch.safeParse({ fixedNote: 'a'.repeat(300) }).success).toBe(true)
    expect(ScoutReportPatch.safeParse({ adminNote: 'a'.repeat(2000) }).success).toBe(true)
  })
})

describe('the other inputs', () => {
  it('wants a typed code, and a boolean for the Drop', () => {
    expect(JoinScouts.safeParse({ code: 'eclaireuses-2026' }).success).toBe(true)
    expect(JoinScouts.safeParse({ code: '  ' }).success).toBe(false)
    expect(ScoutSettings.safeParse({ showDrop: false }).success).toBe(true)
    expect(ScoutSettings.safeParse({}).success).toBe(false)
    expect(ScoutSettings.safeParse({ showDrop: 'no' }).success).toBe(false)
  })

  it('wants a reason of 1 to 500 characters to remove a scout', () => {
    expect(ScoutRemoval.safeParse({ reason: 'Retours injurieux' }).success).toBe(true)
    expect(ScoutRemoval.safeParse({ reason: '' }).success).toBe(false)
    expect(ScoutRemoval.safeParse({}).success).toBe(false)
    expect(ScoutRemoval.safeParse({ reason: 'a'.repeat(500) }).success).toBe(true)
    expect(ScoutRemoval.safeParse({ reason: 'a'.repeat(501) }).success).toBe(false)
  })
})

describe('what the API returns', () => {
  it('never lets the private note into a report seen by its author', () => {
    const report = {
      id: missionId,
      kind: 'bug',
      severity: 'annoying',
      text: 'Le bouton ne répond pas',
      mission: null,
      context,
      mediaUrl: null,
      status: 'sent',
      fixedNote: null,
      createdAt: '2026-11-26T10:00:00.000Z',
      fixedAt: null,
    }
    expect(ScoutReport.safeParse(report).success).toBe(true)
    expect(ScoutReport.safeParse({ ...report, adminNote: 'privée' }).success).toBe(false)
  })

  it('keeps a removed scout in Me, inactive, with 0 to 3 missions left', () => {
    const scout = {
      active: false,
      joinedAt: '2026-11-20T10:00:00.000Z',
      removedAt: '2026-11-25T10:00:00.000Z',
      showDrop: true,
      programEndsAt: null,
      missionsLeft: 0,
    }
    expect(MeScout.safeParse(scout).success).toBe(true)
    expect(MeScout.safeParse({ ...scout, missionsLeft: SCOUT_MISSIONS_MAX + 1 }).success).toBe(
      false,
    )
  })
})

describe('the founder seal', () => {
  it('is a seal code, and not a category', () => {
    expect(SealCode.safeParse('scout_founder').success).toBe(true)
    expect(sealCategory('scout_founder')).toBeNull()
  })
})

describe('programEndOf', () => {
  // Paris : +1 h en hiver, +2 h en été. En 2026, l'heure d'hiver revient le 25 octobre ; en 2027,
  // l'heure d'été commence le 28 mars.
  it('ends at midnight in Paris after the 30th day, launch day counting as 1', () => {
    // Lancé le 26 novembre à 11 h (Paris) : 30e jour le 25 décembre, fin le 26 à 0 h (23 h UTC).
    expect(programEndOf(new Date('2026-11-26T10:00:00.000Z')).toISOString()).toBe(
      '2026-12-25T23:00:00.000Z',
    )
  })

  it('counts the day of Paris, not the day of UTC', () => {
    // 23 h 30 UTC le 26 novembre, c'est déjà le 27 à Paris : fin le 27 décembre à 0 h.
    expect(programEndOf(new Date('2026-11-26T23:30:00.000Z')).toISOString()).toBe(
      '2026-12-26T23:00:00.000Z',
    )
    // 23 h 30 à Paris le 26 novembre : encore le 26.
    expect(programEndOf(new Date('2026-11-26T22:30:00.000Z')).toISOString()).toBe(
      '2026-12-25T23:00:00.000Z',
    )
  })

  it('lands on midnight of winter time when the month crosses the end of summer time', () => {
    // Lancé le 10 octobre (été, +2) : fin le 9 novembre à 0 h, en hiver (+1), soit 23 h UTC le 8.
    expect(programEndOf(new Date('2026-10-10T08:00:00.000Z')).toISOString()).toBe(
      '2026-11-08T23:00:00.000Z',
    )
  })

  it('lands on midnight of summer time when the month crosses the start of summer time', () => {
    // Lancé le 15 mars 2027 (hiver, +1) : fin le 14 avril à 0 h, en été (+2), soit 22 h UTC le 13.
    expect(programEndOf(new Date('2027-03-15T12:00:00.000Z')).toISOString()).toBe(
      '2027-04-13T22:00:00.000Z',
    )
  })

  it('ends on the night of a time change itself', () => {
    // Lancé le 26 septembre 2026 : 30e jour le 25 octobre (jour du retour à l'heure d'hiver), fin le
    // 26 octobre à 0 h, déjà en hiver (+1).
    expect(programEndOf(new Date('2026-09-26T12:00:00.000Z')).toISOString()).toBe(
      '2026-10-25T23:00:00.000Z',
    )
    // Lancé le 27 février 2027 : 30e jour le 28 mars (passage à l'heure d'été), fin le 29 à 0 h (+2).
    expect(programEndOf(new Date('2027-02-27T12:00:00.000Z')).toISOString()).toBe(
      '2027-03-28T22:00:00.000Z',
    )
  })
})
