# Decisions

Why this service is the way it is. Each entry states the question that came up,
the options that were open, what was chosen and why. Numbers are stable and
never reused, so entries elsewhere can refer to them.

## Index

- [D1 — What `frameCount` counts](#d1--what-framecount-counts)
- [D4 — Fastify rather than Express](#d4--fastify-rather-than-express)
- [D5 — One error shape, carrying a `code`](#d5--one-error-shape-carrying-a-code)
- [D9 — The header parser returns `null` rather than throwing](#d9--the-header-parser-returns-null-rather-than-throwing)
- [D10 — Free-format files are rejected](#d10--free-format-files-are-rejected)
- [D11 — Following ffprobe where the reference tools disagree](#d11--following-ffprobe-where-the-reference-tools-disagree)
- [D12 — Two headers before trusting a resync](#d12--two-headers-before-trusting-a-resync)
- [D14 — Accepting the MP3 as a raw request body](#d14--accepting-the-mp3-as-a-raw-request-body)
- [D15 — Finding no frames is an error](#d15--finding-no-frames-is-an-error)
- [D16 — Counting incrementally, with one implementation](#d16--counting-incrementally-with-one-implementation)
- [D17 — Counting a truncated file rather than refusing it](#d17--counting-a-truncated-file-rather-than-refusing-it)
- [D18 — Unreadable uploads are client errors](#d18--unreadable-uploads-are-client-errors)
- [D19 — Routing failures carry a `code` too](#d19--routing-failures-carry-a-code-too)
- [D20 — One file per request](#d20--one-file-per-request)

Also here: four [smaller choices](#smaller-choices) — the TypeScript version,
CommonJS, the `dev` script and configuration — and two entries that have been
[superseded](#superseded).

## D1 — What `frameCount` counts

**Question.** The sample holds 6090 structurally valid frames. The first is a
Xing frame carrying encoder statistics rather than audio. Does it count?

**Options.** (a) Count all 6090. (b) Report the count the Xing header itself
declares. (c) Count 6090 less the metadata frame.

**Decision.** (c). The endpoint reports 6089.

**Why.** The metadata frame contains no audio, and `mediainfo`, `ffprobe` and
the Xing field all agree on 6089. (b) is rejected because the count has to come
from parsing frames — that field is a cross-check, not the source.

**Evidence.** [The sample, byte by byte](evidence/sample-ground-truth.html)

## D4 — Fastify rather than Express

**Question.** Which HTTP framework, given uploads may be large and must not be
held in memory?

**Options.** (a) Express with multer. (b) Fastify with `@fastify/multipart`.

**Decision.** (b).

**Why.** Streaming a multipart part with a byte limit is first-party in Fastify,
whereas multer's defaults buffer to memory or disk — the opposite of what large
uploads need. Fastify's `inject()` also allows HTTP tests that open no sockets.

**Evidence.** [Architecture](model/architecture.html)

## D5 — One error shape, carrying a `code`

**Question.** What should a failure response contain, and how much of an
unexpected error should reach the client?

**Options.** (a) Fastify's default `{ statusCode, error, message }`. (b) The
same plus a machine-readable `code`.

**Decision.** (b), and 5xx errors are logged rather than described.

**Why.** `code` is Fastify's own convention: it serialises a thrown error's
`code` automatically and its built-in errors already carry one, so omitting ours
would have made the API less consistent rather than simpler. Clients branch on a
stable code instead of on prose. Suppressing 5xx detail is not optional —
Fastify's default handler echoes the raw exception message, which leaks internal
paths.

## D9 — The header parser returns `null` rather than throwing

**Question.** How should the header parser report four bytes that are not a
valid header?

**Options.** (a) Throw an error. (b) Return a result type carrying a reason.
(c) Return `null`.

**Decision.** (c).

**Why.** Invalid bytes are the normal case, not an exceptional one:
resynchronising after damage tests one candidate offset per byte, so failure is
the common path and has to stay cheap and quiet. Both alternatives would build
and discard an object millions of times to carry information no caller reads.

## D10 — Free-format files are rejected

**Question.** Free-format files (bitrate index 0) declare no bitrate. Should
they be counted?

**Options.** (a) Accept them, sizing each frame by scanning to the next sync
word. (b) Reject them.

**Decision.** (b).

**Why.** Without a bitrate a frame's length cannot be derived from its own
header, so (a) means searching for every following sync word — abandoning the
jump-by-length approach the whole counter is built on, for a format the brief
does not require.

**Evidence.** [The file format](concepts/mp3-structure.html)

## D11 — Following ffprobe where the reference tools disagree

**Question.** For `cbr-64-mono-info.mp3`, `mediainfo` reports 79 and `ffprobe`
reports 78. Which should this service match?

**Options.** (a) `mediainfo`, which the brief names as the tool to verify
against. (b) `ffprobe`.

**Decision.** (b). The file is reported as 78.

**Why.** `mediainfo` is not self-consistent across the fixtures: it excludes the
Xing frame on the VBR sample (6089 of 6090) but includes the Info frame here (79
of 79), apparently reading the declared field for one and counting frames for
the other. `ffprobe` excludes the metadata frame in both cases, as does each
file's own count field. Matching the tool that contradicts itself would make the
answer depend on how the file happened to be encoded.

**Evidence.** [Where the tools disagree](evidence/sample-ground-truth.html)

## D12 — Two headers before trusting a resync

**Question.** After damage, how much evidence is needed before believing a
header marks the start of a frame?

**Options.** (a) One valid-looking header. (b) Two, the second exactly one frame
length after the first.

**Decision.** (b). A frame whose declared length runs past the end of the audio
is also not counted.

**Why.** Eleven set bits followed by plausible fields occur readily inside
compressed payload and unrelated binary files, so (a) would give an arbitrary
file a non-zero frame count — and a file that is not an MP3 has to be reported
as an error rather than a number. The second header costs one extra read per
resync and nothing at all while in sync.

**Evidence.** [The counting rules](concepts/frame-counting.html)

## D14 — Accepting the MP3 as a raw request body

**Question.** The brief asks for "an MP3 file upload via the POST method"
without naming a transfer format. Which bodies should be accepted?

**Options.** (a) `multipart/form-data` only, rejecting anything else with 415.
(b) Multipart plus an allowlist of binary media types. (c) Multipart plus any
other body, read as raw bytes whatever its `Content-Type` claims.

**Decision.** (c).

**Why.** Posting the file directly is a reasonable reading of the brief. (b)
fails the most likely test command: `curl --data-binary @sample.mp3` sends
`application/x-www-form-urlencoded` unless told otherwise, so a good upload
would be refused over a header the caller never chose. The bytes settle it
instead, and a body that is not MPEG-1 Layer III is reported as such.

## D15 — Finding no frames is an error

**Question.** What should an upload containing no frames return?

**Options.** (a) `200` with `{ "frameCount": 0 }`. (b) `400 NO_FRAMES_FOUND`.

**Decision.** (b).

**Why.** Zero would claim the file is a valid MP3 that happens to contain no
audio, when the cause is almost always a file of another kind; returning 200 for
a JPEG is a wrong answer dressed as a right one. This is also what makes D14
safe — the check a media-type guard used to perform now happens where the
evidence actually is.

## D16 — Counting incrementally, with one implementation

**Question.** Must the whole upload be held in memory to count it, and where
should the counting rules live?

**Options.** (a) Buffer the upload and count it in one pass. (b) Write a
streaming counter alongside the buffered one. (c) Write only the streaming
counter and have the whole-buffer helper delegate to it.

**Decision.** (c).

**Why.** A frame is decided entirely by its own four-byte header, so nothing
earlier in the file is needed and the reader can carry a fixed amount of state:
at most one frame while it looks for the start of the stream, plus the trailing
128 bytes that may be an ID3v1 tag. Measured heap growth was 3.9 MB over
208.6 MB of input. (b) is rejected because two copies of the same rules drift —
delegating means the existing counter tests exercise the streaming machine,
leaving chunk-size invariance as the only new thing to test.

**Evidence.** [Measurements](evidence/streaming-memory.html)

## D17 — Counting a truncated file rather than refusing it

**Question.** `truncated.mp3` ends mid-frame: 96 complete frames, then a 97th
missing 234 of its 261 bytes. What should it report?

**Options.** (a) `mediainfo`'s 6089. (b) `ffprobe`'s 96. (c) 95 — complete
frames, less the metadata frame. (d) Refuse the file as damaged.

**Decision.** (c).

**Why.** The tools answer different questions. `mediainfo` repeats the Xing
header's declared count and so describes a file that no longer exists — the
clearest demonstration that it reads the field rather than the frames.
`ffprobe` counts a frame whose audio is almost entirely absent. (d) is wrong
because the 95 complete frames are perfectly real: partial data is a reason to
answer carefully, not to decline.

**Evidence.**
[`expected-counts.json`, the `edgeCases` section](../test/fixtures/expected-counts.json)

## D18 — Unreadable uploads are client errors

**Question.** Busboy reports a body it cannot parse — no boundary, an upload
that ends early, a client that disconnects — as a stream error carrying no
status code. How should those reach the client?

**Options.** (a) Leave them, so the error handler renders them as 500. (b) Match
their codes or messages centrally in the error handler. (c) Catch them where
they are raised and translate to `400 UNREADABLE_UPLOAD`.

**Decision.** (c).

**Why.** These are the caller's mistakes and must not be reported as server
faults, which is what an unstatused error becomes. (b) would depend on text a
dependency may reword; catching at the point of failure identifies them by
location instead. The three causes share one message because the parser cannot
always tell them apart, and naming all three is more useful than guessing. The
stream cannot say whether it failed or the code reading it did — `errored` is
null and `destroyed` is true either way — so the original error is kept as the
`cause` and logged, leaving a genuine defect findable even if it is misreported
here.

## D19 — Routing failures carry a `code` too

**Question.** Fastify renders unmatched routes through its own handler, which
returns 404 without a `code`. Should that be left alone?

**Options.** (a) Keep the default: 404 for everything unmatched. (b) Render 404
in the API's error shape, and answer 405 with an `Allow` header when only the
method is wrong.

**Decision.** (b).

**Why.** The default made `GET /file-upload` indistinguishable from a typo in
the URL, and its body was the only response in the API missing the field a
client would branch on. The allowed methods are read from Fastify's own route
table rather than hardcoded, so the answer stays correct if a route is added.

## D20 — One file per request

**Question.** What should happen when a request carries more than one file?

**Options.** (a) Read every part so the answer is deterministic, counting the
first file. (b) Reject the request, which also requires reading all of it.
(c) Treat it as out of scope: read the first file, promise only that the
response is never a 5xx.

**Decision.** (c).

**Why.** The brief asks for one MP3 per request, so several files is a caller
error rather than a feature to build. Both (a) and (b) mean reading a body that
should not have been sent — answering early resets a client that is still
sending — which is a real cost for a case no client should produce. The boundary
is named in the README instead of being half-built.

## Smaller choices

- **D2** — TypeScript is pinned to 5.9.3 because `ts-jest` declares the peer
  range `>=4.3 <7`.
- **D3** — CommonJS rather than ESM: Jest on ESM still needs
  `--experimental-vm-modules`, and nothing here is ESM-only.
- **D6** — `tsx` for the `dev` script. The alternatives need either two
  concurrent processes, which no npm script expresses portably, or Node 22.6+,
  which would raise the supported floor above Node 20. It transpiles without
  type checking, so `npm run verify` remains the gate.
- **D8** — `Config` is built in `src/config.ts` and passed into `buildApp()`, so
  tests can vary the upload limit without touching `process.env`.

## Superseded

- **D7** — a catch-all content-type parser that threw `UNSUPPORTED_MEDIA_TYPE`.
  Replaced by D14, which accepts a raw body instead of rejecting it.
- **D13** — shipping the buffer counter behind the route first, to get a correct
  endpoint before an efficient one. Replaced by D16.
