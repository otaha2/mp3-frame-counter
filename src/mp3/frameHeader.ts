/**
 * Parsing of the 4-byte MPEG audio frame header.
 *
 * Field layout, accepted values and the frame-length formula are documented in
 * `docs/concepts/mp3-structure.html`.
 *
 * Only MPEG Version 1, Layer III is accepted: every other version and layer is
 * out of scope for this service and is reported as "not a header".
 */

/** Bytes in a frame header. */
export const HEADER_BYTES = 4;

/** Samples carried by one MPEG-1 Layer III frame, fixed by the standard. */
const SAMPLES_PER_FRAME = 1152;

const BITS_PER_BYTE = 8;
const BITS_PER_KILOBIT = 1000;

/**
 * Bytes of frame per bit of bitrate per second — 1152 / 8. The frame-length
 * formula is conventionally written with this constant already folded to 144.
 */
const FRAME_BYTES_PER_BITRATE = SAMPLES_PER_FRAME / BITS_PER_BYTE;

/** Sync word: eleven set bits opening every frame header. */
const SYNC_WORD = 0x7ff;

/** Version field value for MPEG Version 1. */
const MPEG_VERSION_1 = 0b11;

/** Layer field value for Layer III. */
const LAYER_III = 0b01;

/**
 * Bitrate in kbps by index, for MPEG-1 Layer III.
 *
 * Index 0 is "free format" (the bitrate is not declared in the header) and
 * index 15 is reserved. Both are `undefined` here: legal in the wider MPEG
 * specification, but not something this service claims to count.
 */
const BITRATE_KBPS: readonly (number | undefined)[] = [
  undefined,
  32,
  40,
  48,
  56,
  64,
  80,
  96,
  112,
  128,
  160,
  192,
  224,
  256,
  320,
  undefined,
];

/** Sampling rate in Hz by index, for MPEG-1. Index 3 is reserved. */
const SAMPLE_RATE_HZ: readonly (number | undefined)[] = [44100, 48000, 32000, undefined];

/** Channel mode, which determines the size of a frame's side information. */
export type ChannelMode = 'stereo' | 'joint-stereo' | 'dual-channel' | 'mono';

/** A validated MPEG-1 Layer III frame header. */
export interface FrameHeader {
  readonly bitrateKbps: number;
  readonly sampleRateHz: number;
  readonly channelMode: ChannelMode;
  readonly hasPadding: boolean;
  /** Total frame size in bytes, header included: the distance to the next one. */
  readonly frameLengthBytes: number;
}

function channelModeOf(bits: number): ChannelMode {
  switch (bits) {
    case 0b00:
      return 'stereo';
    case 0b01:
      return 'joint-stereo';
    case 0b10:
      return 'dual-channel';
    default:
      // The caller masks to two bits, so the only remaining value is 0b11.
      return 'mono';
  }
}

/**
 * Frame length in bytes: `floor(144 × bitrate / sampleRate) + padding`.
 *
 * A frame holds a fixed number of samples, so its size follows from the
 * bitrate and sampling rate alone. The padding bit adds one byte, which is how
 * an encoder absorbs the remainder when the division is not exact.
 */
function frameLengthBytes(bitrateKbps: number, sampleRateHz: number, hasPadding: boolean): number {
  const bitrateBps = bitrateKbps * BITS_PER_KILOBIT;
  return Math.floor((FRAME_BYTES_PER_BITRATE * bitrateBps) / sampleRateHz) + (hasPadding ? 1 : 0);
}

/**
 * Reads a frame header from `bytes` at `offset`.
 *
 * @returns the parsed header, or `null` if those bytes are not a valid MPEG-1
 * Layer III header — including when fewer than {@link HEADER_BYTES} remain.
 * Callers reading from a stream must therefore buffer four bytes before
 * calling, or a split header would be misread as invalid data.
 */
export function parseFrameHeader(bytes: Buffer, offset = 0): FrameHeader | null {
  if (offset < 0 || offset + HEADER_BYTES > bytes.length) return null;

  const header = bytes.readUInt32BE(offset);

  if (header >>> 21 !== SYNC_WORD) return null;
  if (((header >>> 19) & 0b11) !== MPEG_VERSION_1) return null;
  if (((header >>> 17) & 0b11) !== LAYER_III) return null;

  const bitrateKbps = BITRATE_KBPS[(header >>> 12) & 0b1111];
  if (bitrateKbps === undefined) return null;

  const sampleRateHz = SAMPLE_RATE_HZ[(header >>> 10) & 0b11];
  if (sampleRateHz === undefined) return null;

  const hasPadding = ((header >>> 9) & 0b1) === 1;

  return {
    bitrateKbps,
    sampleRateHz,
    channelMode: channelModeOf((header >>> 6) & 0b11),
    hasPadding,
    frameLengthBytes: frameLengthBytes(bitrateKbps, sampleRateHz, hasPadding),
  };
}
