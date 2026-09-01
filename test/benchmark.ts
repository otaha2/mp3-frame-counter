/**
 * Reproduces the measurements quoted in `docs/evidence/streaming-memory.html`.
 *
 * Run with `npm run bench`. This is not a test — nothing here asserts, and it
 * is excluded from the suite — but the numbers in the documentation should be
 * recognisable in its output on any machine.
 *
 * Memory is reported as `heapUsed + arrayBuffers`. Node allocates Buffers
 * outside the V8 heap, so `heapUsed` alone cannot see the uploaded bytes and
 * would report the same figure for both designs below.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { countFrames } from '../src/mp3/countFrames';
import { FrameCounter } from '../src/mp3/frameCounter';

const SAMPLE = readFileSync(join(__dirname, 'fixtures', 'sample.mp3'));
const CHUNK_BYTES = 64 * 1024;

/** Sizes an upload is repeated to, so growth can be seen against input size. */
const INPUT_REPEATS = [75, 150, 300];

/** Chunk sizes from the smallest that can exist to a realistic socket read. */
const CHUNK_SIZES = [1, 7, 100, 4096, SAMPLE.length];

const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1);

/** Bytes held by this process, including Buffers outside the V8 heap. */
function bytesHeld(): number {
  const usage = process.memoryUsage();
  return usage.heapUsed + usage.arrayBuffers;
}

/** The sample repeated, yielded in fixed-size pieces without copying. */
function* upload(repeats: number): Generator<Buffer> {
  for (let copy = 0; copy < repeats; copy += 1) {
    for (let offset = 0; offset < SAMPLE.length; offset += CHUNK_BYTES) {
      yield SAMPLE.subarray(offset, offset + CHUNK_BYTES);
    }
  }
}

interface Measurement {
  readonly frames: number;
  readonly growthBytes: number;
  readonly milliseconds: number;
}

/** Repeats a measurement and takes the middle result, since collection timing moves it. */
function median(runs: readonly Measurement[]): Measurement {
  const sorted = [...runs].sort((a, b) => a.growthBytes - b.growthBytes);
  const middle = sorted[Math.floor(sorted.length / 2)];
  if (middle === undefined) throw new Error('no runs to take a median of');
  return middle;
}

/**
 * Runs `count` while sampling memory, and reports the peak rather than the
 * final value: a buffer that is allocated and released during the run would be
 * invisible by the time it ends.
 */
function measureOnce(count: () => number): Measurement {
  globalThis.gc?.();

  const before = bytesHeld();
  let peak = before;
  const sampler = setInterval(() => {
    peak = Math.max(peak, bytesHeld());
  }, 5);

  const started = process.hrtime.bigint();
  const frames = count();
  const milliseconds = Number(process.hrtime.bigint() - started) / 1e6;

  clearInterval(sampler);
  peak = Math.max(peak, bytesHeld());

  return { frames, growthBytes: Math.max(0, peak - before), milliseconds };
}

/** Three runs, middle result. Garbage collection makes a single run unreliable. */
function measure(count: () => number): Measurement {
  return median([measureOnce(count), measureOnce(count), measureOnce(count)]);
}

/** Counts a stream of chunks, holding only what cannot yet be decided. */
function countStreaming(repeats: number): number {
  const counter = new FrameCounter();
  for (const chunk of upload(repeats)) counter.update(chunk);
  return counter.end().frameCount;
}

/** The superseded design: collect every chunk, join, then count once. */
function countBuffered(repeats: number): number {
  const collected: Buffer[] = [];
  for (const chunk of upload(repeats)) collected.push(chunk);
  return countFrames(Buffer.concat(collected)).frameCount;
}

function reportMemory(): void {
  console.log('Peak memory held while counting, by design and input size');
  console.log('  (middle of three runs; the streaming figure moves with collection timing)');
  console.log('  input      v1 buffered   v2 streaming   frames');

  for (const repeats of INPUT_REPEATS) {
    let inputBytes = 0;
    for (const chunk of upload(repeats)) inputBytes += chunk.length;

    const buffered = measure(() => countBuffered(repeats));
    const streaming = measure(() => countStreaming(repeats));
    const agree = buffered.frames === streaming.frames ? String(streaming.frames) : 'DISAGREE';

    console.log(
      `  ${mb(inputBytes).padStart(6)} MB` +
        `${(mb(buffered.growthBytes) + ' MB').padStart(14)}` +
        `${(mb(streaming.growthBytes) + ' MB').padStart(15)}   ${agree}`,
    );
  }
}

function reportChunkSizes(): void {
  console.log('\nThe answer does not depend on how the upload is divided');
  console.log('  chunk size    frames   resynced   time');

  const whole = countFrames(SAMPLE);

  for (const size of CHUNK_SIZES) {
    const started = process.hrtime.bigint();
    const counter = new FrameCounter();
    for (let offset = 0; offset < SAMPLE.length; offset += size) {
      counter.update(SAMPLE.subarray(offset, offset + size));
    }
    const result = counter.end();
    const ms = Number(process.hrtime.bigint() - started) / 1e6;

    const label = size === SAMPLE.length ? 'whole file' : String(size);
    const agrees = result.frameCount === whole.frameCount ? '' : '   DISAGREES WITH WHOLE FILE';
    console.log(
      `  ${label.padStart(10)}   ${String(result.frameCount).padStart(6)}` +
        `   ${String(result.resyncedBytes).padStart(8)}   ${ms.toFixed(0).padStart(4)} ms${agrees}`,
    );
  }
}

if (globalThis.gc === undefined) {
  console.log('Note: run with --expose-gc for a clean baseline; figures will be noisier.\n');
}

reportMemory();
reportChunkSizes();
