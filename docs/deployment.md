# Deploy Trick or Take

[README](../README.md)

These instructions deploy **your own copy**. The official game is [trickortake.com](https://trickortake.com/), released separately from its private production repository. This public repository does not publish a GitHub Pages website.

## Local development

```bash
npm ci
npm run db:migrate
npm run dev
```

Wrangler runs the Worker, static assets and a local D1 database together. The local database is stored in the ignored `.wrangler/` directory. It is independent of production. If port 5173 is in use, run `npm run dev -- --port 8799`.

## Cloudflare Workers + D1

1. Authenticate to **your own** Cloudflare account:

   ```bash
   npx wrangler login
   npx wrangler whoami
   ```

2. Create a database:

   ```bash
   npx wrangler d1 create trick-or-take
   ```

3. Copy the returned database ID into `d1_databases[0].database_id` in `wrangler.json`. Keep the binding name `DB`. Set a unique Worker `name` if needed. This repository contains no production account ID or production database ID.

4. Apply the migrations to that database:

   ```bash
   npm run db:migrate:remote
   ```

5. Add Agora credentials if you want RTC voice and RTM. These commands prompt for their values:

   ```bash
   npx wrangler secret put AGORA_APP_CERTIFICATE
   ```

   Put your public `AGORA_APP_ID` into `vars.AGORA_APP_ID` in `wrangler.json`. Use the same Agora project for both values. Enable RTC and Signaling/RTM in its console. Never put the App Certificate in a browser module or commit it to Git.

6. Validate and deploy:

   ```bash
   npm test
   npm run build
   npm run deploy
   ```

   `build` runs Wrangler in dry-run mode and writes a local bundle to `dist/`; it uploads nothing. `deploy` is the command that publishes.

7. Open the returned `workers.dev` URL. Check a solo round, two browsers joining the same room, readiness, voice permission and a finished result. Deploying successfully does not prove two people can hear each other; test that on two devices.

## Optional custom domain

After the Worker works, bind your domain in Cloudflare **Workers & Pages → your Worker → Settings → Domains & Routes**. The public demo uses `trickortake.com`; the repository does not provision that domain for forks.

Before launching a differently named fork, update:

- `public/party/seo.mjs`: the site identity used in structured data;
- `public/party/index.html`: static metadata fallback;
- `public/robots.txt`, `public/sitemap.xml`, and the three `llms`/`full` text files;
- `server/canonical-domain.mjs`: the original demo's legacy-domain redirects;
- the English/Chinese policy copy in `public/party/messages.mjs`;
- OG artwork, logo, and app naming as appropriate.

Worker-generated page metadata and challenge links use the request origin. Some product descriptions and crawler files intentionally describe the original demo, so review them when publishing your own deployment.

## Configuration reference

| Variable | Local | Production | Meaning |
| --- | --- | --- | --- |
| `AGORA_APP_ID` | `.dev.vars` | Worker variable | Public Agora project ID |
| `AGORA_APP_CERTIFICATE` | `.dev.vars` | Worker secret | Server-only token signing credential |
| `POSTHOG_PROJECT_TOKEN` | `.dev.vars` | Worker variable | Optional public ingestion token; empty disables analytics |
| `POSTHOG_HOST` | `.dev.vars` | Worker variable | Your PostHog ingestion host; default EU endpoint |

Copy `.dev.vars.example` to `.dev.vars` for local overrides. Do not commit real credentials. Forks do not send events to the original game's PostHog project.

Analytics uses `localStorage+cookie` when enabled. It is not cookieless. Review provider settings and privacy disclosures for your deployment before enabling it. Policy pages receive the same optional analytics configuration as the game.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Room or leaderboard API returns `service_unavailable` | Apply D1 migrations; confirm the binding is named `DB` |
| Voice says it is unavailable | Verify the App ID and Certificate belong to the same enabled Agora project |
| Microphone does not open | Use HTTPS/localhost, click Join voice, then allow microphone permission |
| Players see delayed updates | Inspect RTM status; the room API still polls when messaging is unavailable |
| Old social preview appears | Confirm the HTML points to the versioned OG URL; social platforms may retain already-shared previews |
| Local port is occupied | Use `npm run dev -- --port 8799`; do not stop an unrelated server |
| Build fails after editing deployment settings | Run `npm run build` and read Wrangler's specific validation error |

The game is an example app, not an operated multiplayer platform. For a large public deployment, add abuse/rate controls, monitoring, and a retention policy for expired rooms and result records. No scheduled database cleanup job is included.
