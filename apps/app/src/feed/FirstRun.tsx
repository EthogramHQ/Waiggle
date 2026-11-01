// Le premier lancement (R4, F-Fil9, planche R4-Fil-Premier) : ce que voit, à la place du fil, un
// membre qui ne suit encore personne. La mascotte et « Bonjour Inès ! », « Ton fil t'attend » et ce
// qu'il faut faire ; puis « Proches à suivre » (5 membres qui ont publié récemment) ; puis l'encart
// « Ou publie ton premier projet. », absent pour un compte suspendu, qui ne peut plus publier.
//
// HomeScreen le pose quand la première page du fil dit `followsAnyone: false`. Comme tout ce qui
// est dans feed/, ce fichier assemble des composants de ui/ sans écrire de style.
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSuspension } from '../moderation/suspension'
import { PeopleToFollow } from '../suggestions/PeopleToFollow'
import { Greeting } from '../ui/Greeting'
import { PublishPrompt } from '../ui/PublishPrompt'
import { Stack } from '../ui/Stack'

/** Au premier lancement, cinq proches à suivre (trois dans la colonne de droite, plus tard). */
const FIRST_RUN_SUGGESTIONS = 5

type Props = {
  /** Le nom du membre, pour le salut. */
  name: string
}

export function FirstRun({ name }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const { suspended } = useSuspension()
  return (
    <Stack gap="xl" align="stretch">
      <Greeting
        hello={t(($) => $.feed.firstRun.hello, { name })}
        title={t(($) => $.feed.firstRun.title)}
        body={t(($) => $.feed.firstRun.body)}
      />
      <PeopleToFollow max={FIRST_RUN_SUGGESTIONS} />
      {suspended ? null : <PublishPrompt onPublish={() => router.push('/projects/new')} />}
    </Stack>
  )
}
