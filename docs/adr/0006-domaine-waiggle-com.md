# 0006 — Le domaine principal devient waiggle.com, waiggle.io redirige

- Statut : accepté
- Date : 2026-10-23
- Remplace en partie : 0003 (point 2, les noms de domaine) et 0005 (l'adresse d'expédition)

## Contexte

Waiggle est en ligne depuis le 14 octobre 2026 sur `waiggle.io` (l'appli) et `api.waiggle.io`
(l'API). Le projet devient commercial ; `waiggle.com` et `waiggle.fr` ont été achetés le
23 octobre 2026. Un `.com` se retient et s'écrit plus facilement, et la boîte de contact
(`contact@waiggle.com`) y est déjà.

Des liens vers `waiggle.io` existent déjà : e-mails de vérification, de récapitulatif et de
mention (avec leur lien de désinscription), liens d'invitation partagés, textes des membres.

## Décision

1. **`waiggle.com` sert l'appli, `api.waiggle.com` l'API**, `www.waiggle.com` renvoie vers
   `waiggle.com`. Les deux noms restent sur le même domaine principal, pour les cookies (ADR 0003).
2. **Les anciens domaines redirigent, ils ne servent plus rien** (`infra/site.env`,
   `LEGACY_APP_DOMAIN` et `LEGACY_API_DOMAIN`, lus par `infra/Caddyfile`) :
   - `waiggle.io` et `www.waiggle.io` : 301 vers la même adresse sur `waiggle.com` ;
   - `api.waiggle.io` : 308 vers la même adresse sur `api.waiggle.com`. Le 308 garde la méthode
     et le corps : le désabonnement « en un clic » des e-mails déjà envoyés est un `POST`.
   - `waiggle.fr` : redirection du registraire (Hostinger) vers `https://waiggle.com/`.
3. **L'API n'accepte aucune ancienne origine.** Le cookie de session est attaché au seul nom de
   l'API : tous les membres se reconnectent une fois sur `waiggle.com`. Un lien de vérification
   envoyé moins d'une heure avant la bascule échoue ; on en redemande un.
4. **Les e-mails partent de `no-reply@waiggle.com`**, signés DKIM pour `waiggle.com` par
   Scaleway (SPF commun avec la boîte Hostinger). Les anciens domaines n'envoient plus rien et
   l'annoncent : SPF `-all`, DMARC `p=reject`, MX nul. Le marketing futur partira de
   `news.waiggle.com` (ADR 0005).
5. **Les anciens domaines restent renouvelés**, en renouvellement automatique, tant que d'anciens
   e-mails ou liens y mènent. Un domaine expiré puis racheté recevrait leurs clics (codes
   d'invitation, jetons de désinscription) et pourrait imiter la page de connexion. Le code
   d'invitation est changé après la bascule.

## Conséquences

- Changer encore de domaine suit la même méthode (`docs/ops/serveur.md`, « Changer de
  domaine ») : l'ancien passe dans `LEGACY_*`.
- Revenir en arrière une fois des e-mails partis avec les nouveaux liens se fait par un commit
  qui permute `site.env` (l'ancien redevient principal, le nouveau redirige), jamais en
  redéployant un commit antérieur : les navigateurs ont retenu les redirections permanentes, et
  HSTS interdit de passer outre une erreur de certificat.
- `infra/stack-test.sh` vérifie les redirections, leur HSTS et le refus de l'ancienne origine.
