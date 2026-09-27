# Video

`apps/video` holds Copacker's motion work, built with [Remotion](https://www.remotion.dev): React components rendered
frame by frame to stills and MP4. It's excluded from the Docker and Railway builds.

- `pnpm --filter video dev` opens Remotion Studio at http://localhost:3100.
- `pnpm --filter video exec remotion render One-thread out/one-thread.mp4` renders the ad. Renders land in
  `apps/video/out/`, which Git ignores.

Remotion is free for individuals and companies of up to three employees. A larger company needs a
[company license](https://www.remotion.pro/license).

## One Thread, the ad

45 seconds, 16:9 at 30 fps, on a 120 BPM grid (one bar is 2 seconds): 22 bars and a one-second tail. The first act has
no voiceover; the first voice heard is Copacker's. The brand orange appears only once Copacker does.

| Time      | Beat       | Voiceover (cue) or on-screen text                                                 |
| --------- | ---------- | --------------------------------------------------------------------------------- |
| 0:00–0:02 | Cold open  | "One restock."                                                                    |
| 0:02–0:08 | The relay  | Handoff, document and format counters                                             |
| 0:08–0:12 | The knot   | "Even AI can't check what never matches."                                         |
| 0:12–0:14 | The breath | Silence; Copacker's mark takes the loose end at 0:13.2                            |
| 0:14–0:15 | The pull   |                                                                                   |
| 0:15–0:20 | Predict    | "Copacker knows what to restock, and when." (0:15.5)                              |
| 0:20–0:22 | One click  | "One click starts the PO." (0:20.1)                                               |
| 0:22–0:28 | Amazon     | "Amazon shipments build themselves, labeled and split to save on storage." (0:22.6) |
| 0:28–0:32 | One record | "Everyone works from the same record." (0:28.4)                                   |
| 0:32–0:38 | Agents     | "Now it all matches, so AI agents can run it with you." (0:32.5)                  |
| 0:38–0:45 | End card   | "Copacker. Every handoff, one thread." (0:38.8)                                   |

`src/beats.ts` holds the beats and cues; `src/one-thread.tsx` poses each scene for every frame. Each scene in
`src/scenes/` takes its pose as props, and its defaults are its style frame; the **Style-frames** folder in Studio shows
them, with a board of all six.

## Voice and music

- The voiceover is ElevenLabs' Roger (`CwhRBWXzGAHq8TQ4Fs17`) on Eleven v3. `src/voiceover.ts` holds each line's
  caption and the spelling the voice reads ("Co-packer", "P.O.").
- `pnpm --filter video record <voice id>` records every line into `public/voiceover/` and its word timings into
  `src/voiceover-takes.json`; `voices` and `audition <voice id>...` list and compare voices. They read
  `ELEVENLABS_API_KEY` from `apps/video/.env`.
- Only a paid ElevenLabs plan licenses the audio for commercial use. Takes recorded on the free plan must be recorded
  again before the ad is released.
- `pnpm --filter video score` synthesizes the animatic's sketch score, plucked strings drifting out of tune and then
  back in, into `public/music/temp-score.wav` (Git ignores it). A composer's cue replaces it.
