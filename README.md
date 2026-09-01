# mp3-frame-counter

An HTTP API that counts the audio frames in an uploaded MPEG-1 Audio Layer III
file. Frames are counted by parsing the MP3 byte stream directly — no library
does the parsing.

Written in TypeScript and served by Fastify, with ESLint, Prettier and Jest
for linting, formatting and tests.

## Run it

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

The server listens on port 3000.

## Try it

Send the MP3 as a form upload:

```bash
curl -F "file=@test/fixtures/sample.mp3" http://localhost:3000/file-upload
```

…or as the raw request body:

```bash
curl --data-binary @test/fixtures/sample.mp3 http://localhost:3000/file-upload
```

Either way:

```json
{ "frameCount": 6089 }
```

That count is the one `mediainfo` reports for the same file.

## Test it

```bash
npm run verify
```

Runs lint, format check, typecheck and the test suite.

## API

### `POST /file-upload`

Accepts the MP3 either as a `multipart/form-data` file part — under any field
name — or as the raw request body. A non-multipart body is read as raw bytes
whatever its `Content-Type` claims, because clients label binary payloads
inconsistently; the bytes decide whether it is an MP3.

Responds `200` with `{ "frameCount": <number> }`.

Every error shares one shape:

```json
{
  "statusCode": 400,
  "code": "NO_FRAMES_FOUND",
  "error": "Bad Request",
  "message": "No MPEG Version 1 Layer III frames were found. The upload does not appear to be an MP3 file of that format."
}
```

| Status | `code`               | Cause                                                    |
| ------ | -------------------- | -------------------------------------------------------- |
| 400    | `NO_FILE_UPLOADED`   | Request carried no bytes                                 |
| 400    | `NO_FRAMES_FOUND`    | Bytes contained no MPEG-1 Layer III frames               |
| 400    | `UNREADABLE_UPLOAD`  | Multipart body malformed, or the upload ended early      |
| 404    | `ROUTE_NOT_FOUND`    | No such path                                             |
| 405    | `METHOD_NOT_ALLOWED` | Path exists under another method; see the `Allow` header |
| 413    | `FILE_TOO_LARGE`     | Upload exceeded `MAX_UPLOAD_BYTES`                       |
| 500    | `INTERNAL_ERROR`     | Unexpected failure; details are logged, not returned     |

## Configuration

| Variable           | Default               | Meaning                               |
| ------------------ | --------------------- | ------------------------------------- |
| `PORT`             | `3000`                | Listen port                           |
| `HOST`             | `0.0.0.0`             | Listen address                        |
| `MAX_UPLOAD_BYTES` | `209715200` (200 MiB) | Requests larger than this are refused |

## Scope

The endpoint counts **one MPEG Version 1, Layer III file per request**. These
sit deliberately outside that, named here rather than half-built:

| Outside scope                         | What happens instead                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| MPEG Version 2 / 2.5, Layers I and II | Rejected with `NO_FRAMES_FOUND`, naming the supported format                     |
| Free-format bitrate                   | Rejected: its length is not in its header, so the counter cannot step past it    |
| More than one file in a request       | The first file is read; the only promise is that it is never answered with a 5xx |

## Repository layout

```
src/mp3/     frame parsing and counting — Node builtins only, no framework
src/http/    Fastify app, routes, typed errors, one error handler
test/        mirrors src/; fixtures hold the MP3s and their verified counts
docs/        the knowledge log
```

The dependency arrow points one way: `src/http/` knows about `src/mp3/`, never
the reverse. The counter has no idea HTTP exists, which is why it can be tested
with hand-built byte arrays and would drop into a CLI unchanged.

## The docs directory

`docs/` is a knowledge log rather than a manual. Most of the work here was
learning how MP3 files are laid out, and that knowledge is worth writing down
once rather than rediscovering. Pages come in three kinds — **concept** for
domain knowledge, **evidence** for anything measured with an outside tool, and
**model** for the shape of the system, which is where the scalability story
lives. Reasoning is not repeated in them; it stays in
[decisions.md](docs/decisions.md) and is linked.

[docs/index.html](docs/index.html) is the only table of contents.

## Future work

Given more time, in the order I would take them:

- **Reject multi-file requests explicitly**, rather than leaving the answer
  unspecified. Doing so deterministically means reading the whole request
  before replying, since answering early resets a client that is still sending.
- **Support free-format files** by measuring each frame to the next sync word,
  which needs a different strategy from the current one.
- **Limit how many uploads run at once.** Memory per request is flat, but
  nothing caps concurrency; counting is CPU-bound and single-threaded, so past
  roughly 800 MB/s of aggregate throughput further requests add latency rather
  than throughput. A queue or connection limit would make that degradation
  orderly rather than uniform.
- **Bound the resynchronisation scan.** A large non-MP3 file is currently
  scanned byte by byte before being rejected; giving up after a few hundred
  kilobytes without a frame would refuse junk sooner.
- **Report a partial count for a truncated file** alongside a flag, instead of
  silently counting only the complete frames.

## Further reading

- [docs/decisions.md](docs/decisions.md) — every technical choice, with alternatives
- [docs/contributing.md](docs/contributing.md) — conventions this repo follows
- [docs/plan.md](docs/plan.md) — the build order the commit history follows
