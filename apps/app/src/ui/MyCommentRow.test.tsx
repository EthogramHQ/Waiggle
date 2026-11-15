// Tests de la ligne de « Mes commentaires » (tranche R11) : un lien vers le commentaire quand le
// projet se voit, rien à ouvrir sinon, « Supprimer » à part, nommé par son extrait, et la vue du
// focus donnée à l'écran (le lien, ou « Supprimer » sur une ligne qui n'ouvre rien).
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef } from 'react'
import type { View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { MyCommentRow } from './MyCommentRow'

const base = {
  goneLabel: 'Projet qui n’est plus visible',
  date: '2026-11-14T18:00:00.000Z',
  body: 'Les couleurs du ciel sont superbes, bravo !',
  deleteText: 'Supprimer',
  deleteLabel: 'Supprimer le commentaire : Les couleurs du ciel sont superbes, bravo !',
}

describe('MyCommentRow', () => {
  it('opens the comment through a link named by its project and excerpt, described by the marks', async () => {
    const onOpen = jest.fn()
    const onDelete = jest.fn()
    await renderWithProviders(
      <MyCommentRow
        {...base}
        projectTitle="Raconte-moi un tableau"
        openLabel="Ton commentaire sur Raconte-moi un tableau : Les couleurs"
        href="/projects/p1?comment=c1"
        onOpen={onOpen}
        onDelete={onDelete}
        marks={[{ icon: 'eye-slash', label: 'Masqué par l’auteur du projet' }]}
      />,
    )

    const link = screen.getByRole('link', {
      name: 'Ton commentaire sur Raconte-moi un tableau : Les couleurs',
    })
    expect(String(link.props.accessibilityHint)).toContain('Masqué par l’auteur du projet')
    expect(screen.getByText('Raconte-moi un tableau')).toBeTruthy()
    expect(screen.getByText(base.body)).toBeTruthy()
    await fireEvent.press(link)
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onDelete).not.toHaveBeenCalled()

    // « Supprimer » est un bouton à part, jamais dans le lien.
    await fireEvent.press(screen.getByRole('button', { name: base.deleteLabel }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('shows « Réponse » above a reply', async () => {
    await renderWithProviders(
      <MyCommentRow
        {...base}
        projectTitle="Le jardin qui parle"
        replyLabel="Réponse"
        openLabel="Ta réponse"
        onOpen={() => {}}
        onDelete={() => {}}
      />,
    )

    expect(screen.getByText('Réponse')).toBeTruthy()
  })

  it('names no project and opens nothing when the project is no longer visible', async () => {
    await renderWithProviders(
      <MyCommentRow
        {...base}
        projectTitle={null}
        openLabel="Ton commentaire sur ?"
        onOpen={() => {}}
        onDelete={() => {}}
      />,
    )

    expect(screen.getByText(base.goneLabel)).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getAllByRole('button').map((button) => button.props.accessibilityLabel)).toEqual([
      base.deleteLabel,
    ])
  })

  it('gives the screen the link, or « Supprimer » on a row that opens nothing', async () => {
    const linkRef = createRef<View>()
    const view = await renderWithProviders(
      <MyCommentRow
        {...base}
        ref={linkRef}
        projectTitle="Raconte-moi un tableau"
        openLabel="Ouvrir"
        onOpen={() => {}}
        onDelete={() => {}}
      />,
    )
    expect(
      (linkRef.current as unknown as { props: { accessibilityLabel?: string } }).props,
    ).toMatchObject({ accessibilityLabel: 'Ouvrir' })
    await view.unmount()

    const deleteRef = createRef<View>()
    await renderWithProviders(
      <MyCommentRow {...base} ref={deleteRef} projectTitle={null} onDelete={() => {}} />,
    )
    expect(
      (deleteRef.current as unknown as { props: { accessibilityLabel?: string } }).props,
    ).toMatchObject({ accessibilityLabel: base.deleteLabel })
  })
})
