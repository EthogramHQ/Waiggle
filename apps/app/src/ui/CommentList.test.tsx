// Tests de `CommentList` (tranche RF, jur-RF2) : la liste des commentaires finit sans phrase ; quand
// la page 2 arrive, le focus du clavier va au premier fil arrivé, jamais à `body`. `CommentList`
// compte elle-même ses fils (`useFirstArrived`) et branche la ref sur la case du fil.
import { arrivedFocusSuite, MORE } from '../testing/arrivedFocus'
import { CommentList } from './CommentList'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

arrivedFocusSuite('CommentList', () => (names, state) => (
  <CommentList state={state} onMore={() => {}} moreLabel={MORE} empty="Pas encore de commentaire.">
    {names.map((name) => (
      <Text key={name}>{name}</Text>
    ))}
  </CommentList>
))
