# Third-party notices and artwork

The repository's MIT license applies to project code. Dependencies, fonts and third-party marks retain their own terms.

| Component | Use | Notice |
| --- | --- | --- |
| Agora RTC Web SDK 4.24.8 | Loaded on demand from Agora's CDN after Join voice | [Agora SDK License Agreement](https://www.agora.io/en/sdk-license-agreement/) |
| Agora RTM Web SDK 2.3.0 | Bundled, unmodified room messaging SDK | Same Agora SDK terms; copyright header retained in `public/party/vendor/agora-rtm-2.3.0.js` |
| `agora-token` 2.0.7 | Server-side RTC/RTM token construction | ISC; see the installed package license |
| PostHog JS 1.441.2 | Optional analytics, disabled until configured | [Bundled license](public/party/vendor/posthog-1.441.2.LICENSE) |
| Fredoka | Display font | [SIL Open Font License](public/party/assets/fonts/fredoka-OFL.txt) |
| Nunito font files | Interface text | [Bundled font notice](public/party/assets/fonts/nunitosans-OFL.txt) |
| Agora logo | Provider credit in the header | Agora brand mark; not licensed under the project's MIT terms |

Wrangler, Miniflare and Sharp are development dependencies. Their package licenses remain in their npm distributions and are not replaced by this project's license.

## Game artwork

The Halloween kitchen, Lily, the thieves and candy props were generated for this project with AI assistance. The OG images were generated with the project's character sheets as references; the wordmark was extracted from the approved OG artwork. The pumpkin favicon is a project-authored SVG.

Project-authored artwork is provided with the project under its MIT terms to the extent of the contributors' rights. This statement does not grant rights to third-party trademarks. AI-assisted output may not carry the same exclusive copyright protection in every jurisdiction.

The repository keeps the runtime WebP atlases and final OG images. Superseded frames, duplicate PNG masters and local generation sessions are intentionally excluded. Game audio is synthesized in code; no third-party music recording is bundled.

Original MIT copyright notices are retained in `LICENSE`.
