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
import { emailSummary } from './summary'

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
})

describe('emailSummary', () => {
  it('says everything goes in the Sunday recap by default', () => {
    expect(inFrench(leaEmailPreferences)).toBe(fr.t(($) => $.notifications.summary.recapAll))
  })

  it('names the types sent at once, then the recap', () => {
    // La planche R8-Activite-Desktop, mot pour mot.
    expect(inFrench({ ...leaEmailPreferences, replies: 'now' })).toBe(
      fr.t(($) => $.notifications.summary.nowAndRest, {
        types: 'Les réponses et les mentions',
      }),
    )
  })

  it('joins several types sent at once in the order of the settings', () => {
    // Le coin des testeurs vient après les commentaires, comme sur l'écran des réglages, même s'il
    // a été réglé le premier.
    expect(inFrench({ ...leaEmailPreferences, testers: 'now', comments: 'now' })).toBe(
      fr.t(($) => $.notifications.summary.nowAndRest, {
        types: 'Les commentaires sur tes projets et le coin des testeurs',
      }),
    )
    expect(
      inFrench({ ...leaEmailPreferences, testers: 'now', comments: 'now', replies: 'now' }),
    ).toBe(
      fr.t(($) => $.notifications.summary.nowAndRest, {
        types:
          'Les commentaires sur tes projets, les réponses et les mentions et le coin des testeurs',
      }),
    )
  })

  it('says only part of the rest goes in the recap when some types are « never »', () => {
    expect(inFrench({ ...leaEmailPreferences, replies: 'now', follows: 'never' })).toBe(
      fr.t(($) => $.notifications.summary.nowAndSome, {
        types: 'Les réponses et les mentions',
      }),
    )
  })

  it('says the rest stays in the Activity when the recap is off', () => {
    expect(inFrench({ ...leaEmailPreferences, weeklyRecap: false, replies: 'now' })).toBe(
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
    expect(inFrench({ ...leaEmailPreferences, reactions: 'never' })).toBe(
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

  it('writes the list the English way, with a capital first letter', () => {
    expect(inEnglish({ ...leaEmailPreferences, replies: 'now' })).toBe(
      en.t(($) => $.notifications.summary.nowAndRest, { types: 'Replies and mentions' }),
    )
    expect(
      inEnglish({ ...leaEmailPreferences, comments: 'now', replies: 'now', testers: 'now' }),
    ).toBe(
      en.t(($) => $.notifications.summary.nowAndRest, {
        types: 'Comments on your projects, replies and mentions, and the testers’ corner',
      }),
    )
  })
})
