# Video

`apps/video` holds Copacker's motion work, built with [Remotion](https://www.remotion.dev): React components rendered
frame by frame to stills and MP4. It's excluded from the Docker and Railway builds.

- `pnpm --filter video audio` synthesizes the score and sound effects into `public/audio/` and renders the voiceover
  takes, each on its cue, into one track there (Git ignores them). Run it before rendering, and again after changing
  the timeline or recording takes.
- `pnpm --filter video dev` opens Remotion Studio at http://localhost:3100.
- `pnpm --filter video exec remotion render Copacker out/copacker.mp4` renders the ad. Renders land in
  `apps/video/out/`, which Git ignores.
- `pnpm --filter video subtitles` writes the ad's SRT subtitles to `out/copacker.srt`.

Remotion is free for individuals and companies of up to three employees. A larger company needs a
[company license](https://www.remotion.pro/license).

## The ad

105 seconds, 16:9 at 60 fps, on a 120 BPM grid (a beat every half second, a bar every 2). A SaaS launch film: the
Copacker app on a dark stage, a headline per feature, and the voiceover explaining it.

| Time      | Section  | What it shows                                                                                  |
| --------- | -------- | ---------------------------------------------------------------------------------------------- |
| 0:00–0:10 | Hook     | "Restocking a best-seller shouldn't take 43 emails, 12 spreadsheets, and a stockout."          |
| 0:10–0:17 | Reveal   | The chaos snaps into the app on the drop                                                       |
| 0:17–0:36 | Forecast | Connecting stores, the restock maths, then a holiday forecast: lost sales and an order-by date |
| 0:36–0:46 | Reorder  | "Reorder in one click." The purchase order, then the supplier's packing list                   |
| 0:46–1:04 | Amazon   | The order becomes its shipment and labels, then the split: FBA, AWD in the US, AWD offshore    |
| 1:04–1:18 | Handoffs | "Every handoff, in one place." Supplier, forwarder and buyer on the same order                 |
| 1:18–1:30 | Agents   | "Built for AI agents." An agent running a restock over MCP                                     |
| 1:30–1:34 | Recap    | Forecast, reorder, ship, automate                                                              |
| 1:34–1:38 | Outcome  | "This holiday season, fully stocked." The forecast again, with the order placed in time        |
| 1:38–1:45 | End card | "Restocking, handled." and the call to action                                                  |

`src/timeline.ts` holds the sections, the voiceover cues and every moment inside each section; the score, the sound
effects and the scenes all read their timing from it. `src/ad.tsx` plays each section's scene with the audio.

- `src/scenes/` has one file per section. Each scene is a pure function of the seconds since its section started, so
  any frame renders on its own and the recap can reuse other scenes' pieces.
- `src/ui.tsx` rebuilds Copacker's interface as the app draws it today (the window with the app header and each
  workspace's sidebar, cards, status badges, tables, the cursor), and `src/data.ts` holds the demo workspaces, the
  marketing page's brand, partners and products, whose numbers all agree with each other. When the app's look changes,
  change them to match.
- `src/type.tsx` has the headlines and chapter labels; `src/stage.tsx` has the dark stage and the word-by-word captions.
- Chapters hand over without hard cuts. The reveal's window carries into the forecast, the reorder's into Amazon, and
  the handoffs' into the agents: each exports its window's last pose for the next chapter's `Shot` to start `from`.
  The forecast whips out to the reorder, and the Amazon split rushes past the camera into the handoffs.
- Motion that must carry across a cut, like the stage's drift and the windows' float, runs on the ad's own clock
  (`Clock` in `src/stage.tsx`) rather than on the section's seconds.
- No JSX may run while a module loads (in a top-level constant, say): with TypeScript 7 the bundler compiles JSX to
  `React.createElement`, and React is only global once the composition renders. Keep JSX inside components.

## Voice and music

- The voiceover is ElevenLabs' Roger (`CwhRBWXzGAHq8TQ4Fs17`) on Eleven v3. `src/voiceover.ts` holds each line's
  caption and the spelling the voice reads ("Co-packer", "F.B.A."), with the same number of words so captions can
  follow the take word by word.
- `pnpm --filter video record <voice id>` records every line into `public/voiceover/` and its word timings into
  `src/voiceover-takes.json`; `voices` and `audition <voice id>...` list and compare voices. They read
  `ELEVENLABS_API_KEY` from `apps/video/.env`.
- Eleven v3 now and then drops a word. `record` reads each take back with ElevenLabs' speech to text and records it
  again if a word is missing, and `pnpm --filter video check:takes` does the same check on the takes as they are.
- The ad plays the voiceover as one continuous track, like the score, not a clip per line. When the Studio preview
  falls behind, it jumps a clip that starts late forward to catch up, cutting off its first words; a track that's
  already playing doesn't get cut. Judge the final sound from a render all the same.
- Only a paid ElevenLabs plan licenses the audio for commercial use. Takes recorded on the free plan must be recorded
  again before the ad is released.
- The score (`scripts/score.ts`) and sound effects (`scripts/sfx.ts`) are synthesized with `scripts/audio/dsp.ts`, so
  they need no license. A licensed track can replace the score.

## Delivery

- `node scripts/loudness.ts <file.wav>` measures a mix's integrated loudness (BS.1770, gated) and sample peak. Decode a
  render at 48 kHz first: `pnpm --filter video exec remotion ffmpeg -i out/copacker.mp4 -vn -ar 48000 out/copacker.wav`.
  Deliver about -14 LUFS for YouTube and social, and -24 LKFS for US broadcast (ATSC A/85).
- The landing page plays the -14 LUFS web mix, made smaller and served from R2, as [Landing page](../../copacker/docs/landing-page.md#assets)
  says.
- Before release: the logo is the app's
  orange box tile, and every figure on screen is demo data, so any customer proof added later must be real. The
  vertical 9:16 version still needs its own layout.
