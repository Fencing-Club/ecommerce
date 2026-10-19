# Visual regression

Stories tagged `vrt` are compared with reference screenshots. Today that's every story of the
[Amazon booking dialogs](booking-dialogs.md).

```bash
pnpm --filter copacker test:vrt
```

The `vrt` Vitest project runs each tagged story in Chromium, as the `storybook` project does, play function included.
Then `.storybook/vrt.setup.ts` captures the open dialog, or the page when no dialog is open, and compares it with the
story's reference. The project exists only when it's asked for (`--project vrt`), so `pnpm test` and the `storybook`
project never take screenshots.

Chromium comes from Playwright, as for the other story tests:

```bash
pnpm --filter copacker exec playwright install chromium-headless-shell
```

## References

- Each reference sits beside its stories file, in `__screenshots__/<stories file>/<story>-chromium-<platform>.png`.
- Fonts render differently on each operating system, so references are per platform. The committed ones are Windows'
  (`win32`).
- A story without a reference fails, and its screenshot becomes the reference. Review it, then commit it. On CI the
  screenshot goes to `.cache/vrt/` instead.
- A mismatch fails, and writes the screenshot and its diff to `.cache/vrt/`, which git ignores.

After a change that's meant to look different, update the references, then review the changed images before you commit
them:

```bash
pnpm --filter copacker test:vrt --update
```

## Keeping screenshots stable

- Stories render at 1200 by 900 pixels, or at the viewport their `viewport` global sets.
- Fixtures use fixed dates, and stories read them in one time zone (`storyTimeZone` in `.storybook/intl.ts`). Ids come
  from React's `useId`, never from random numbers.
- During the run, animations and transitions are off, so spinners hold still, and the text caret is hidden. Each capture
  waits for the fonts.
- A story should end on the state it shows. The booking dialogs are held open (`open: true`), so a play function that
  clicks Done leaves the dialog on screen.

To add a story, tag it, or its meta, with `tags: ["vrt"]`, then run `test:vrt` to write its reference.
