// La section « Parties retirées » du catalogue (R9) : le lien vers notre adresse de contact
// (ContactLink : l'adresse seule, un autre texte avec un objet, une adresse coupée à l'étroit) et
// une partie retirée vue par son auteur (RemovedPart : une photo après un signalement, au nom de la
// loi ; une description retirée sans signalement, sans « Remplacer » ; un pseudo, sans aucun bouton ;
// une explication très longue, avec une adresse sans espace). Fichier à part de CatalogueScreen.tsx,
// qui l'importe en une ligne : le catalogue est partagé par toute l'interface. Ses exemples (un outil
// de développement, absent de l'appli publiée) sont écrits ici, en français et en anglais.
import type { Removal } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { ContactLink } from '../ui/ContactLink'
import { ProjectCover } from '../ui/ProjectCover'
import { RemovedPart } from '../ui/RemovedPart'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'

const fr = {
  title: 'Parties retirées',
  contactAddress: 'ContactLink : l’adresse seule, sans objet (connexion, réglages)',
  contactText: 'ContactLink : un autre texte (« Contester »), avec un objet qui nomme la décision',
  contactText2: 'Contester',
  photo: 'RemovedPart : une photo, après un signalement, au nom de la loi',
  photoTitle: 'La photo 2 a été retirée par la modération',
  photoWhy:
    'Cette photo montre une personne reconnaissable sur son balcon, sans son accord (droit à l’image).',
  description: 'RemovedPart : la description, sans signalement, sans « Remplacer »',
  descriptionTitle: 'La description a été retirée par la modération',
  descriptionText:
    'Écris-moi en privé pour recevoir la version complète, contre un petit virement : je t’envoie le lien.',
  descriptionWhy:
    'La description invite à payer en dehors de l’appli, ce que les règles interdisent.',
  handle: 'RemovedPart : le pseudo, sans aucun bouton (l’écran propose « Choisir mon pseudo »)',
  handleTitle: 'Ton pseudo a été retiré par la modération',
  handleText: '@le_vrai_support_officiel',
  handleWhy: 'Ce pseudo laisse croire que tu parles au nom de l’équipe.',
  long: 'RemovedPart : une explication très longue, avec une adresse sans espace',
  longWhy:
    'Le lien https://une-adresse-tres-longue-sans-aucune-espace.example/chemin/encore/plus/long mène à une page qui demande le mot de passe des membres en se faisant passer pour la connexion : c’est de l’hameçonnage, et la loi l’interdit.',
  subject: 'Contestation : retrait de la photo 2 de « Le ciel de ce soir » du 12 nov.',
}

const en: typeof fr = {
  title: 'Removed parts',
  contactAddress: 'ContactLink: the address alone, with no subject (sign-in, settings)',
  contactText: 'ContactLink: another text (“Contest”), with a subject naming the decision',
  contactText2: 'Contest',
  photo: 'RemovedPart: a photo, after a report, on the ground of the law',
  photoTitle: 'Photo 2 was removed by moderation',
  photoWhy: 'This photo shows a recognizable person on their balcony, without their consent.',
  description: 'RemovedPart: the description, without a report, without “Replace”',
  descriptionTitle: 'The description was removed by moderation',
  descriptionText:
    'Message me privately to get the full version for a small transfer: I’ll send you the link.',
  descriptionWhy: 'The description asks for payment outside the app, which the rules forbid.',
  handle: 'RemovedPart: the username, with no button (the screen offers “Choose my username”)',
  handleTitle: 'Your username was removed by moderation',
  handleText: '@the_real_official_support',
  handleWhy: 'This username suggests you speak for the team.',
  long: 'RemovedPart: a very long explanation, with an address without spaces',
  longWhy:
    'The link https://a-very-long-address-without-any-space.example/path/even/longer/still leads to a page asking for members’ passwords while posing as the sign-in: this is phishing, and the law forbids it.',
  subject: 'Contest: removal of photo 2 of “Tonight’s sky” on Nov 12',
}

/** Les décisions d'exemple : leurs dates sont fixes (midi à Paris, le même jour partout). */
const removals = (l: typeof fr) => {
  const photo: Removal = {
    ground: 'illegal',
    explanation: l.photoWhy,
    at: '2026-11-12T11:00:00.000Z',
    afterReport: true,
  }
  const description: Removal = {
    ground: 'rules',
    explanation: l.descriptionWhy,
    at: '2026-11-08T09:30:00.000Z',
    afterReport: false,
  }
  const handle: Removal = { ...description, explanation: l.handleWhy, afterReport: true }
  const long: Removal = { ...photo, explanation: l.longWhy }
  return { photo, description, handle, long }
}

const noop = () => {}

/** Une légende d'exemple, au-dessus de son état. */
function Caption({ children }: { children: string }) {
  return (
    <Text variant="caption" tone="muted">
      {children}
    </Text>
  )
}

export function RemovalR9Catalogue() {
  const { i18n } = useTranslation()
  const l = i18n.language === 'en' ? en : fr
  const examples = removals(l)
  return (
    <Stack gap="lg">
      <Text variant="headline" heading={2}>
        {l.title}
      </Text>
      <Stack gap="sm">
        <Caption>{l.contactAddress}</Caption>
        <ContactLink />
      </Stack>
      <Stack gap="sm">
        <Caption>{l.contactText}</Caption>
        <ContactLink subject={l.subject}>{l.contactText2}</ContactLink>
      </Stack>
      <Stack gap="sm">
        <Caption>{l.photo}</Caption>
        <RemovedPart
          title={l.photoTitle}
          removal={examples.photo}
          contestSubject={l.subject}
          onReplace={noop}
          onDelete={noop}
        >
          {/* La photo retirée, que l'auteur voit encore (ici, une couverture sans image). */}
          <ProjectCover height={160} />
        </RemovedPart>
      </Stack>
      <Stack gap="sm">
        <Caption>{l.description}</Caption>
        <RemovedPart
          title={l.descriptionTitle}
          removal={examples.description}
          contestSubject={l.subject}
          onReplace={null}
          onDelete={noop}
        >
          <Text variant="body" tone="secondary">
            {l.descriptionText}
          </Text>
        </RemovedPart>
      </Stack>
      <Stack gap="sm">
        <Caption>{l.handle}</Caption>
        <RemovedPart
          title={l.handleTitle}
          removal={examples.handle}
          contestSubject={l.subject}
          onReplace={null}
          onDelete={null}
        >
          <Text variant="body" weight={600}>
            {l.handleText}
          </Text>
        </RemovedPart>
      </Stack>
      <Stack gap="sm">
        <Caption>{l.long}</Caption>
        <RemovedPart
          title={l.photoTitle}
          removal={examples.long}
          contestSubject={l.subject}
          onReplace={noop}
          onDelete={noop}
        />
      </Stack>
    </Stack>
  )
}
