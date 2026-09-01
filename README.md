# mp3-frame-counter

An HTTP API that counts the audio frames in an uploaded MPEG-1 Audio Layer III
file. Frames are counted by parsing the MP3 byte stream directly — no library
does the parsing.

## Run it

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

The server listens on port 3000 (override with `PORT`).

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

**200**

```json
{ "frameCount": 6089 }
```

**Errors** all share one shape:

```json
{
  "statusCode": 413,
  "code": "FILE_TOO_LARGE",
  "error": "Payload Too Large",
  "message": "Uploaded file exceeds the maximum size of 209715200 bytes."
}
```

| Status | `code`             | Cause                                                |
| ------ | ------------------ | ---------------------------------------------------- |
| 400    | `NO_FILE_UPLOADED` | Request carried no bytes                             |
| 400    | `NO_FRAMES_FOUND`  | Bytes contained no MPEG-1 Layer III frames           |
| 413    | `FILE_TOO_LARGE`   | Upload exceeded `MAX_UPLOAD_BYTES`                   |
| 500    | `INTERNAL_ERROR`   | Unexpected failure; details are logged, not returned |

## Handling large files

The upload is counted as it arrives and never held in memory: a frame declares
its own length in its four-byte header, so the reader carries only a partial
header and its position within the current frame. Streaming 208 MB through the
counter grows the heap by 3.9 MB, and a 146 MB upload is answered in under a
second with the server's resident memory essentially unchanged. `MAX_UPLOAD_BYTES`
is therefore a policy limit on request size rather than a memory ceiling.

## Configuration

| Variable           | Default               | Meaning                                 |
| ------------------ | --------------------- | --------------------------------------- |
| `PORT`             | `3000`                | Listen port                             |
| `HOST`             | `0.0.0.0`             | Listen address                          |
| `MAX_UPLOAD_BYTES` | `209715200` (200 MiB) | Rejected beyond this, without buffering |

## Further reading

- [docs/decisions.md](docs/decisions.md) — every technical choice, with alternatives
- [docs/contributing.md](docs/contributing.md) — conventions
- [docs/plan.md](docs/plan.md) — build order and exit criteria
- [docs/index.html](docs/index.html) — knowledge log: MP3 format, measurements,
  architecture
