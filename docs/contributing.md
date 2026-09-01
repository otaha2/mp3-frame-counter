# Conventions

How this repository is built, for anyone changing it.

## Layering

Two layers, and the dependency arrow only points one way.

- **`src/mp3/`** — the domain. Parses bytes, counts frames. Imports Node
  builtins and nothing else: not Fastify, not `src/http/`, no npm packages.
  It can therefore be tested with plain byte arrays and reused outside an HTTP
  server.
- **`src/http/`** — the transport. Wires the app, defines routes and typed
  errors, renders responses. Knows about `src/mp3/`; the reverse is never true.
- **`src/config.ts`** — the only module that reads `process.env`. Everything
  else receives a `Config`.
- **`src/index.ts`** — builds the app and listens. Nothing else.

Each file in `src/mp3/` opens with a summary of the format knowledge it
encodes, written to stand on its own.

## Errors

Route handlers **throw** typed errors from `src/http/errors.ts` and never call
`reply.status()`. One `setErrorHandler` in `src/http/app.ts` renders every
failure into the same JSON body:

```json
{ "statusCode": 413, "code": "FILE_TOO_LARGE", "error": "Payload Too Large", "message": "..." }
```

`code` is the stable, machine-readable discriminator; `message` is for humans
and may be reworded. Unexpected 5xx errors are logged server-side and reported
to the client without detail.

## Tests

Three independent layers, so a wrong answer points at exactly one of them:

1. **Unit** — hand-built byte arrays against the parser. No files, no server.
2. **Parser integration** — real MP3 files against counts verified with
   `mediainfo`, stored in `test/fixtures/expected-counts.json`.
3. **HTTP** — Fastify `app.inject()`. No sockets, no network.

`test/` mirrors `src/`. **Never edit `expected-counts.json` to make a test
pass** — it is ground truth from an outside tool; if the code disagrees with
it, the code is wrong until proven otherwise in `decisions.md`.

## Code style

- Comments say **why**, or state an invariant. Never what a line does.
- Every exported function, interface and class gets a short doc comment.
- Magic numbers become named constants carrying the spec meaning
  (`SAMPLES_PER_FRAME`, not `1152`).
- `strict` TypeScript, plus `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. Prefer `readonly` on data that never changes.
- Neither code nor `docs/` refers to the build order — no "step 3", no pointer
  to the plan. A comment explains why the code is as it is, or states an
  invariant it holds; it never describes when the code was written or what a
  later change will do to it. The sequence lives in `plan.md` and the git log,
  which are the only places it belongs.
- Comments never cite a file path or a decision number. Nothing verifies such a
  reference, so it rots silently when a document moves, and a reader should not
  have to open another file to understand the code in front of them. State the
  reason in the comment; `docs/` exists for the reader who wants the long
  version, and `docs/index.html` is how they find it.

## Verify before done

```bash
npm run verify
```

Runs lint, format check, typecheck and tests. It must pass before any commit
and before calling any step complete.

## Git

- `main` only; commit at every green state.
- Imperative mood. Work that belongs to a step in `plan.md` is prefixed
  `step N:`; work that arises outside one is not forced into that shape.
- Add a body only when the commit embodies a decision, and reference
  `decisions.md` when it does.
- Every technical choice gets a `decisions.md` row in the same commit that
  implements it.

## Documentation

`docs/` is a knowledge log, not a diary: reference tone, no narrative, no first
person. Reasoning lives in `decisions.md` and is linked, never restated.

- A **concept** page when domain knowledge is needed to write or review code.
- An **evidence** page when something is measured with an outside tool.
- A **model** page when the shape of the system changes.

`docs/index.html` is the only table of contents. Pages share
`docs/assets/docs.css` and work in light and dark. Diagrams must show a
mechanism — labelled arrows, real flow — never a box with a noun in it. When a
change teaches something, its docs page lands in the same commit.
