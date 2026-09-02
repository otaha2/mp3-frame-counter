/**
 * The walkthrough in `docs/play/` teaches byte offsets and frame counts, so
 * those numbers have to be the ones this parser actually produces. This suite
 * reads the two files it describes out of the page, rebuilds them as real MP3
 * bytes, and checks the counter against every claim the page makes.
 *
 * Without this the page is prose that drifts. With it, a change to the parser
 * that would make the walkthrough wrong fails here instead.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { countFrames } from '../../src/mp3/countFrames';
import { FrameCounter } from '../../src/mp3/frameCounter';
import { frame, frameLength, id3v1Tag, id3v2Tag } from '../helpers/mp3';

const PAGE = join(__dirname, '..', '..', 'docs', 'play', 'frame-walker.html');
const html = readFileSync(PAGE, 'utf8');

/** Bytes of a stream the counter withholds until the stream ends. */
const WITHHELD = 128;

const BITRATE_INDEX = new Map(
  [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320].map((kbps, i) => [kbps, i + 1]),
);

interface Claim {
  readonly kind: string;
  readonly start: number;
  readonly len: number;
  readonly hdr?: readonly [number, number, number];
}

interface FileClaim {
  readonly total: number;
  readonly chunks: readonly number[];
  readonly segments: readonly Claim[];
}

/**
 * Lifts one `const NAME = { ... };` block out of the page.
 *
 * The page is a single self-contained file with no build step, so its data is
 * read as text rather than imported. Nothing here depends on how that file is
 * laid out: the block is split on the `kind` opening each segment and every
 * field is then found within its own segment, so reformatting cannot break it.
 */
function claimsFor(name: string): FileClaim {
  const start = html.indexOf(`const ${name} = {`);
  expect(start).toBeGreaterThan(-1);
  const block = html.slice(start, html.indexOf('\n      };', start));

  const total = Number(/total:\s*(\d+)/.exec(block)?.[1]);
  const chunkList = /chunks:\s*\[([\d,\s]+)\]/.exec(block)?.[1];
  const chunks = chunkList === undefined ? [] : chunkList.split(',').map((n) => Number(n.trim()));

  const segments = block
    .split(/\bkind:\s*/)
    .slice(1)
    .map((text): Claim => {
      const hdr = /hdr:\s*\[\s*(\d+),\s*(\d+),\s*(\d+)\s*\]/.exec(text);
      return {
        kind: String(/^['"](\w+)['"]/.exec(text)?.[1]),
        start: Number(/start:\s*(\d+)/.exec(text)?.[1]),
        len: Number(/len:\s*(\d+)/.exec(text)?.[1]),
        ...(hdr ? { hdr: [Number(hdr[1]), Number(hdr[2]), Number(hdr[3])] as const } : {}),
      };
    });

  expect(segments.length).toBeGreaterThan(0);
  return { total, chunks, segments };
}

/** Rebuilds a claimed file as the bytes it describes. */
function build(file: FileClaim): Buffer {
  return Buffer.concat(
    file.segments.map((seg) => {
      if (seg.kind === 'tag') return id3v2Tag(Buffer.alloc(seg.len - 10));
      if (seg.kind === 'id3v1') return id3v1Tag();

      const [kbps, hz, padding] = seg.hdr ?? [0, 0, 0];
      const bytes = frame({
        bitrateIndex: BITRATE_INDEX.get(kbps) ?? 0,
        sampleRateIndex: hz === 44100 ? 0 : hz === 48000 ? 1 : 2,
        padding: padding as 0 | 1,
      });
      // A metadata frame is an ordinary frame carrying a marker after the
      // header and the side information.
      if (seg.kind === 'meta') bytes.write('Xing', 4 + 32, 'latin1');
      return bytes;
    }),
  );
}

const WALK = claimsFor('FILE_WALK');
const STREAM = claimsFor('FILE_STREAM');

describe.each([
  ['the file walked in full', WALK],
  ['the file that arrives in chunks', STREAM],
])('%s', (_label, file) => {
  it('declares segments that tile the file exactly', () => {
    let at = 0;
    for (const seg of file.segments) {
      expect(seg.start).toBe(at);
      at += seg.len;
    }
    expect(at).toBe(file.total);
  });

  it('gives every frame the length its own header implies', () => {
    for (const seg of file.segments) {
      if (seg.hdr === undefined) continue;
      const [kbps, hz, padding] = seg.hdr;
      expect(seg.len).toBe(
        frameLength({
          bitrateIndex: BITRATE_INDEX.get(kbps) ?? 0,
          sampleRateIndex: hz === 44100 ? 0 : hz === 48000 ? 1 : 2,
          padding: padding as 0 | 1,
        }),
      );
    }
  });

  it('is built from bytes this parser reads back the same way', () => {
    const bytes = build(file);
    expect(bytes.length).toBe(file.total);

    const audio = file.segments.filter((s) => s.kind === 'audio').length;
    expect(countFrames(bytes).frameCount).toBe(audio);
  });

  it('answers 5, which is the number the walkthrough asks for', () => {
    expect(countFrames(build(file)).frameCount).toBe(5);
  });
});

describe('the chunk sizes the walkthrough arrives in', () => {
  it('add up to the whole file', () => {
    expect(STREAM.chunks.reduce((a, b) => a + b, 0)).toBe(STREAM.total);
  });

  it('put a readable frontier at each moment the page describes', () => {
    // The page quotes these as the bytes readable at each decision. They are
    // arrivals less the 128 the counter withholds against an ID3v1 tag.
    const quoted = [300, 418, 800, 1250, 1750];
    let arrived = 0;
    const frontiers = STREAM.chunks.map((n) => {
      arrived += n;
      return arrived - WITHHELD;
    });

    expect(frontiers).toEqual(quoted);
    for (const n of quoted) expect(html).toContain(String(n));
  });

  it('counts the same whether fed in those chunks or whole', () => {
    const bytes = build(STREAM);
    const counter = new FrameCounter();
    let sent = 0;
    for (const n of STREAM.chunks) {
      counter.update(bytes.subarray(sent, sent + n));
      sent += n;
    }

    expect(counter.end()).toEqual(countFrames(bytes));
  });

  it('holds a complete but unproven first frame at the second chunk', () => {
    // The moment the walkthrough is built around, and the reason these chunk
    // sizes are what they are: the whole of frame 1 is readable and it still
    // cannot be counted, because the header that would confirm it is not. A
    // stream opens unproven, so this needs no damage to arrange.
    const first = STREAM.segments[0];
    const frontier = STREAM.chunks.slice(0, 2).reduce((a, b) => a + b, 0) - WITHHELD;
    const endOfFrame = (first?.start ?? 0) + (first?.len ?? 0);

    expect(endOfFrame).toBeLessThanOrEqual(frontier); // every byte is readable
    expect(endOfFrame + 4).toBeGreaterThan(frontier); // the confirming header is not
  });

  it('never has to resynchronise, because the file is well formed', () => {
    expect(STREAM.segments.every((s) => s.kind === 'audio')).toBe(true);
    expect(countFrames(build(STREAM)).resyncedBytes).toBe(0);
  });
});
