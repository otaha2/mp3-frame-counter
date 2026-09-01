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

```bash
npm run bench
```

Reproduces the memory and chunk-size measurements quoted in
[the evidence pages](docs/evidence/streaming-memory.html): the same input counted
by the current design and by the buffered one it replaced, and the sample counted
at chunk sizes from one byte upwards.

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

Roughly in the order I would take them.

- **Limit how many uploads run at once.** Memory per request is flat, but
  nothing caps concurrency, and the counting itself runs on a single thread.
  Past roughly 800 MB/s of combined throughput, extra requests make everyone
  slower rather than getting more done. A queue or a connection limit would make
  that slowdown orderly instead of spreading it across every caller.

- **Give up sooner on a file that is not an MP3.** When an upload turns out to
  be something else, the counter looks for a frame starting at every single
  byte before concluding there are none — so a 200 MB file of the wrong kind is
  read from beginning to end before it is refused. Stopping after a few hundred
  kilobytes without a single frame would reject it almost immediately.

- **Say when a file was cut short.** A file that ends part-way through — an
  interrupted download, say — is counted as far as it goes, and the response
  looks exactly like one for a complete file. Returning the count alongside a
  flag saying the audio stopped mid-frame would let a caller tell the
  difference.

- **Refuse multi-file uploads outright.** Sending two files in one request
  currently gets an answer about the first, and the only guarantee is that the
  reply is not a server error. Saying plainly that one file is expected would be
  clearer. The catch is that a server which answers while the client is still
  uploading causes the client to see a broken connection, so refusing properly
  means reading the whole request first — paying for bytes that should never
  have been sent.

- **Accept free-format files.** A rare kind of MP3 leaves the bitrate out of
  each frame header, which means there is no way to calculate where the next
  frame begins. Those files are rejected today. Supporting them needs a second
  way of reading a file — searching for each following frame rather than
  stepping straight to it — alongside the method already here.

## Further reading

- [docs/decisions.md](docs/decisions.md) — every technical choice, with alternatives
- [docs/contributing.md](docs/contributing.md) — conventions this repo follows
- [docs/plan.md](docs/plan.md) — the build order the commit history follows
