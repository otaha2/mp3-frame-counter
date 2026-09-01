# Agent notes

Read `docs/contributing.md` first — it holds the conventions, and they are binding.

## Guardrails

- `src/mp3/` imports Node builtins only. Never Fastify, never `src/http/`,
  never an npm package. No npm package may parse MP3 frame data: that is the
  point of the exercise, not an implementation detail.
- `test/fixtures/expected-counts.json` is ground truth from `mediainfo`.
  Never edit it to make a test pass.
- Run `npm run verify` before claiming any work is done. Do not commit red.
- Never commit unprompted. Present the change for review and wait for approval.
- Never mention the build order in code or docs pages: no step numbers, no
  references to `docs/plan.md`, no notes about what a later change will replace.
- Route handlers throw typed errors; they never set status codes.
- One `docs/decisions.md` row per technical choice, in the same commit.
- Docs pages land in the same commit as the code they explain.

## Orientation

| Path                | Holds                                                      |
| ------------------- | ---------------------------------------------------------- |
| `docs/plan.md`      | The build order and each step's exit criteria              |
| `docs/decisions.md` | Why anything is the way it is                              |
| `docs/index.html`   | Knowledge log: format concepts, measurements, architecture |
| `src/mp3/`          | Frame parsing and counting (pure, dependency-free)         |
| `src/http/`         | Fastify app, routes, typed errors, error handler           |
