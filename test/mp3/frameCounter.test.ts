/**
 * Streaming counter tests.
 *
 * The counting rules themselves are covered in `countFrames.test.ts`, which
 * drives the same class through a single chunk. What matters here is that the
 * division of the stream into chunks makes no difference to the answer.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { countFrames } from '../../src/mp3/countFrames';
import { FrameCounter, type FrameCountResult } from '../../src/mp3/frameCounter';
import { frame, id3v1Tag, id3v2Tag, metadataFrame } from '../helpers/mp3';

const FIXTURES = join(__dirname, '..', 'fixtures');
const groundTruth = JSON.parse(readFileSync(join(FIXTURES, 'expected-counts.json'), 'utf8')) as {
  files: Record<string, unknown>;
  edgeCases: Record<string, unknown>;
};

/**
 * Every fixture, well formed or not. The damaged ones matter most here: they are
 * the inputs that exercise resynchronisation and the end-of-stream decision, so
 * they are the ones whose answer could plausibly depend on where a chunk falls.
 */
const FIXTURE_NAMES = [...Object.keys(groundTruth.files), ...Object.keys(groundTruth.edgeCases)];

/** Feeds `bytes` through the counter in fixed-size pieces. */
function countInChunks(bytes: Buffer, chunkSize: number): FrameCountResult {
  const counter = new FrameCounter();
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    counter.update(bytes.subarray(offset, offset + chunkSize));
  }
  return counter.end();
}

/** Chunk sizes chosen to split headers, frames and tags at awkward points. */
const CHUNK_SIZES = [1, 7, 100, 4096];

describe('chunking does not change the answer', () => {
  it.each(FIXTURE_NAMES)('%s counts the same at every chunk size', (name) => {
    const bytes = readFileSync(join(FIXTURES, name));
    const whole = countFrames(bytes);

    for (const size of CHUNK_SIZES) {
      expect(countInChunks(bytes, size)).toEqual(whole);
    }
  });

  it.each(CHUNK_SIZES)('a damaged stream resynchronises the same way at chunk size %i', (size) => {
    const damaged = Buffer.concat([
      id3v2Tag(Buffer.alloc(60, 0xff)),
      frame(),
      Buffer.alloc(50, 0x13),
      frame({ bitrateIndex: 3 }),
      frame(),
      id3v1Tag(0xff),
    ]);

    expect(countInChunks(damaged, size)).toEqual(countFrames(damaged));
  });
});

describe('boundaries between chunks', () => {
  it('reassembles a header split across two chunks', () => {
    const bytes = Buffer.concat([frame(), frame()]);
    const counter = new FrameCounter();

    // Cut two bytes into the second frame's header.
    counter.update(bytes.subarray(0, frame().length + 2));
    counter.update(bytes.subarray(frame().length + 2));

    expect(counter.end().frameCount).toBe(2);
  });

  it('skips a frame that spans many chunks without holding it', () => {
    const bytes = Buffer.concat([frame({ bitrateIndex: 14 }), frame({ bitrateIndex: 14 })]);

    expect(countInChunks(bytes, 16).frameCount).toBe(2);
  });

  it('measures an ID3v2 tag whose header is split across chunks', () => {
    const bytes = Buffer.concat([id3v2Tag(Buffer.alloc(300, 0xff)), frame(), frame()]);
    const counter = new FrameCounter();

    counter.update(bytes.subarray(0, 4));
    counter.update(bytes.subarray(4, 9));
    counter.update(bytes.subarray(9));

    expect(counter.end()).toMatchObject({ frameCount: 2, resyncedBytes: 0 });
  });

  it('recognises an ID3v1 tail that arrives in pieces', () => {
    const bytes = Buffer.concat([frame(), frame(), id3v1Tag(0xff)]);

    expect(countInChunks(bytes, 13)).toMatchObject({ frameCount: 2, resyncedBytes: 0 });
  });

  it('excludes a metadata frame delivered one byte at a time', () => {
    const bytes = Buffer.concat([metadataFrame('Xing'), frame(), frame()]);

    expect(countInChunks(bytes, 1)).toMatchObject({
      frameCount: 2,
      physicalFrames: 3,
      hasVbrMetadataFrame: true,
    });
  });
});

describe('the counter as an object', () => {
  it('ignores empty chunks', () => {
    const counter = new FrameCounter();
    counter.update(Buffer.alloc(0));
    counter.update(frame());
    counter.update(Buffer.alloc(0));
    counter.update(frame());

    expect(counter.end().frameCount).toBe(2);
  });

  it('counts nothing for a stream that never had any bytes', () => {
    expect(new FrameCounter().end()).toEqual({
      frameCount: 0,
      physicalFrames: 0,
      hasVbrMetadataFrame: false,
      resyncedBytes: 0,
    });
  });

  it('refuses to accept more bytes once ended', () => {
    const counter = new FrameCounter();
    counter.update(frame());
    counter.end();

    expect(() => counter.update(frame())).toThrow('after end');
  });
});
