/**
 * ID3 tag boundaries.
 *
 * An MP3 file may carry an ID3v2 tag before the frames and an ID3v1 tag after
 * them. Neither is audio, and both contain arbitrary bytes that would be
 * misread as frames if scanned.
 *
 * Tags are never parsed for their content: this module exists only to find
 * where the audio frames begin and end.
 */

/** Fixed size of the ID3v2 header that precedes the tag body. */
const ID3V2_HEADER_BYTES = 10;

/** `ID3v2.4` may append a copy of the header at the end of the tag. */
const ID3V2_FOOTER_BYTES = 10;

/** Bit set in the ID3v2 flags byte when a footer is present. */
const ID3V2_FOOTER_FLAG = 0x10;

/** An ID3v1 tag is always exactly this long and always ends the file. */
const ID3V1_TAG_BYTES = 128;

/** Syncsafe integers use only the low seven bits of each byte. */
const SYNCSAFE_BITS = 7;
const SYNCSAFE_MAX_BYTE = 0x7f;

/** The span of a file that may contain audio frames. */
export interface AudioRegion {
  /** Offset of the first byte that may begin a frame. */
  readonly start: number;
  /** Offset one past the last byte available to frames. */
  readonly end: number;
}

/**
 * Total bytes occupied by a leading ID3v2 tag, or 0 if there is none.
 *
 * The size is stored syncsafe — four bytes of seven bits each — precisely so
 * that no byte of the tag can be mistaken for the 0xFF of a frame sync word.
 * A size byte with its high bit set means the field is malformed, so the tag
 * is not trusted and the file is scanned from the start instead.
 */
export function id3v2TagSizeBytes(bytes: Buffer): number {
  if (bytes.length < ID3V2_HEADER_BYTES) return 0;
  if (bytes.subarray(0, 3).toString('latin1') !== 'ID3') return 0;

  const sizeBytes = [bytes[6], bytes[7], bytes[8], bytes[9]];
  let size = 0;
  for (const byte of sizeBytes) {
    if (byte === undefined || byte > SYNCSAFE_MAX_BYTE) return 0;
    size = (size << SYNCSAFE_BITS) | byte;
  }

  const flags = bytes[5] ?? 0;
  const footer = (flags & ID3V2_FOOTER_FLAG) === 0 ? 0 : ID3V2_FOOTER_BYTES;
  return ID3V2_HEADER_BYTES + size + footer;
}

/** Whether the file ends with a 128-byte ID3v1 tag. */
export function hasId3v1Tag(bytes: Buffer): boolean {
  if (bytes.length < ID3V1_TAG_BYTES) return false;
  const tagStart = bytes.length - ID3V1_TAG_BYTES;
  return bytes.subarray(tagStart, tagStart + 3).toString('latin1') === 'TAG';
}

/**
 * The region of `bytes` between the tags, where frames may be found.
 *
 * A tag that claims to be larger than the file is ignored rather than trusted,
 * which would otherwise produce an empty region and a count of zero.
 */
export function audioRegion(bytes: Buffer): AudioRegion {
  const declaredStart = id3v2TagSizeBytes(bytes);
  const start = declaredStart > bytes.length ? 0 : declaredStart;
  const end = bytes.length - (hasId3v1Tag(bytes) ? ID3V1_TAG_BYTES : 0);

  return { start, end: Math.max(start, end) };
}
