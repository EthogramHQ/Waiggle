// Tests de la phrase « Ce que tu reçois par e-mail » (email/summary.ts, R8), la colonne de droite de
// la page « Activité » sur ordinateur (planche R8-Activite-Desktop : « Les réponses et les mentions
// tout de suite ; le reste dans le récap du dimanche, à 10 h. »). Une fonction pure : elle lit les
// réglages du membre et choisit une des six phrases de `notifications.summary`. `{{types}}` est la
// liste des types « Tout de suite », dans l'ordre de l'écran des réglages, jointe à la façon de la
// langue (`Intl.ListFormat`), la première lettre en capitale.
//
// L'API attendue (fixée par ces tests, voir le rapport) :
//   emailSummary(preferences: EmailPreferences, t: T, language: string): string
import type { EmailPreferences } from '@ruche/contracts'
import { createI18n } from '../i18n'
import { leaEmailPreferences } from '../testing/email'
import { emailSummary, hivesNowNote } from './summary'

const fr = createI18n('fr')
const en = createI18n('en')
type T = Parameters<typeof emailSummary>[1]
const inFrench = (preferences: EmailPreferences) =>
  emailSummary(preferences, fr.t as unknown as T, 'fr')
const inEnglish = (preferences: EmailPreferences) =>
  emailSummary(preferences, en.t as unknown as T, 'en')

/** Tous les types sur un même choix, le récap activé ou non. */
const allTypes = (choice: 'digest' | 'never', weeklyRecap = true): EmailPreferences => ({
  weeklyRecap,
  reactions: choice,
  comments: choice,
  replies: choice,
  follows: choice,
  updates: choice,
  testers: choice,
  hives: choice,
  // R11 : « Découvertes », le réglage par défaut (le contrat l'exige ; ces tests n'en parlent pas).
  discoveries: 'digest',
})

/** Les réglages de R8 : tous les types dans le récap (R10 : « Ruches » vaut « tout de suite » par
 * défaut ; ces tests gardent leur point de départ). */
const allInRecap: EmailPreferences = { ...leaEmailPreferences, hives: 'digest' }

// R19, relecture juridique du plan (B2) : quand « Ma récolte » est allumé, le récap du dimanche
// porte aussi la semaine du jeu (« Ta semaine ») ; les phrases « proches » le disent.
describe('emailSummary with the harvest notices on', () => {
  const withHarvest = (preferences: EmailPreferences) =>
    emailSummary(preferences, fr.t as unknown as T, 'fr', true)

  it('names the harvest of the week in the recap of the new projects of the people I follow', () => {
    expect(withHarvest(allTypes('never'))).toBe(fr.t(($) => $.game.emailSummary.nothingFriends))
    expect(withHarvest({ ...allTypes('never'), replies: 'now' })).toBe(
      fr.t(($) => $.game.emailSummary.nowFriends, { types: 'Les réponses et les mentions' }),
    )
    expect(withHarvest({ ...allTypes('never'), hives: 'now' })).toBe(
      fr.t(($) => $.game.emailSummary.nowFriendsHives, { types: 'Les ruches' }),
    )
  })

  it('keeps the other sentences, which already promise a recap', () => {
    expect(withHarvest(allInRecap)).toBe(inFrench(allInRecap))
  })

  it('says nothing of the harvest while the harvest notices are off', () => {
    expect(emailSummary(allTypes('never'), fr.t as unknown as T, 'fr', false)).toBe(
      fr.t(($) => $.notifications.summary.nothingFriends),
    )
  })
})

