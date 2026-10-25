// Page : après le second lien d'un changement d'adresse (« /email-change/done »).
// L'écran lui-même est dans src/screens.
import { EmailChangeResultScreen } from '../../src/screens/EmailChangeResultScreen'

export default function EmailChangeDone() {
  return <EmailChangeResultScreen step="done" />
}
