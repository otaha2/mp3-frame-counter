/**
 * Counter tests in two layers: synthetic byte streams that isolate one rule
 * each, and real files checked against `expected-counts.json`, which holds
 * numbers produced by mediainfo and ffprobe.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { countFrames } from '../../src/mp3/countFrames';
import { frame, frameLength, id3v1Tag, id3v2Tag, metadataFrame } from '../helpers/mp3';

const FIXTURES = join(__dirname, '..', 'fixtures');

interface FixtureExpectation {
  readonly expectedFrameCount: number;
  readonly physicalFrames: number;
  readonly metadataFrame: string | null;
}

interface ExpectedCounts {
  readonly files: Record<string, FixtureExpectation>;
  readonly edgeCases: Record<string, FixtureExpectation>;
}

const groundTruth = JSON.parse(
  readFileSync(join(FIXTURES, 'expected-counts.json'), 'utf8'),
) as ExpectedCounts;

function stream(count: number): Buffer {
  return Buffer.concat(Array.from({ length: count }, () => frame()));
}

describe('countFrames on synthetic streams', () => {
  it('counts a bare run of frames', () => {
    expect(countFrames(stream(5))).toEqual({
      frameCount: 5,
      physicalFrames: 5,
      hasVbrMetadataFrame: false,
      resyncedBytes: 0,
    });
  });

  it('counts nothing in an empty or silent buffer', () => {
    expect(countFrames(Buffer.alloc(0)).frameCount).toBe(0);
    expect(countFrames(Buffer.alloc(5000)).frameCount).toBe(0);
  });

  it('follows a bitrate change from frame to frame', () => {
    const variable = Buffer.concat([
      frame({ bitrateIndex: 1 }),
      frame({ bitrateIndex: 14 }),
      frame({ bitrateIndex: 9, padding: 1 }),
    ]);

    expect(countFrames(variable).frameCount).toBe(3);
  });

  describe('metadata frames', () => {
    it.each(['Xing', 'Info', 'VBRI'] as const)('excludes a leading %s frame', (marker) => {
      const bytes = Buffer.concat([metadataFrame(marker), stream(4)]);
      const result = countFrames(bytes);

      expect(result).toMatchObject({
        frameCount: 4,
        physicalFrames: 5,
        hasVbrMetadataFrame: true,
      });
    });

    it('finds a mono Info marker at its shorter side-information offset', () => {
      const bytes = Buffer.concat([metadataFrame('Info', 3), stream(3)]);

      expect(countFrames(bytes).frameCount).toBe(3);
    });

    it('counts a marker that appears in a later frame as audio', () => {
      // Only the first frame of a stream is a metadata frame by convention;
      // the same bytes further in are payload.
      const bytes = Buffer.concat([stream(2), metadataFrame('Xing')]);

      expect(countFrames(bytes)).toMatchObject({
        frameCount: 3,
        hasVbrMetadataFrame: false,
      });
    });
  });

  describe('tags', () => {
    it('skips an ID3v2 tag whose body imitates frame headers', () => {
      // The syncsafe size field is what makes this safe: without honouring it,
      // the 0xFF bytes in the tag body would be scanned as audio.
      const bytes = Buffer.concat([id3v2Tag(Buffer.alloc(200, 0xff)), stream(4)]);

      expect(countFrames(bytes)).toMatchObject({ frameCount: 4, resyncedBytes: 0 });
    });

    it('stops before an ID3v1 tail', () => {
      const bytes = Buffer.concat([stream(3), id3v1Tag(0xff)]);

      expect(countFrames(bytes)).toMatchObject({ frameCount: 3, resyncedBytes: 0 });
    });
  });

  describe('damaged streams', () => {
    it('resynchronises after corruption between frames', () => {
      const bytes = Buffer.concat([stream(2), Buffer.alloc(50, 0x13), stream(2)]);
      const result = countFrames(bytes);

      expect(result.frameCount).toBe(4);
      expect(result.resyncedBytes).toBe(50);
    });

    it('skips leading rubbish before the first frame', () => {
      const bytes = Buffer.concat([Buffer.alloc(30, 0xab), stream(3)]);

      expect(countFrames(bytes)).toMatchObject({ frameCount: 3, resyncedBytes: 30 });
    });

    it('ignores a final frame whose bytes are incomplete', () => {
      const truncated = Buffer.concat([stream(3), frame().subarray(0, 100)]);

      expect(countFrames(truncated).frameCount).toBe(3);
    });

    it('does not count an isolated sync word in unrelated data', () => {
      // One valid-looking header with no second header a frame later. Counting
      // it would turn any binary file into a one-frame MP3.
      const bytes = Buffer.concat([frame().subarray(0, 4), Buffer.alloc(frameLength(), 0x7e)]);

      expect(countFrames(bytes).frameCount).toBe(0);
    });
  });
});

describe('countFrames against mediainfo ground truth', () => {
  const names = Object.keys(groundTruth.files);

  it('covers every fixture listed in expected-counts.json', () => {
    expect(names.length).toBeGreaterThan(0);
  });

  it.each(names)('matches the recorded count for %s', (name) => {
    const expected = groundTruth.files[name];
    if (expected === undefined) throw new Error(`no ground truth for ${name}`);

    const result = countFrames(readFileSync(join(FIXTURES, name)));

    expect(result.frameCount).toBe(expected.expectedFrameCount);
    expect(result.physicalFrames).toBe(expected.physicalFrames);
    expect(result.hasVbrMetadataFrame).toBe(expected.metadataFrame !== null);
    expect(result.resyncedBytes).toBe(0);
  });
});

describe('countFrames on files that are not well formed', () => {
  it('counts only the complete frames of a truncated file', () => {
    // The reference tools disagree here: mediainfo repeats the Xing header's
    // declared 6089, describing a file that no longer exists, and ffprobe
    // counts the final frame it began reading even though 234 of its 261
    // bytes are missing.
    const expected = groundTruth.edgeCases['truncated.mp3'];
    if (expected === undefined) throw new Error('no ground truth for truncated.mp3');

    const result = countFrames(readFileSync(join(FIXTURES, 'truncated.mp3')));

    expect(result.frameCount).toBe(expected.expectedFrameCount);
    expect(result.physicalFrames).toBe(expected.physicalFrames);
    expect(result.resyncedBytes).toBe(0);
  });

  it('finds no frames in a real file of another format', () => {
    const result = countFrames(readFileSync(join(FIXTURES, 'not-audio.wav')));

    expect(result.frameCount).toBe(0);
    expect(result.physicalFrames).toBe(0);
  });
});
