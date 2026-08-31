# mp3-frame-counter

An HTTP API that counts the audio frames in an uploaded MPEG-1 Audio Layer III
file. Frames are counted by parsing the MP3 byte stream directly — no library
does the parsing.

> **Status: step 1 of 6.** The endpoint, error handling and streaming upload
> path are real; the frame count is currently stubbed at `0`. See
> [PLAN.md](PLAN.md).

## Run it

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

The server listens on port 3000 (override with `PORT`).

## Try it

```bash
curl -F "file=@test/fixtures/sample.mp3" http://localhost:3000/file-upload
```

```json
{ "frameCount": 0 }
```

## Test it

```bash
npm run verify
```

Runs lint, format check, typecheck and the test suite.

## API

### `POST /file-upload`

Accepts `multipart/form-data` with the MP3 in a field named `file`.

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

| Status | `code`                   | Cause                                                |
| ------ | ------------------------ | ---------------------------------------------------- |
| 400    | `NO_FILE_UPLOADED`       | Multipart request with no file part                  |
| 413    | `FILE_TOO_LARGE`         | Upload exceeded `MAX_UPLOAD_BYTES`                   |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | Body was not `multipart/form-data`                   |
| 500    | `INTERNAL_ERROR`         | Unexpected failure; details are logged, not returned |

## Configuration

| Variable           | Default              | Meaning                                 |
| ------------------ | -------------------- | --------------------------------------- |
| `PORT`             | `3000`               | Listen port                             |
| `HOST`             | `0.0.0.0`            | Listen address                          |
| `MAX_UPLOAD_BYTES` | `209715200` (200 MB) | Rejected beyond this, without buffering |

## Further reading

- [PLAN.md](PLAN.md) — build order and exit criteria
- [DECISIONS.md](DECISIONS.md) — every technical choice, with alternatives
- [CONTRIBUTING.md](CONTRIBUTING.md) — conventions
- [docs/index.html](docs/index.html) — knowledge log: MP3 format, measurements,
  architecture
