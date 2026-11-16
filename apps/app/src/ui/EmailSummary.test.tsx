// Tests de la colonne « Ce que tu reçois par e-mail » (ui/EmailSummary.tsx, R8), à droite de la page
// « Activité » sur ordinateur (planche R8-Activite-Desktop) : un titre, la phrase qui résume les
// réglages (email/summary.ts) et « Régler les notifications ». Depuis R11 (« Moins de mots »), le
// rappel « seulement des nombres » est dit dans les réglages des notifications, plus ici.
//
// L'API attendue (fixée par ces tests, voir le rapport) :
//   EmailSummary({ title: string; summary: string | null; actionLabel: string;
//                  onAction: () => void })
// `summary: null` : les réglages ne sont pas (encore) lus ; la colonne ne promet rien.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { EmailSummary } from './EmailSummary'

const texts = {
  title: 'Ce que tu reçois par e-mail',
  summary:
    'Les réponses et les mentions tout de suite ; le reste dans le récap du dimanche, à 10 h.',
  actionLabel: 'Régler les notifications',
}

/** Le contrôle « Régler les notifications » : un lien vers les réglages, ou un bouton. */
const action = () =>
  screen.queryByRole('link', { name: texts.actionLabel }) ??
  screen.getByRole('button', { name: texts.actionLabel })

describe('EmailSummary', () => {
  it('has a title of level 2, under the title of the page', async () => {
    await renderWithProviders(<EmailSummary {...texts} onAction={() => {}} />)

    // Jamais un second titre de niveau 1 : sur le web, `aria-level` dit 2.
    const heading = screen.getByRole('header', { name: texts.title })
    expect(heading.props['aria-level']).not.toBe(1)
  })

  it('says what leaves by email', async () => {
    await renderWithProviders(<EmailSummary {...texts} onAction={() => {}} />)

    expect(screen.getByText(texts.summary)).toBeTruthy()
  })

  // R10, relecture juridique (C3) : la phrase des ruches (« Tout de suite » ne vaut que pour les
  // invitations) se lit sous le résumé, dans la carte, en paragraphe à part.
  it('says the detail under the summary, in its own paragraph', async () => {
    const detail = 'Pour les ruches, « Tout de suite » ne vaut que pour les invitations.'
    await renderWithProviders(<EmailSummary {...texts} detail={detail} onAction={() => {}} />)

    expect(screen.getByText(texts.summary)).toBeTruthy()
    expect(screen.getByText(detail)).toBeTruthy()
  })

  it('leads to the notification settings', async () => {
    const onAction = jest.fn()
    await renderWithProviders(<EmailSummary {...texts} onAction={onAction} />)

    await fireEvent.press(action())

    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('promises nothing while the settings are not read, and still leads to them', async () => {
    await renderWithProviders(<EmailSummary {...texts} summary={null} onAction={() => {}} />)

    // Témoin : la colonne est là…
    expect(screen.getByRole('header', { name: texts.title })).toBeTruthy()
    // … sans phrase de réglages, mais avec le chemin vers eux.
    expect(screen.queryByText(texts.summary)).toBeNull()
    expect(action()).toBeTruthy()
  })
})
