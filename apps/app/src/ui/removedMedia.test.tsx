// Une photo retirée seule par la modération, dans les composants qui la montrent à son auteur (R9,
// décision L2) : la mise à jour (`UpdateEntry`), l'appel à tester (`CallCard`) et la bulle d'un
// retour (`MessageBubble`). Chacun garde la photo sous les yeux de l'auteur, dans un groupe nommé par
// son titre, avec la notice entière, et sans « Remplacer » ni « Supprimer » (aucune route ne
// supprime une photo seule). Le groupe se cherche par son nom puis son rôle : sans `accessible`
// (VoiceOver n'atteindrait plus le lien de contact), RNTL ne le trouve pas par `getByRole`.
import { contactEmail } from '@ruche/brand'
import type { ProjectUpdate } from '@ruche/contracts'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { photoRemoval, removedPhotoPart } from '../testing/moderation'
import { photo } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { rocketUpdate } from '../testing/updates'
import { CallCard } from './CallCard'
import type { ImageSource } from './image'
import { MessageBubble } from './MessageBubble'
import { UpdateEntry } from './UpdateEntry'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const source: ImageSource = { uri: 'http://localhost:3000/media/x.webp' }
const toSource = (url: string | null | undefined): ImageSource | null => (url ? { uri: url } : null)

let openURL: jest.SpyInstance
beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  openURL.mockClear()
})
afterEach(() => openURL.mockRestore())

/** Le groupe nommé `title`, dont le rôle est vérifié. */
const group = (title: string) => {
  const found = screen.getByLabelText(title)
  expect(found.props.role ?? found.props.accessibilityRole).toBe('group')
  return found
}

/** L'objet de l'e-mail préparé par le lien de contact du groupe. */
const subjectIn = async (title: string) => {
  await fireEvent.press(within(group(title)).getByRole('link', { name: contactEmail }))
  const url = String(openURL.mock.calls.at(-1)?.[0] ?? '')
  return decodeURIComponent(url.split('?subject=')[1] ?? '')
}

/** Ni « Remplacer » ni « Supprimer » : une photo seule ne se supprime pas ici. */
const expectNoPartActions = () => {
  expect(screen.queryByRole('button', { name: fr.t(($) => $.removal.part.replace) })).toBeNull()
  expect(screen.queryByRole('button', { name: fr.t(($) => $.removal.part.delete) })).toBeNull()
}

const removalPhrase = fr.t(($) => $.removal.explanation, { explanation: photoRemoval.explanation })

describe('UpdateEntry with a photo removed alone', () => {
  const night = photo('77777777-7777-4777-8777-777777777777', 1600, 900, 'Le balcon de nuit')
  const update: ProjectUpdate = {
    ...rocketUpdate,
    beforeAfter: false,
    photos: [rocketUpdate.photos[0] ?? night, night],
    removedParts: [removedPhotoPart(night.id)],
  }
  const title = fr.t(($) => $.removal.part.titles.photo, { n: 2 })

  it('shows the removed photo as a named tile inside its notice, with the explanation', async () => {
    await renderWithProviders(<UpdateEntry update={update} toSource={toSource} />)

    const notice = group(title)
    expect(
      within(notice).getByLabelText(fr.t(($) => $.gallery.photoOf, { index: 2, count: 2 })),
    ).toBeTruthy()
    expect(within(notice).queryAllByText(containing(removalPhrase)).length).toBeGreaterThan(0)
    expectNoPartActions()
  })

  it('names the photo, the update and the date in the subject of Contester', async () => {
    await renderWithProviders(<UpdateEntry update={update} toSource={toSource} />)

    const subject = await subjectIn(title)
    expect(subject).toMatch(/^Contestation/)
    expect(subject).toContain('la photo 2')
    expect(subject).toContain(rocketUpdate.title ?? '')
    expect(subject).toContain('12 novembre')
  })

  it('shows no notice without a removed part', async () => {
    await renderWithProviders(
      <UpdateEntry update={{ ...update, removedParts: [] }} toSource={toSource} />,
    )

    // Témoin : la mise à jour est là.
    expect(screen.getByText(rocketUpdate.title ?? '')).toBeTruthy()
    expect(screen.queryByLabelText(title)).toBeNull()
  })
})

describe('CallCard with its photo removed alone', () => {
  const title = fr.t(($) => $.removal.part.titles.callPhoto)
  const card = (removed: boolean) => (
    <CallCard
      text="Le nouveau tableau des scores est en ligne."
      at="2026-11-10T12:00:00.000Z"
      photo={{ source, description: 'Le tableau des scores' }}
      photoRemoval={removed ? { removal: photoRemoval, contestSubject: 'Objet' } : null}
    />
  )

  it('keeps the photo inside the notice, which says why and how to contest', async () => {
    await renderWithProviders(card(true))

    const notice = group(title)
    expect(within(notice).getByLabelText('Le tableau des scores')).toBeTruthy()
    expect(within(notice).queryAllByText(containing(removalPhrase)).length).toBeGreaterThan(0)
    expect(await subjectIn(title)).toBe('Objet')
    expectNoPartActions()
  })

  it('shows the photo alone when nothing is removed', async () => {
    await renderWithProviders(card(false))

    expect(screen.getByLabelText('Le tableau des scores')).toBeTruthy()
    expect(screen.queryByLabelText(title)).toBeNull()
  })
})

describe('MessageBubble with its capture removed alone', () => {
  const title = fr.t(($) => $.removal.part.titles.capture)
  const bubble = (removed: boolean) => (
    <MessageBubble
      from="tester"
      kind="feedback"
      mine
      name="Inès"
      text="Le score repart à zéro."
      at="2026-11-10T12:00:00.000Z"
      capture={{ source, description: 'Ta capture' }}
      captureRemoval={removed ? { removal: photoRemoval, contestSubject: 'Objet' } : null}
    />
  )

  it('keeps the capture inside the notice, under the text of the feedback', async () => {
    await renderWithProviders(bubble(true))

    const notice = group(title)
    expect(within(notice).getByLabelText('Ta capture')).toBeTruthy()
    expect(within(notice).queryAllByText(containing(removalPhrase)).length).toBeGreaterThan(0)
    expect(screen.getByText('Le score repart à zéro.')).toBeTruthy()
    expect(await subjectIn(title)).toBe('Objet')
    expectNoPartActions()
  })

  it('shows the capture alone when nothing is removed', async () => {
    await renderWithProviders(bubble(false))

    expect(screen.getByLabelText('Ta capture')).toBeTruthy()
    expect(screen.queryByLabelText(title)).toBeNull()
  })
})
