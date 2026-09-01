/**
 * Detection of the Xing / Info / VBRI metadata frame.
 *
 * The frame's shape and why it is excluded from the count are documented in
 * `docs/concepts/mp3-structure.html` and `docs/decisions.md` D1.
 *
 * Such a frame is a structurally valid MPEG frame whose payload holds encoder
 * metadata instead of audio. Only its marker is read here; its stored counts
 * are deliberately not trusted as the answer.
 */

import { HEADER_BYTES, type FrameHeader } from './frameHeader';

/**
 * Bytes of side information between the header and the payload, which is where
 * a Xing or Info marker sits. MPEG-1 uses a smaller block for a single channel.
 */
const SIDE_INFO_BYTES_MONO = 17;
const SIDE_INFO_BYTES_MULTI = 32;

/** VBRI is written by the Fraunhofer encoder at a fixed offset instead. */
const VBRI_OFFSET_BYTES = 32;

const XING_MARKER = 'Xing';
const INFO_MARKER = 'Info';
const VBRI_MARKER = 'VBRI';
const MARKER_BYTES = 4;

function markerAt(bytes: Buffer, offset: number): string | null {
  if (offset < 0 || offset + MARKER_BYTES > bytes.length) return null;
  return bytes.subarray(offset, offset + MARKER_BYTES).toString('latin1');
}

/**
 * Whether the frame at `frameOffset` is a metadata frame rather than audio.
 *
 * @param header - the already-parsed header of that frame; its channel mode
 * decides where the Xing or Info marker would be.
 */
export function isVbrMetadataFrame(
  bytes: Buffer,
  frameOffset: number,
  header: FrameHeader,
): boolean {
  const sideInfoBytes =
    header.channelMode === 'mono' ? SIDE_INFO_BYTES_MONO : SIDE_INFO_BYTES_MULTI;

  const xingMarker = markerAt(bytes, frameOffset + HEADER_BYTES + sideInfoBytes);
  if (xingMarker === XING_MARKER || xingMarker === INFO_MARKER) return true;

  return markerAt(bytes, frameOffset + HEADER_BYTES + VBRI_OFFSET_BYTES) === VBRI_MARKER;
}
