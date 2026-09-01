/** Unit tests for locating the ID3 tag boundaries around the audio. */

import { hasId3v1Tag, id3v2TagSizeBytes } from '../../src/mp3/tags';
import { id3v1Tag, id3v2Tag } from '../helpers/mp3';

describe('id3v2TagSizeBytes', () => {
  it('returns 0 when there is no tag', () => {
    expect(id3v2TagSizeBytes(Buffer.from('not a tag at all'))).toBe(0);
    expect(id3v2TagSizeBytes(Buffer.alloc(0))).toBe(0);
    expect(id3v2TagSizeBytes(Buffer.from('ID'))).toBe(0);
  });

  it('measures header plus body', () => {
    expect(id3v2TagSizeBytes(id3v2Tag(Buffer.alloc(34)))).toBe(44);
  });

  it('decodes a syncsafe size that spans several bytes', () => {
    // 200 bytes needs two syncsafe bytes, so a naive big-endian read would
    // give a different answer here.
    expect(id3v2TagSizeBytes(id3v2Tag(Buffer.alloc(200)))).toBe(210);
  });

  it('includes the footer when the flag is set', () => {
    expect(id3v2TagSizeBytes(id3v2Tag(Buffer.alloc(34), { footer: true }))).toBe(54);
  });

  it('rejects a malformed size field rather than trusting it', () => {
    const tag = id3v2Tag(Buffer.alloc(34));
    tag[8] = 0xff; // a syncsafe byte may never have its high bit set

    expect(id3v2TagSizeBytes(tag)).toBe(0);
  });
});

describe('hasId3v1Tag', () => {
  it('recognises a tag at the end of the file', () => {
    expect(hasId3v1Tag(Buffer.concat([Buffer.alloc(500), id3v1Tag()]))).toBe(true);
  });

  it('is false without one, and for a file too short to hold one', () => {
    expect(hasId3v1Tag(Buffer.alloc(500))).toBe(false);
    expect(hasId3v1Tag(Buffer.from('TAG'))).toBe(false);
  });

  it('ignores the marker anywhere but the final 128 bytes', () => {
    expect(hasId3v1Tag(Buffer.concat([id3v1Tag(), Buffer.alloc(500)]))).toBe(false);
  });
});
