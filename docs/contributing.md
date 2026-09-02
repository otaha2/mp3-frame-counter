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

### Regenerating the fixtures

`sample.mp3` is the file supplied with the brief and is not generated. The rest
are built from it, so a contributor can reproduce every one:

```bash
# CBR 128 kbps stereo, no tags of any kind
ffmpeg -i sample.mp3 -t 2 -c:a libmp3lame -b:a 128k -ac 2   -write_xing 0 -id3v2_version 0 -map_metadata -1 cbr-128-stereo-bare.mp3

# CBR 64 kbps mono, with an ID3v2 tag and a leading Info frame
ffmpeg -i sample.mp3 -t 2 -c:a libmp3lame -b:a 64k -ac 1   -write_xing 1 -id3v2_version 4 cbr-64-mono-info.mp3

# CBR 192 kbps stereo; the ID3v1 tail is appended separately, below
ffmpeg -i sample.mp3 -t 3 -c:a libmp3lame -b:a 192k -ac 2   -write_xing 0 -id3v2_version 0 cbr-192-stereo-id3v1.mp3

# A real file of another format
ffmpeg -i sample.mp3 -t 1 -c:a pcm_s16le not-audio.wav
```

The 128-byte ID3v1 tail is written by hand rather than by ffmpeg, so that its
exact layout is visible in the source of the fixture rather than left to a
muxer:

```bash
node -e "const fs=require('node:fs');const t=Buffer.alloc(128);t.write('TAG',0,'latin1');t.write('Fixture',3,'latin1');t.write('mp3-frame-counter',33,'latin1');t.write('2026',93,'latin1');t[127]=12;fs.appendFileSync('cbr-192-stereo-id3v1.mp3',t)"
```

`truncated.mp3` is the first 20,000 bytes of `sample.mp3`, which cuts it
mid-frame:

```bash
head -c 20000 sample.mp3 > truncated.mp3
```

The encoder is not bit-for-bit deterministic across versions, so a regenerated
file will not have the same checksum as the committed one. The frame counts do
reproduce: all five were rebuilt with the commands above and match.

Regenerating a fixture changes its frame count. Re-derive the expectation with
`mediainfo` and `ffprobe -count_frames`, read
[the ground-truth page](https://otaha2.github.io/mp3-frame-counter/evidence/sample-ground-truth.html) on how to reconcile
them when they disagree, and record the new number in `expected-counts.json`.

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
- Comments never cite a decision number, and never point at `docs/` for the
  reason a line exists. Nothing verifies such a reference, so it rots silently
  when a page moves or is renumbered, and a reader should not have to open
  another file to understand the code in front of them. State the reason in the
  comment; `docs/` exists for the reader who wants the long version, and
  `docs/index.html` is how they find it. Naming a sibling module or a fixture is
  fine — that is describing the shape of the codebase, not outsourcing an
  explanation, and a moved module breaks the build rather than rotting quietly.

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
