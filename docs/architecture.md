# Architecture and limits

## Request routing

`worker/index.mjs` is the only server entry point. It serves:

- `/` plus the 11 locale prefixes in `public/party/locale.mjs`: the same game document, localized by Cloudflare HTMLRewriter;
- `/privacy`, `/terms`, and their localized variants: separate policy pages;
- `/api/party/:action`: authenticated game operations in `server/party-service.mjs`;
- `/og/default.png?lang=en|zh`: the shipped 1200 × 630 artwork;
- `/og/:resultId.png`: PNG score cards from verified stored results;
- `/config.js`: public, optional PostHog configuration, never Agora signing secrets;
- all other supported asset requests: the `ASSETS` binding.

Static assets live under `/party/` for stable import paths. `/party/` itself redirects to the home page. Local and preview hosts keep their own origins. Legacy `?lang=zh` links redirect to `/zh` while keeping room/result parameters.

## Game rules

`public/party/engine.mjs` contains the deterministic simulation, seeded Lily schedule, difficulty profiles and commands. Rules version 6 makes Hard's waiting intervals similar to Medium's while shortening its turn warning. Earlier supported profiles are retained for score replay, not as separate UI modes.

The server advances rooms when requests arrive. D1 rows include a version counter; an update succeeds only if it still matches the previously read version. Contention is retried with a bounded backoff. Room membership uses random bearer capabilities; hashes are stored instead of raw bearer tokens.

Agora RTM sends room-change hints. Clients still fetch authenticated state from the Worker, and polling remains available if RTM is disconnected. RTC audio has a separate lifecycle and does not carry authoritative game commands.

## Results

Solo runs receive an authenticated ticket and a seed. Submission replays the input trace against the recorded rules version after checking elapsed time and trace constraints. Online results are saved from server-owned room state. Publication and public result sharing are separate, explicit user actions.

Verification prevents arbitrary client-supplied scores, but a browser game cannot prove a human supplied every input. Do not treat the leaderboard as suitable for cash prizes without further controls.

## Storage

- Browser local storage: profile/preferences and personal bests.
- Browser session storage: current-tab room access.
- D1 `party_rooms`: room state, membership hashes, version and expiry.
- D1 `leaderboard_runs`: verification tickets and finished online results.
- D1 `leaderboard_entries`: voluntarily published names and scores.
- D1 `shared_results`: shareable results without player aliases.

Migration filenames remain stable so deployed databases can retain their migration records. Expiry is checked during operations; there is no scheduled purge. Operators should define retention and removal procedures.

## Rendering and sound

Canvas 2D draws WebP sprite atlases and the kitchen background. Scene layout uses shared foot anchors and separate portrait/landscape layouts. Animation and candy particles are presentation only; changing them cannot alter the simulation clock. Input release, blur, touch cancellation and visibility changes are handled separately from sprite state.

Solo music and effects are synthesized with Web Audio. Room music is disabled. The service worker does not cache game HTML or state and does not provide offline play.

## Release cleanup

The public release removes the retired Boo/Ghost/Heist/Potion prototypes, 3D renderer bundles, duplicate PNG art masters, unused UI component library, React/Next/Vinext scaffold, connector preview infrastructure, old deployment logs and bundled source ZIP. The current game, required art, licenses, migrations and tests remain.

Production account IDs, production D1 IDs, credentials and the original analytics ingestion token are not included. Forks configure their own providers. The release is intentionally a native Cloudflare Worker with one runtime package: `agora-token`.
