// Page : après le premier lien d'un changement d'adresse (« /email-change/confirmed »).
// L'écran lui-même est dans src/screens.
import { EmailChangeResultScreen } from '../../src/screens/EmailChangeResultScreen'

export default function EmailChangeConfirmed() {
  return <EmailChangeResultScreen step="confirmed" />
}
