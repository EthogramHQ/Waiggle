// `focusRef` de CountedTitle (R5b, des-A7) : un écran peut poser le focus sur le titre d'une section,
// avec son nombre comme sans lui ; sur le web, le titre n'est focalisable que par le code.
import { screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { CountedTitle } from './CountedTitle'
import type { Focusable } from './focus'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const props = (node: unknown) => (node as { props: Record<string, unknown> }).props

describe('CountedTitle, focusRef', () => {
  it('gives the title with its number, named as it is read', async () => {
    const focusRef = createRef<Focusable>()
    await renderWithProviders(
      <CountedTitle
        title="Commentaires"
        count={6}
        spokenCount="6 commentaires"
        focusRef={focusRef}
      />,
    )

    expect(props(focusRef.current).accessibilityLabel).toBe('Commentaires, 6 commentaires')
  })

  it('gives the title alone when the count is 0', async () => {
    const focusRef = createRef<Focusable>()
    await renderWithProviders(
      <CountedTitle
        title="Commentaires"
        count={0}
        spokenCount="0 commentaire"
        focusRef={focusRef}
      />,
    )

    expect(screen.getByRole('header', { name: 'Commentaires' })).toBeTruthy()
    expect(props(focusRef.current).accessibilityRole).toBe('header')
  })

  it('makes the title reachable by the code only, on the web', async () => {
    const focusRef = createRef<Focusable>()
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <CountedTitle
          title="Commentaires"
          count={6}
          spokenCount="6 commentaires"
          focusRef={focusRef}
        />,
      )

      expect(props(focusRef.current).tabIndex).toBe(-1)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('stays out of the way without a focusRef', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <CountedTitle title="Commentaires" count={6} spokenCount="6 commentaires" />,
      )

      expect(screen.getByRole('header').props.tabIndex).toBeUndefined()
    } finally {
      jest.restoreAllMocks()
    }
  })
})
