# Agent notes

- **No npm package may parse MP3 frame data.** That constraint is the exercise,
  not an implementation detail. `src/mp3/` imports Node builtins only.
- **`test/fixtures/expected-counts.json` is ground truth** from `mediainfo` and
  `ffprobe`. When a test disagrees with it, the code is wrong. Never edit the
  expectations to make a test pass.
- **Run `npm run verify`** before saying any work is done.
- **Neither code nor `docs/` mentions the build order** — no step numbers, no
  pointers to the plan. A comment says why the code is as it is, or states an
  invariant; never when it was written or what will replace it.
- **Every technical choice gets a `docs/decisions.md` row**, and a docs page
  lands in the same commit as the code it explains.

`docs/contributing.md` holds the full conventions, written for a human reader.
