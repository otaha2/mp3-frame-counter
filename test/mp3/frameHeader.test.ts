/**
 * Unit tests for the frame-header parser, built from hand-assembled bytes.
 *
 * No files and no server: a failure here means the header fields or the length
 * formula are wrong, and nothing else.
 */

import { parseFrameHeader } from '../../src/mp3/frameHeader';

/** Bit positions of each header field, counted from the least significant bit. */
const Shift = {
  Sync: 21,
  Version: 19,
  Layer: 17,
  Protection: 16,
  Bitrate: 12,
  SampleRate: 10,
  Padding: 9,
  ChannelMode: 6,
} as const;

interface HeaderFields {
  sync?: number;
  version?: number;
  layer?: number;
  protection?: number;
  bitrateIndex?: number;
  sampleRateIndex?: number;
  padding?: number;
  channelMode?: number;
}

/**
 * Assembles a 4-byte header. Defaults describe a valid MPEG-1 Layer III frame
 * at 64 kbps and 44.1 kHz, so each test overrides only the field it exercises.
 */
function buildHeader(fields: HeaderFields = {}): Buffer {
  const {
    sync = 0x7ff,
    version = 0b11,
    layer = 0b01,
    protection = 0b1,
    bitrateIndex = 5,
    sampleRateIndex = 0,
    padding = 0,
    channelMode = 0b00,
  } = fields;

  const header =
    ((sync << Shift.Sync) |
      (version << Shift.Version) |
      (layer << Shift.Layer) |
      (protection << Shift.Protection) |
      (bitrateIndex << Shift.Bitrate) |
      (sampleRateIndex << Shift.SampleRate) |
      (padding << Shift.Padding) |
      (channelMode << Shift.ChannelMode)) >>>
    0;

  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(header);
  return buffer;
}

/** Writes a raw 32-bit header value, for testing bytes copied out of a file. */
function rawHeader(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

describe('parseFrameHeader', () => {
  describe('headers taken from the sample file', () => {
    it('parses the metadata frame header at offset 44', () => {
      expect(parseFrameHeader(rawHeader(0xfffb5000))).toEqual({
        bitrateKbps: 64,
        sampleRateHz: 44100,
        channelMode: 'stereo',
        hasPadding: false,
        frameLengthBytes: 208,
      });
    });

    it('parses the first audio frame header at offset 252', () => {
      expect(parseFrameHeader(rawHeader(0xfffb1064))).toEqual({
        bitrateKbps: 32,
        sampleRateHz: 44100,
        channelMode: 'joint-stereo',
        hasPadding: false,
        frameLengthBytes: 104,
      });
    });
  });

  describe('frame length', () => {
    it.each([
      { kbps: 32, hz: 44100, bitrateIndex: 1, sampleRateIndex: 0, expected: 104 },
      { kbps: 64, hz: 44100, bitrateIndex: 5, sampleRateIndex: 0, expected: 208 },
      { kbps: 128, hz: 44100, bitrateIndex: 9, sampleRateIndex: 0, expected: 417 },
      { kbps: 320, hz: 44100, bitrateIndex: 14, sampleRateIndex: 0, expected: 1044 },
      { kbps: 32, hz: 48000, bitrateIndex: 1, sampleRateIndex: 1, expected: 96 },
      { kbps: 32, hz: 32000, bitrateIndex: 1, sampleRateIndex: 2, expected: 144 },
    ])(
      'is $expected bytes at $kbps kbps, $hz Hz',
      ({ bitrateIndex, sampleRateIndex, expected }) => {
        const header = parseFrameHeader(buildHeader({ bitrateIndex, sampleRateIndex }));

        expect(header?.frameLengthBytes).toBe(expected);
      },
    );

    it('adds exactly one byte when the padding bit is set', () => {
      const unpadded = parseFrameHeader(buildHeader({ bitrateIndex: 9 }));
      const padded = parseFrameHeader(buildHeader({ bitrateIndex: 9, padding: 1 }));

      expect(unpadded?.frameLengthBytes).toBe(417);
      expect(padded?.frameLengthBytes).toBe(418);
      expect(padded?.hasPadding).toBe(true);
    });
  });

  describe('channel mode', () => {
    it.each([
      [0b00, 'stereo'],
      [0b01, 'joint-stereo'],
      [0b10, 'dual-channel'],
      [0b11, 'mono'],
    ])('reads bits %i as %s', (bits, expected) => {
      expect(parseFrameHeader(buildHeader({ channelMode: bits }))?.channelMode).toBe(expected);
    });
  });

  describe('rejection', () => {
    it.each([
      ['an incomplete sync word', { sync: 0x7fe }],
      ['MPEG Version 2.5', { version: 0b00 }],
      ['a reserved version', { version: 0b01 }],
      ['MPEG Version 2', { version: 0b10 }],
      ['a reserved layer', { layer: 0b00 }],
      ['Layer II', { layer: 0b10 }],
      ['Layer I', { layer: 0b11 }],
      ['a free-format bitrate', { bitrateIndex: 0 }],
      ['a reserved bitrate index', { bitrateIndex: 15 }],
      ['a reserved sample-rate index', { sampleRateIndex: 3 }],
    ])('returns null for %s', (_case, fields: HeaderFields) => {
      expect(parseFrameHeader(buildHeader(fields))).toBeNull();
    });

    it('accepts a header regardless of the CRC protection bit', () => {
      expect(parseFrameHeader(buildHeader({ protection: 0 }))).not.toBeNull();
      expect(parseFrameHeader(buildHeader({ protection: 1 }))).not.toBeNull();
    });
  });

  describe('bounds', () => {
    it('returns null when fewer than four bytes remain', () => {
      expect(parseFrameHeader(buildHeader().subarray(0, 3))).toBeNull();
      expect(parseFrameHeader(Buffer.alloc(0))).toBeNull();
    });

    it('returns null for an offset past the end of the buffer', () => {
      const bytes = Buffer.concat([Buffer.alloc(2), buildHeader()]);

      expect(parseFrameHeader(bytes, 3)).toBeNull();
      expect(parseFrameHeader(bytes, bytes.length)).toBeNull();
    });

    it('returns null for a negative offset', () => {
      expect(parseFrameHeader(buildHeader(), -1)).toBeNull();
    });

    it('parses a header embedded at an offset', () => {
      const bytes = Buffer.concat([Buffer.from([0x00, 0xff, 0x00]), buildHeader()]);

      expect(parseFrameHeader(bytes, 3)?.bitrateKbps).toBe(64);
    });
  });
});
