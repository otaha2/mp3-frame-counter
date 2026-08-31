# Agent notes

Read `CONTRIBUTING.md` first — it holds the conventions, and they are binding.

## Guardrails

- `src/mp3/` imports Node builtins only. Never Fastify, never `src/http/`,
  never an npm package. No npm package may parse MP3 frame data: that is the
  point of the exercise, not an implementation detail.
- `test/fixtures/expected-counts.json` is ground truth from `mediainfo`.
  Never edit it to make a test pass.
- Run `npm run verify` before claiming any work is done. Do not commit red.
- Route handlers throw typed errors; they never set status codes.
- One `DECISIONS.md` row per technical choice, in the same commit.
- Docs pages land in the same commit as the code they explain.

## Orientation

| Path              | Holds                                                      |
| ----------------- | ---------------------------------------------------------- |
| `PLAN.md`         | The build order and each step's exit criteria              |
| `DECISIONS.md`    | Why anything is the way it is                              |
| `docs/index.html` | Knowledge log: format concepts, measurements, architecture |
| `src/mp3/`        | Frame parsing and counting (pure, dependency-free)         |
| `src/http/`       | Fastify app, routes, typed errors, error handler           |
