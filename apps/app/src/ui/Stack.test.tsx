// Tests de `Stack` en liste (tranche RF, jur-RF2) : une liste qui se lit par pages et finit sans
// phrase donne le focus du clavier à la première carte arrivée avec la page 2, jamais à `body`.
// `Stack` branche la ref sur la case (`listitem`) de l'élément de rang `firstArrived.index`.
import { arrivedFocusSuite, MORE, type PageState } from '../testing/arrivedFocus'
import { FeedEnd, useFirstArrived } from './FeedEnd'
import { Stack } from './Stack'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Le composant de test : le hook compte les cartes, `Stack` pose la ref, `FeedEnd` y met le focus.
const List = ({ names, state }: { names: string[]; state: PageState }) => {
  const arrived = useFirstArrived(names.length, state === 'loading')
  return (
    <>
      <Stack accessibilityRole="list" firstArrived={arrived}>
        {names.map((name) => (
          <Text key={name}>{name}</Text>
        ))}
      </Stack>
      <FeedEnd state={state} moreLabel={MORE} onMore={() => {}} firstArrived={arrived.ref} />
    </>
  )
}

arrivedFocusSuite('Stack as a list', () => (names, state) => <List names={names} state={state} />)
