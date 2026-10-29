<div align="center">
  <img src="public/party/assets/wordmark-v3-ink.png" alt="Trick or Take" width="420">
  <p><strong>Prends les bonbons. Ne te fais pas attraper.</strong></p>
  <p>Un petit cambriolage de bonbons pour Halloween, dans ton navigateur. Joue en solo ou avec tes amis en vocal.</p>
  <p><a href="https://trickortake.com/">Jouer</a> · <a href="docs/deployment.md">Guide de déploiement</a></p>
</div>

[English](README.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · **Français** · [Deutsch](README.de.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Português (Brasil)](README.pt-BR.md)

[![Agora RTC](https://img.shields.io/badge/Agora-RTC-0099FF)](https://www.agora.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE)
![Node.js 22.13+](https://img.shields.io/badge/Node.js-22.13%2B-339933)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-F38020)

[![Trick or Take](public/party/assets/og-home-v3-en.png)](https://trickortake.com/)

## Le jeu

Lily est occupée dans la cuisine. Les bonbons sont juste là. Elle ne remarquera sûrement pas qu’il en manque un ?

Maintiens le bouton pour voler. Relâche pour cacher tes bonbons et prendre un air innocent. Si Lily se retourne pendant que tu voles, un coup de balai te fait perdre **tous tes bonbons**. Tu as 60 secondes pour en garder le plus possible.

Choisis le fantôme, la citrouille ou le chat chauve-souris. Joue seul ou partage un code de salon à six chiffres avec tes amis. Le chat vocal est facultatif.

| Fonction | Contenu |
| --- | --- |
| Solo | Records locaux, pause et musique synthétisée |
| Multijoueur | 2 à 6 joueurs, codes à six chiffres, confirmation des joueurs et revanche |
| Voix | Agora RTC avec micro, mode muet et reconnexion |
| Synchronisation | Notifications Agora RTM, avec interrogation périodique en secours |
| Difficulté | Trois niveaux ; en Difficile, Lily se retourne plus vite, sans le faire constamment |
| Classement | Un classement commun ; publication du nom et du score au choix |
| Partage | Liens vers des résultats vérifiés et cartes de score téléchargeables |
| Mobile | Commandes tactiles, mise en page adaptative et icônes d’écran d’accueil |
| Langues du jeu | Anglais sur `/`, chinois simplifié sur `/zh`, métadonnées et images OG comprises |

## Comment jouer

1. Choisis un personnage et une difficulté. En multijoueur, crée ou rejoins un salon, puis attends que tout le monde soit prêt.
2. Maintiens le grand bouton, la scène ou la touche **Espace**. Plus tu maintiens longtemps, plus tu prends de bonbons rapidement.
3. Relâche dès que Lily commence à se retourner. Ton personnage prend immédiatement un air innocent.
4. Si elle te surprend, ton score revient à zéro. Après un court étourdissement, tu peux recommencer.
5. À la fin, les bonbons encore dans tes mains comptent aussi. Le meilleur total gagne ; les égalités sont conservées.

| Difficulté | Temps de réaction | Rythme |
| --- | --- | --- |
| Facile | 1,50–2,10 secondes | Pauses longues et avertissement généreux |
| Moyen | 0,90–1,35 seconde | Rythme varié et équilibré |
| Difficile | 0,36–0,58 seconde | Fréquence proche de Moyen, retournements bien plus rapides |

Les délais varient à chaque partie. Le serveur ne révèle pas le prochain retournement avant le début de l’avertissement. La musique reste coupée en multijoueur pour laisser place aux conversations.

## Lancer en local

Il faut **Node.js 22.13 ou plus récent** et npm. Le jeu local et les salons ne nécessitent ni compte Cloudflare ni identifiants Agora.

```bash
git clone https://github.com/zicojiao/trick-or-take.git
cd trick-or-take
npm ci
npm run db:migrate
npm run dev
```

Ouvre **http://localhost:5173**. Pour tester un salon, ouvre un second onglet, rejoins le même code et prépare les deux joueurs. Pour évaluer la qualité du son, utilise deux appareils.

L’identifiant de base de données composé de zéros dans `wrangler.json` est réservé au développement local. Remplace-le par ton propre identifiant D1 avant le déploiement.

### Activer Agora RTC et RTM

```bash
cp .dev.vars.example .dev.vars
```

Renseigne `AGORA_APP_ID` et `AGORA_APP_CERTIFICATE` dans `.dev.vars`, puis redémarre le serveur. Active RTC et Signaling/RTM dans ton projet Agora. Le serveur crée des jetons temporaires pour les membres authentifiés ; le certificat n’est jamais envoyé au navigateur.

Chaque joueur doit cliquer sur **Join voice** et autoriser le micro. Utilise localhost ou HTTPS. Le [guide de déploiement](docs/deployment.md), en anglais, détaille la configuration de production.

### Statistiques facultatives

Elles sont **désactivées par défaut**. Pour les activer, configure tes propres `POSTHOG_PROJECT_TOKEN` et `POSTHOG_HOST`. `/config.js` expose uniquement la configuration publique de collecte.

PostHog utilise des cookies propriétaires et le stockage local. La collecte automatique et l’enregistrement des sessions sont désactivés. Les codes de salon, identifiants de défi et paramètres d’URL sont retirés des événements ; les noms des joueurs ne sont pas envoyés. Adapte les pages de confidentialité à ton déploiement.

## Fonctionnement

Le client utilise JavaScript et Canvas 2D. Un Cloudflare Worker sert les pages, ressources, API et images OG ; D1 conserve les salons et les résultats. Agora RTC transporte l’audio et RTM signale les changements de salon.

- **Moteur commun :** `public/party/engine.mjs` applique les mêmes règles en solo et sur le serveur.
- **État géré par le serveur :** les mises à jour conditionnées par version évitent les écrasements concurrents. RTM ne décide pas de l’état de la partie.
- **Résultats vérifiés :** le serveur rejoue les actions en solo et tire les scores multijoueurs de l’état du salon.
- **Publication volontaire :** terminer une partie ne publie pas automatiquement ton nom ou ton score. Les liens de défi ne contiennent pas le nom du joueur.
- **Règles versionnées :** les anciennes parties compatibles restent vérifiables après un changement de difficulté.

Consulte l’[architecture](docs/architecture.md), en anglais. La vérification rejette les résultats incohérents, mais ne bloque pas tous les joueurs automatisés.

## Organisation

```text
public/party/    Jeu, Canvas, commandes, voix, traductions et illustrations
public/          Icônes, manifeste et fichiers pour moteurs de recherche
server/          Salons, jetons, vérification et images OG
worker/          Routes et HTML traduit
drizzle/         Migrations D1
scripts/         Génération des icônes et vérifications
tests/           Tests automatisés
docs/            Déploiement et architecture, en anglais
```

## Licence

[MIT](LICENSE)
