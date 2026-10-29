# Candy Workshop

The solo soundtrack is an original 32-bar Christmas arcade composition in G major
at 125 BPM (61.44 seconds). Celesta and glockenspiel carry the hook, a flute answers
in the bridge, and pizzicato strings, acoustic bass, sleigh bells and woodblocks
provide the groove. A second aligned stem adds quiet percussion and upper plucks
in the last ten seconds. Lily's warning and inspection lower the entire music mix.

The MP3 stems load after a solo audio gesture and play through the shared Web Audio
context. They remain synchronized while the pulse stem is silent. Pause preserves
the position; leaving a round resets it. Multiplayer never starts background music.
A failed download leaves effects available and retries on the next audio gesture.

## Reproduce the assets

Install FluidSynth and FFmpeg. Download GeneralUser GS 2.0.3 from
[S. Christian Collins](https://www.schristiancollins.com/generaluser) separately,
then run:

```sh
python3 scripts/render-christmas-music.py --soundfont /path/to/GeneralUser-GS.sf2
```

The render uses sampled instruments from GeneralUser GS by S. Christian Collins,
revision `684543d` in [its source repository](https://github.com/mrbumpy409/GeneralUser-GS).
Its [License v2.0](https://github.com/mrbumpy409/GeneralUser-GS/blob/684543d/documentation/LICENSE.txt)
permits creating and publishing music recordings, including commercial recordings.
The SoundFont itself is not distributed in this repository. The original score,
render script and resulting game recordings are included under the project license.

Each stem is rendered for three repetitions; the middle repetition retains release
and reverb tails on both sides of the loop. Encoding includes MP3 gapless metadata;
Web Audio loops at the explicit 61.44-second musical boundary. The main stem is
normalized to -18 LUFS with a -3 dBTP ceiling, and the pulse to -27 LUFS before the
in-game music and master gains. These are stem measurements, not a loudness claim
for the full mix of effects, music and player speech.
