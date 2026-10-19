// Le nombre d'abonnés d'un membre ou d'un projet (« 12 abonnés »), toujours avec la même allure :
// à côté du bouton « Suivre », ou seul sur sa propre page. Jamais les noms des abonnés.
import { Text } from './Text'

export function FollowerCount({ text }: { text: string }) {
  return (
    <Text variant="callout" tone="secondary">
      {text}
    </Text>
  )
}