describe('emailSummary', () => {
  // R10 : par défaut, les ruches partent tout de suite (contrat, `email.ts`) ; le reste, dans le récap.
  it('says the hives go at once and the rest in the Sunday recap by default', () => {
    expect(inFrench(leaEmailPreferences)).toBe(
      fr.t(($) => $.notifications.summary.nowAndRest, { types: 'Les ruches' }),
    )
  })

  it('says everything goes in the Sunday recap when every type is in it', () => {
    expect(inFrench(allInRecap)).toBe(fr.t(($) => $.notifications.summary.recapAll))
  })

  it('names the types sent at once, then the recap', () => {
    // La planche R8-Activite-Desktop, mot pour mot.
    expect(inFrench({ ...allInRecap, replies: 'now' })).toBe(
      fr.t(($) => $.notifications.summary.nowAndRest, {
        types: 'Les réponses et les mentions',
      }),
    )
  })

  it('joins several types sent at once in the order of the settings', () => {
    // Le coin des testeurs vient après les commentaires, comme sur l'écran des réglages, même s'il
    // a été réglé le premier.
    expect(inFrench({ ...allInRecap, testers: 'now', comments: 'now' })).toBe(
      fr.t(($) => $.notifications.summary.nowAndRest, {
        types: 'Les commentaires sur tes projets et le coin des testeurs',
      }),
    )
    expect(inFrench({ ...allInRecap, testers: 'now', comments: 'now', replies: 'now' })).toBe(
      fr.t(($) => $.notifications.summary.nowAndRest, {
        types:
          'Les commentaires sur tes projets, les réponses et les mentions et le coin des testeurs',
      }),
    )
  })

  it('says only part of the rest goes in the recap when some types are « never »', () => {
    expect(inFrench({ ...allInRecap, replies: 'now', follows: 'never' })).toBe(
      fr.t(($) => $.notifications.summary.nowAndSome, {
        types: 'Les réponses et les mentions',
      }),
    )
  })

  it('says the rest stays in the Activity when the recap is off', () => {
    expect(inFrench({ ...allInRecap, weeklyRecap: false, replies: 'now' })).toBe(
      fr.t(($) => $.notifications.summary.nowOnly, { types: 'Les réponses et les mentions' }),
    )
  })

  it('says the rest stays in the Activity when no other type goes in the recap and the recap is off', () => {
    expect(inFrench({ ...allTypes('never', false), replies: 'now' })).toBe(
      fr.t(($) => $.notifications.summary.nowOnly, { types: 'Les réponses et les mentions' }),
    )
  })

  // Relecture juridique de R8 (Louis, 12/11/2026) : le récap activé apporte encore les nouveaux
  // projets des proches (choix 7 du scénario), même quand aucun type n'y passe. Ce test disait
  // « le reste seulement dans l'Activité » : il contredisait le scénario.
  it('says the recap still brings the new projects of the people I follow when no type goes in it', () => {
    expect(inFrench({ ...allTypes('never'), replies: 'now' })).toBe(
      fr.t(($) => $.notifications.summary.nowFriends, { types: 'Les réponses et les mentions' }),
    )
  })

  it('says part of it goes in the recap when some types are « never » and none « now »', () => {
    expect(inFrench({ ...allInRecap, reactions: 'never' })).toBe(
      fr.t(($) => $.notifications.summary.recapSome),
    )
  })

  // Le scénario : « quand le récap est désactivé, les types réglés “Dans le récap” le disent ». La
  // colonne ne promet donc aucun e-mail : rien ne part.
  it('says nothing leaves when the recap is off and no type is « now »', () => {
    expect(inFrench(allTypes('digest', false))).toBe(fr.t(($) => $.notifications.summary.nothing))
    expect(inFrench({ ...allTypes('never', false), comments: 'digest' })).toBe(
      fr.t(($) => $.notifications.summary.nothing),
    )
  })

  it('says nothing leaves when every type is « never » and the recap is off', () => {
    expect(inFrench(allTypes('never', false))).toBe(fr.t(($) => $.notifications.summary.nothing))
  })

  // Même relecture : ce test attendait « Aucun e-mail de notification : tout reste dans
  // l'Activité » avec le récap activé, alors que le récap part encore le dimanche.
  it('never says nothing leaves while the recap is on, since it still brings the new projects of the people I follow', () => {
    expect(inFrench(allTypes('never'))).toBe(fr.t(($) => $.notifications.summary.nothingFriends))
  })

  // R10, relecture juridique (C3) : le récap porte « Dans tes ruches » dès que « Ruches » n'est pas
  // à « Jamais » (jobs/weekly-recap.ts) ; « Tout de suite » n'y change rien, il ne vaut que pour les
  // invitations. La phrase ne dit donc pas « seulement les nouveaux projets de tes proches ».
  it('says the recap also brings the hives news when only the hives go at once', () => {
    expect(inFrench({ ...allTypes('never'), hives: 'now' })).toBe(
      fr.t(($) => $.notifications.summary.nowFriendsHives, { types: 'Les ruches' }),
    )
    expect(inEnglish({ ...allTypes('never'), hives: 'now', replies: 'now' })).toBe(
      en.t(($) => $.notifications.summary.nowFriendsHives, {
        types: 'Replies and mentions and hives',
      }),
    )
  })

  // Même relecture : rien ne disait que « Tout de suite », pour les ruches, ne vaut que pour les
  // invitations. La colonne de l'Activité ajoute, sous la phrase, celle qui le dit (`hivesNowNote`),
  // et où vont leurs nouveautés, récap activé ou non.
  it('says « Tout de suite » means only the invitations for the hives, and where their news go', () => {
    const note = (preferences: EmailPreferences) => hivesNowNote(preferences, fr.t as unknown as T)
    expect(note(leaEmailPreferences)).toBe(fr.t(($) => $.notifications.summary.hivesNow))
    expect(note({ ...leaEmailPreferences, weeklyRecap: false })).toBe(
      fr.t(($) => $.notifications.summary.hivesNowRecapOff),
    )
    // Les ruches dans le récap, ou à « Jamais » : rien à préciser.
    expect(note(allInRecap)).toBeNull()
    expect(note({ ...leaEmailPreferences, hives: 'never' })).toBeNull()
  })

  // R11, relecture juridique du plan (J4) : « Découvertes » à « Jamais » retire du récap les
  // nouveaux projets des proches et « Ils cherchent des testeurs » (jobs/weekly-recap.ts). Les trois
  // phrases qui promettaient « seulement les nouveaux projets de tes proches » deviendraient fausses :
  // le récap qui n'a plus rien à porter ne part pas, et la phrase le dit avec les textes de R8.
  describe('with the discoveries off (R11, J4)', () => {
    const noDiscoveries = (preferences: EmailPreferences): EmailPreferences => ({
      ...preferences,
      discoveries: 'never',
    })

    it('says nothing leaves when no type goes in the recap and the discoveries are off', () => {
      // Témoin : avec les découvertes, le récap part encore (test plus haut, nothingFriends).
      expect(inFrench(allTypes('never'))).toBe(fr.t(($) => $.notifications.summary.nothingFriends))
      expect(inFrench(noDiscoveries(allTypes('never')))).toBe(
        fr.t(($) => $.notifications.summary.nothing),
      )
    })

    it('says the rest stays in the Activity when only some types go at once and the discoveries are off', () => {
      expect(inFrench(noDiscoveries({ ...allTypes('never'), replies: 'now' }))).toBe(
        fr.t(($) => $.notifications.summary.nowOnly, { types: 'Les réponses et les mentions' }),
      )
      expect(inEnglish(noDiscoveries({ ...allTypes('never'), replies: 'now' }))).toBe(
        en.t(($) => $.notifications.summary.nowOnly, { types: 'Replies and mentions' }),
      )
    })

    // Les ruches à « Tout de suite » : leurs nouveautés partent encore dans le récap (« Dans tes
    // ruches »), mais plus les nouveaux projets des proches. La phrase ne promet plus ces derniers ;
    // la phrase des ruches (`hivesNowNote`), dessous, dit où vont leurs nouveautés.
    it('no longer promises the new projects of my close ones when only the hives go at once', () => {
      const preferences = noDiscoveries({ ...allTypes('never'), hives: 'now' })
      expect(inFrench(preferences)).toBe(
        fr.t(($) => $.notifications.summary.nowOnly, { types: 'Les ruches' }),
      )
      expect(hivesNowNote(preferences, fr.t as unknown as T)).toBe(
        fr.t(($) => $.notifications.summary.hivesNow),
      )
    })

    it('changes nothing while some types still go in the recap', () => {
      expect(inFrench(noDiscoveries(allInRecap))).toBe(
        fr.t(($) => $.notifications.summary.recapAll),
      )
      expect(inFrench(noDiscoveries({ ...allInRecap, replies: 'now' }))).toBe(
        fr.t(($) => $.notifications.summary.nowAndRest, { types: 'Les réponses et les mentions' }),
      )
    })
  })

  it('writes the list the English way, with a capital first letter', () => {
    expect(inEnglish({ ...allInRecap, replies: 'now' })).toBe(
      en.t(($) => $.notifications.summary.nowAndRest, { types: 'Replies and mentions' }),
    )
    expect(inEnglish({ ...allInRecap, comments: 'now', replies: 'now', testers: 'now' })).toBe(
      en.t(($) => $.notifications.summary.nowAndRest, {
        types: 'Comments on your projects, replies and mentions, and the testers’ corner',
      }),
    )
  })
})
