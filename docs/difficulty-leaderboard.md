# Difficulty, metadata and score publication

English lives at https://trickortake.com. Chinese lives at /zh, including
/zh/privacy and /zh/terms. The language button switches that path. The HTML
response follows the path, so the English canonical stays the bare domain.

## v8 shared challenge (current)

The opening always has a 3.2–4.8 second stealing window and a gentle
1.40–1.85 second turn. Later turns mix three reaction windows:

| Turn | Reaction window | Animation |
| --- | --- | --- |
| Sharp | 0.38–0.52 seconds | Immediate shoulder turn; skips stop/listen |
| Normal | 0.75–1.10 seconds | Readable stop, listen and turn |
| Gentle | 1.40–1.85 seconds | Slower, forgiving turn |

After the opening, each shuffled five-turn bag contains two sharp turns, two
normal turns and one gentle turn. Valid sharp positions are chosen directly;
sharp turns cannot be adjacent, including at bag boundaries. Waiting and
watching durations keep the v7 ranges and remain independent of turn speed.
A long, tempting break can therefore end with a sharp turn. Difficulty comes
from changing reaction speed rather than increasing how often Lily looks back.

There is no question-mark/exclamation warning before an ordinary v8 inspection.
The shoulder movement itself is the warning. The exclamation mark is reserved
for an actual catch. Holding still becomes punishable at the published lookAt
boundary, never earlier because the sprite changes. All members share the same
server schedule; releasing during a warning remains valid.

New games and bests use v8. Existing v3–v7 rooms and issued solo score tickets
retain their exact schedules; the v7 seeded replay is covered by a regression
fixture. Timing sweeps and simulated reactions are tests of the rules, not
measurements of human reaction or network latency.

## Historical v7 shared challenge


Version 7 games use one timing system. The opening offers a 3.2–4.8 second stealing
window and a normal turn, so players can begin before the surprises arrive.

| Moment | Timing |
| --- | --- |
| Fast turn | 0.55–0.75 seconds |
| Normal turn | 0.90–1.30 seconds |
| Slow turn | 1.45–1.90 seconds |
| Brief glance | 0.85–1.20 seconds |
| Normal watch | 1.30–1.85 seconds |
| Long stare | 2.10–2.70 seconds |
| Busy wait, after the opening | 1.7–2.5, 3.2–5.0, or 5.8–8.2 seconds |

Turn speeds use a shuffled four-turn bag: one fast, one slow, and two normal.
Fast turns never repeat consecutively, including across bag boundaries. Waits
and watching durations are drawn separately: a long break can end in a fast
turn, and a fast turn does not imply a brief glance. No consecutive long stares
or long breaks, and no more than two short breaks in a row.

Draws happen only at simulation boundaries from the room's seeded generator.
Each rematch advances that generator and reshuffles its speed bag; all room
members see the same Lily. Future choices stay out of public room snapshots.
The animation uses the actual warning duration for stop → listen → peek.

The 500-seed balance sweep observed 7–10 turns per full minute (mean 8.606),
with both fast and slow turns in every sampled round. A simulation observing
state every 250 ms and releasing 200 ms after a warning avoided every catch
across 100 seeds. These are simulations, not measured human reaction times.

New personal bests use the v7 key. Existing v3–v6 rooms, tickets and local bests
retain their original rules and data; changing timing does not rewrite old scores.

## Historical v6 profiles

Every turn always includes a warning beat: stop → listen → peek, then watching.
Hard never snaps straight to watching. It turns much faster, while its overall
glance count stays close to Medium.

| Difficulty | Busy waits (quick / normal / long) | Turn warning | Watching |
| --- | --- | --- | --- |
| Easy | 3.0–4.4 / 5.0–7.4 / 8.0–10.5 seconds | 1.50–2.10 seconds | 1.10–1.80 seconds |
| Medium | 1.7–2.5 / 3.2–5.0 / 5.8–8.2 seconds | 0.90–1.35 seconds | 1.05–1.75 seconds |
| Hard | Same wait mix as Medium | 0.36–0.58 seconds | 1.45–2.15 seconds |

Visual cues scale to the live warning length, so a Hard 0.36s warning still
plays all three poses proportionally instead of skipping the telegraph.

Before v7, the shared challenge used Medium timing internally. The old profiles remain for score replay. A historical room's difficulty is shared and fixed for that room. These games use v6 seeded timing. At most two quick waits
occur consecutively; long waits do not repeat consecutively. The future schedule
stays private. The previous game kept one v6 personal best; historical per-level storage is left untouched. Older v3/v4/v5 rooms and
issued solo tickets keep their original clocks for replay fairness.

After a completed game, the player can enter a public name and choose Submit
score, or Keep private. Nothing is automatically published. The public board
shows one combined top 20 across every difficulty and solo/multiplayer mode. Equal scores
share a competition rank; earlier submissions appear first within a tie.

Multiplayer scores come from authenticated, immutable server-side finished
results, retained across rematches. Solo games keep the local pause/offline
behavior. When connected at the start, the server issues a random seed and an
expiring run capability. On submission it replays up to 512 recorded input
edges with the same rules and recomputes the score, after the full game duration.
No client-provided score is accepted. This validates game rules and bounded
inputs, not whether a human or a bot supplied them. An offline run remains
playable and private. Duplicate submissions create one public entry per result.

Private run records do not appear in board queries. Public entries contain only
the chosen name, score, submission time, public entry ID and rank. Mode and difficulty remain stored for run verification. Submission requires
the original run/member capability. Room capabilities and Agora secrets remain
server-side or tab-local and are excluded from public ranking responses.

Apply `drizzle/0001_leaderboards.sql`, `0002_regular_drax.sql` (challenge sharing),
and `0003_dapper_living_mummy.sql` (rule versions and global ranking index) once,
in order, after the original party-room schema. Drizzle schema, journal
and snapshot are updated together. No party-room table is dropped or rewritten.
