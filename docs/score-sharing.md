# Score sharing

The results screen gives sharing priority over optional leaderboard publication.
A local 1200×630 PNG preview shows the score, original characters and game domain.
Generating the preview does not create a public record. A public challenge is
created only after a player chooses a sharing action; its score is verified from
the authenticated run or replay. The player's alias and room invitation stay out
of the public result and every social URL.

X, WhatsApp, Facebook, Telegram and Reddit appear as labeled icons. The first
click reserves a blank tab synchronously, verifies the result, then opens that
platform's composer. Later clicks use normal links. If the browser blocks the
reserved tab, the verified link remains ready and the player can tap again.
These actions open composers; they never publish a post automatically.

The main Share your score action prepares the challenge first. Once ready,
Share score calls the native share sheet directly within the next click, keeping
Safari user activation. When file sharing is supported, it includes the score
PNG as well as the challenge text and URL. Other devices share the link.
Copy link supports manual selection if clipboard access fails. Save image remains
available independently of public challenge creation. An image failure cannot
block the social links.

Desktop results use two columns for the score and sharing; mobile results flow
vertically with sharing ahead of the leaderboard form. All controls have visible
focus states, large touch targets and localized copy for the twelve site locales.
Existing server-rendered result metadata and PNG previews follow the shared link.

Analytics distinguish the initial sharing choice, challenge creation, composer
opening, native sheet completion, copying, image download clicks, challenge views
and challenge acceptance. A composer opening is not recorded as a published post.
No analytics event includes the challenge URL, token, room code or player alias.

Provider references:

- [Telegram sharing buttons](https://core.telegram.org/widgets/share)
- [WhatsApp click to chat](https://faq.whatsapp.com/5913398998672934)
- [Facebook Share Button](https://developers.facebook.com/docs/plugins/share-button/)
- [X Publish](https://publish.x.com/)
