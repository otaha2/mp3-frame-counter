# Plan

Goal: `POST /file-upload` → `{ "frameCount": n }` for MPEG-1 Audio Layer III,
counted by parsing frames ourselves, verified against mediainfo.

Each step ends green (`npm run verify`) and committed. The git log should read
like this list.

**This is the plan as written before any code existed, kept unchanged.** All six
steps are done. It is left in its original form because a plan rewritten to match
the outcome is no longer a plan, and because where the work diverged from it, the
divergence is the interesting part — see [what changed](#what-changed) at the end
and the reasoning in [decisions.md](decisions.md).

## Steps

0. **Ground truth & format study.** Expected count for the sample from
   mediainfo/ffprobe; byte-level inspection (ID3v2, first frame, Xing header,
   tail); concept + evidence pages in `docs/`.
   Exit: expected count recorded, "what is a frame count" decided
   (decisions.md D1).
1. **Scaffold + walking skeleton.** Tooling (TS strict, ESLint, Prettier,
   Jest), conventions files, streaming `POST /file-upload` that drains the
   upload and returns a stubbed `{ "frameCount": 0 }`; typed-error shape
   (400 no file / 413 too large / 415 not multipart) fixed from day one.
   Exit: curl round-trip works; verify green.
2. **Pure header parser.** `src/mp3/frameHeader.ts`: 4-byte header → typed
   object or `null`; frame length formula.
   Exit: unit tests from hand-built byte arrays cover acceptance and every
   rejection field.
3. **Buffer counter.** Skip ID3v2 (syncsafe size), walk frames by computed
   length, resync on invalid headers, stop before ID3v1 tail, apply the D1
   policy to the Xing/Info frame.
   Exit: sample matches ground truth (6089); ffmpeg-generated fixtures with
   mediainfo-verified counts in `expected-counts.json`.
4. **Streaming counter.** Resumable state machine consuming arbitrary chunks:
   carry-over for split headers, skip-by-arithmetic across boundaries; wired
   into the route, replacing the stub.
   Exit: chunk sizes 1 / 7 / 100 / 4096 / whole-file give identical counts;
   memory flat regardless of file size.
5. **Error handling complete.** Every failure path returns the standard JSON
   error with a useful message; failure fixtures (truncated file, non-MP3).
   Zero frames found is an error, not a zero count.
   Known gaps carried in from step 1, both to be closed here:
   - A 404 is rendered by Fastify's not-found handler, not the error handler,
     so it lacks the `code` field every other error carries.
   - Uploading two files trips the `files: 1` busboy limit, which destroys the
     part stream and surfaces as `ERR_STREAM_PREMATURE_CLOSE` with no status —
     reported as a 500 although the caller is at fault. Should be a 400.

   Exit: failure-path tests green; no client mistake reports as 5xx.

6. **Wrap-up.** README (clone → run → test in under two minutes, exact curl
   example), decisions.md pass, future-work list, architecture + Q&A pages,
   clean-clone verification, git log review.

## What changed

Three things in the list above are no longer true of the service, and each is a
decision rather than an oversight.

- **Step 1 fixes a `415 not multipart` error into the design.** That error no
  longer exists. The endpoint accepts the MP3 as a raw request body as well as a
  multipart part, so a body that is not multipart is read rather than refused,
  and one that is not an MP3 is reported as such instead (D14, D15).
- **Step 5 lists a two-file upload as a bug to fix.** It became a scope boundary
  instead: several files in one request is a caller error, and the only promise
  is that it never answers with a 5xx (D20).
- **Steps 3 and 4 build two counters.** Only one survives. The whole-buffer
  helper delegates to the streaming counter rather than duplicating the rules
  (D16).
