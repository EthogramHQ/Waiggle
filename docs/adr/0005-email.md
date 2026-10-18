# 0005 — E-mails : Scaleway pour le compte, Brevo pour le marketing, l'auto-hébergement plus tard

- Statut : accepté
- Date : 2026-10-14

(Le numéro 0004 a été utilisé par une décision retirée, voir l'ADR 0003.)

## Contexte

Les e-mails de compte (vérification de l'adresse, adresse déjà utilisée, plus tard mot de passe
oublié) partaient par Brevo. Le premier e-mail reçu en production contenait deux traqueurs ajoutés
par Brevo : un pixel invisible qui signale l'ouverture, et le lien d'activation réécrit vers un
domaine de Brevo (`sendibt3.com`), qui enregistre le clic avant de rediriger vers l'API. Le projet
promet « pas de traqueurs », et un membre ne devrait jamais avoir à cliquer sur un domaine inconnu
pour activer son compte.

Ce que Brevo permet à notre niveau : anonymiser ces mesures (réglage « consentement par contact »
et champ `contactPixelTrackingConsent: false` dans l'appel), mais pas les supprimer : la
désactivation du suivi est réservée aux clients Enterprise, sur demande.

Par ailleurs, Waiggle va devenir un projet commercial : il y aura des e-mails marketing
(nouveautés, campagnes) en plus des e-mails de compte, et il faut pouvoir monter en charge. Les
e-mails marketing adressés à des contacts français relèvent de la recommandation de la CNIL du
14 avril 2026 : pixel et liens de suivi seulement avec un consentement explicite et séparé, lien
de désabonnement et lien de retrait du consentement dans chaque pied de page.

Options étudiées : rester chez Brevo pour tout (traqueurs anonymisés sur les e-mails de compte) ;
Scaleway Transactional Email ; Resend et Postmark (données aux États-Unis) ; Mailjet ; une boîte
Hostinger comme relais SMTP (ni listes, ni désabonnement, ni volume) ; tout faire soi-même
(Postfix, Listmonk).

## Décision

1. **Deux flux, deux outils, chacun sur son sous-domaine.** Les e-mails de compte et les e-mails
   marketing n'ont ni les mêmes exigences ni la même réputation à protéger : une campagne mal
   reçue ne doit jamais empêcher un e-mail de vérification d'arriver.
2. **Les e-mails de compte passent par Scaleway Transactional Email** (France), depuis
   `no-reply@waiggle.io`. Scaleway ne sait pas insérer de pixel ni réécrire les liens : la
   fonction n'existe pas. Les e-mails arrivent tels que l'API les a écrits.
3. **Les e-mails marketing passeront par Brevo**, le jour où ils existeront, depuis un
   sous-domaine dédié (`news.waiggle.io`), avec le consentement par contact de Brevo (formulaires,
   attribut de consentement, lien de retrait). Le compte Brevo, le domaine authentifié et le réglage
   « consentement au suivi des pixels par contact » sont conservés dans ce but.
4. **L'auto-hébergement (Postfix, puis éventuellement Listmonk) est une étape future**, pas une
   option écartée. Critères pour y passer : un volume qui le justifie (de l'ordre de 50 000 e-mails
   par mois), quelqu'un pour surveiller la réputation de l'IP, les rebonds et les plaintes, et une
   réputation de domaine déjà établie chez les grands fournisseurs. Le transactionnel d'abord ; le
   marketing en dernier, voire jamais.
5. **Le code ne connaît qu'une interface, `Mailer`** (`apps/api/src/email/mailer.ts`), avec une
   implémentation par prestataire choisie par `MAIL_PROVIDER`. Changer de prestataire, ou en avoir
   un par usage, est une pull request, pas une refonte.

## Raisons

(Tarifs, limites et fonctions des prestataires : constatés le 14 octobre 2026. Une offre évolue ;
la vraie garantie reste la vérification sur un e-mail reçu, décrite dans `docs/ops/serveur.md`.)

- **Pourquoi pas Brevo pour tout** : les traqueurs sur les e-mails de compte ne se suppriment
  qu'en Enterprise. L'anonymisation laisse le clic transiter par un domaine Brevo, qui reçoit
  l'adresse IP et le navigateur du membre, et rend l'activation du compte dépendante d'un service
  tiers.
- **Pourquoi Scaleway** : français, données en France, fait pour le transactionnel, aucun suivi
  possible par construction, gratuit jusqu'à 300 e-mails par mois puis 0,25 € les 1 000, sans
  abonnement ; une offre avec IP dédiée existe pour la montée en charge.
- **Pourquoi garder Brevo pour le marketing** : c'est son métier, et son modèle de consentement par
  contact est exactement l'outillage demandé par la CNIL. Les mesures d'ouverture et de clic y ont
  un sens : celles que les contacts auront acceptées.
- **Pourquoi pas Resend ni Postmark** : produits excellents, mais comptes, logs et métadonnées
  stockés aux États-Unis.
- **Pourquoi pas Hostinger** : pas de service transactionnel ; une boîte en relais SMTP n'offre ni
  rebonds, ni webhooks, ni volume, ni marketing.
- **Pourquoi pas l'auto-hébergement maintenant** : une IP de VPS neuve a une réputation nulle, le
  réchauffement prend des semaines, et il faut traiter soi-même rebonds, plaintes, listes noires et
  la sécurité d'un serveur de mail exposé. Hostinger limite en plus l'envoi depuis le VPS à
  5 e-mails par minute. Le rapport effort / bénéfice ne s'inverse qu'avec le volume.

## Conséquences

- Deux comptes de prestataires à administrer (Scaleway maintenant, Brevo pour plus tard), avec
  chacun ses enregistrements DNS ; le SPF du domaine racine doit mentionner les deux tant que Brevo
  reste autorisé à envoyer depuis `waiggle.io`.
- `secrets.env` reçoit `SCALEWAY_SECRET_KEY` et `SCALEWAY_PROJECT_ID` ; `MAIL_PROVIDER=scaleway`.
  La clé Brevo reste en place, inutilisée par l'API, jusqu'au marketing.
- Aucune statistique d'ouverture ni de clic sur les e-mails de compte : c'est voulu. L'état de
  remise (délivré, rebond, spam) reste visible dans la console Scaleway.
- Le guide `docs/ops/serveur.md` décrit la configuration de Scaleway (domaine, DNS, clé) et la
  vérification sur un vrai e-mail : liens vers `api.waiggle.io`, aucune image de suivi.
- Le marketing fera l'objet de ses propres scénarios (consentement, désabonnement) avant tout envoi.
