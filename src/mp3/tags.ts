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
export const ID3V2_HEADER_BYTES = 10;

/** `ID3v2.4` may append a copy of the header at the end of the tag. */
const ID3V2_FOOTER_BYTES = 10;

/** Bit set in the ID3v2 flags byte when a footer is present. */
const ID3V2_FOOTER_FLAG = 0x10;

/** An ID3v1 tag is always exactly this long and always ends the file. */
export const ID3V1_TAG_BYTES = 128;

/** Syncsafe integers use only the low seven bits of each byte. */
const SYNCSAFE_BITS = 7;
const SYNCSAFE_MAX_BYTE = 0x7f;

/**
 * Total bytes occupied by a leading ID3v2 tag, or 0 if there is none.
 *
 * The size is stored syncsafe — four bytes of seven bits each — so that the
 * size field itself can never contain 0xFF and be misread as the start of a
 * frame. The tag body has no such protection and routinely does contain 0xFF,
 * album art being the usual culprit, which is why the tag must be skipped by
 * its declared size rather than scanned. A size byte with its high bit set
 * means the field is malformed, so the tag is not trusted and the file is
 * scanned from the start instead.
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
