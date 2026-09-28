# Landing page

Anyone signed out sees the marketing page at `/` (`apps/copacker/src/app/page.tsx`). Signed in, `/` still goes
straight to their home. The page tells the ad's story on the ad's dark stage, and lives in
`apps/copacker/src/components/marketing/`:

| File                                 | What it is                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `landing.tsx`                        | The page: nav, hero, sections, FAQ, closing and footer.                                        |
| `dot-field.tsx`                      | The hero's WebGL backdrop: points that settle from scattered to ordered, lit around the pointer. |
| `statement.tsx`                      | The ad's opening line, lit a word at a time as it scrolls in.                                  |
| `forecast.tsx`, `forecast-chart.tsx` | The ad's holiday forecast, played by scroll. The model and geometry match the ad's chart.      |
| `flow.tsx`, `agents.tsx`             | The animated diagrams: an order's handoffs and split, and agents working over MCP.             |
| `story.tsx`                          | One pinned window that changes screen as the chapters scroll by.                               |
| `mockups.tsx`, `scaled.tsx`          | The product shots, and the wrapper that scales them to their column like screenshots.          |
| `film.tsx`                           | The ad, in a dialog.                                                                           |

- The product shots are the app's own components (`Table`, `Status`, `StatCard` and so on) with the ad's demo data, in
  the light theme: a `.light` element takes back the light colors inside the dark page (`src/styles/theme.css.ts`), and
  Tailwind's `dark:` variant skips it. When the app's pages change, update the mockups to match them.
- Every animation respects reduced motion: the diagrams hold still, the forecast shows its final state, and the dots
  start in order.
- To see the signed-out page while signed in, open it on `127.0.0.1` rather than `localhost`, where the session cookie
  lives.
- There are no paid plans, so the page asks only for a sign-up, and says it's free.

## Assets

`apps/copacker/public/marketing/` holds the film (the ad's web mix at 1080p and 30 fps), its poster and the social
image, the last two from the ad's end card. After re-rendering the ad (see [Video](video.md)), export them again from
`apps/video`:

```sh
pnpm exec remotion ffmpeg -y -i out/copacker-web.mp4 -r 30 -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart ../copacker/public/marketing/film.mp4
pnpm exec remotion ffmpeg -y -ss 101.2 -i out/copacker-web.mp4 -frames:v 1 -vf scale=1280:-2 -q:v 3 ../copacker/public/marketing/film.jpg
pnpm exec remotion ffmpeg -y -ss 101.2 -i out/copacker-web.mp4 -frames:v 1 -vf crop=1920:1008:0:36,scale=1200:630 -q:v 3 ../copacker/public/marketing/og.jpg
```
