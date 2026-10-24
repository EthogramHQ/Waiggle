// Le logo : le nom de l'appli en minuscules, dans la police des titres. Il vient de @ruche/brand :
// si l'appli change de nom, le logo suit. Touchable s'il mène quelque part (l'accueil).
import { appName } from '@ruche/brand'
import { Pressed } from './Pressed'
import { Text } from './Text'

type Props = {
  size?: 'small' | 'large' | 'huge'
  onPress?: () => void
  /** Le logo sert de titre à la page : il est annoncé comme tel, avec cette phrase. */
  header?: string
}

const variants = { small: 'heading', large: 'display', huge: 'hero' } as const

export function Wordmark({ size = 'small', onPress, header }: Props) {
  const mark = (
    // Les lecteurs d'écran lisent le nom tel qu'il s'écrit (« Waiggle »), pas en minuscules.
    // maxScale : un logo déjà très grand n'a pas besoin de doubler avec le réglage de taille.
    <Text
      variant={variants[size]}
      accessibilityLabel={header ?? appName}
      // Le logo qui sert de titre (l'accueil d'un visiteur) est le titre de la page : niveau 1.
      {...(header ? { heading: 1 as const } : null)}
      maxScale={1.2}
    >
      {appName.toLowerCase()}
    </Text>
  )
  if (!onPress) return mark
  return (
    <Pressed label={appName} onPress={onPress} role="link">
      {mark}
    </Pressed>
  )
}
