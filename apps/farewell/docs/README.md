# Farewell

"So long, and thanks for all the tokens": a four-minute comedy music video for a farewell from Microsoft EDU, staged as a
Monty Python-style theatre show with paper cut-out characters. It's built with [Remotion](https://www.remotion.dev),
like [the Copacker ad](../../video/docs/README.md), and drawn entirely in SVG.

- The song is `So Long.mp3` and its words are in `lyrics.txt`. The finished video renders next to them, as
  `pnpm --filter farewell exec remotion render Farewell "So Long and Thanks for All the Tokens.mp4"`, and
  `pnpm --filter farewell captions` writes its captions beside it, `So Long and Thanks for All the Tokens.vtt`: every
  line timed to its words in `src/words.ts`, the sung ones marked as music.
- `pnpm --filter farewell dev` opens Remotion Studio at http://localhost:3200.
- `pnpm --filter farewell exec remotion still Farewell docs/frames/<name>.jpg --frame=<n> --image-format=jpeg` renders a
  style frame from the show; `Cast` and `CastMore` are the two cast sheets.

## Pages

- [Storyboard](storyboard.md): the look, how the show moves, the running order and the style frames.
- [Script](script.md): every scene moment by moment: the Engineer's costume and cane, the props, the running gags, and
  what happens on each line.

## Code

- `src/timeline.ts` is the show's clock: when each lyric line starts in the current mix, the parts of the show, the
  beat and the Token Meter's count. A new mix means measuring these again; every scene reads its timing from here.
- `src/show.tsx` plays each part's scene from `src/scenes/` against the song.
- `src/theatre.tsx` is the Theatre Royal, Redmond: the proscenium, the curtains, the footlights, the boxes, the
  audience, the act card on its easel and the Token Meter. `src/choir.tsx` is the cherubs in the boxes and
  `src/company.tsx` the chorus kick line.
- `src/cast/` has a file per character, and `walk-ons.tsx` the bit parts. Each is a paper cut-out placed by its feet
  and posed by its props: arm swings, kicks, mouth and gaze. The Engineer also takes a cane, a headset, a pocket, a
  costume change and a stride.
- `src/walk.ts` walks anyone with legs between two marks: it plants each footfall, bends the knees and ankles to reach
  them, lifts the hips over each step and swings the arms, on the level, backing away, sidestepping, marching, running
  or down a stair. Each character with legs exports its build (hip height, hip spread, leg length) to pass to it; the
  Unicorn's two halves walk side on and out of step, and Study Guide stands pigeon-toed.
- `src/sets.tsx` has the backcloths; `src/office.tsx` the office furniture and the things on a desk; `src/awards.tsx`
  the anniversary crystal and the patent cubes; `src/machines.tsx` the flying machines, rockets, moon and Torus; and
  `src/props.tsx` everything else the scenes share. `src/paper.tsx` has the shared patterns, the paper edge and shadow
  every cut-out gets, the grain and the camera; `src/motion.ts` the easing, springs and beat hops.
- `src/frames/` has the two cast sheets.
- No JSX may run while a module loads (in a top-level constant, say): with TypeScript 7 the bundler compiles JSX to
  `React.createElement`, and React is only global once the composition renders.
