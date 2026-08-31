# Plan

Goal: `POST /file-upload` → `{ "frameCount": n }` for MPEG-1 Audio Layer III,
counted by parsing frames ourselves, verified against mediainfo.

Each step ends green (`npm run verify`) and committed. The git log should read
like this list.

## Steps

0. **Ground truth & format study.** Expected count for the sample from
   mediainfo/ffprobe; byte-level inspection (ID3v2, first frame, Xing header,
   tail); concept + evidence pages in `docs/`.
   Exit: expected count recorded, "what is a frame count" decided
   (DECISIONS.md D1).
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
   Exit: failure-path tests green.
6. **Wrap-up.** README (clone → run → test in under two minutes, exact curl
   example), DECISIONS.md pass, future-work list, architecture + Q&A pages,
   clean-clone verification, git log review.
