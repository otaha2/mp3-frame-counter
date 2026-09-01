/**
 * Counting MPEG-1 Layer III frames in a complete buffer.
 *
 * The walk, and the rule used to re-establish sync after damage, are
 * documented in `docs/concepts/frame-counting.html`.
 *
 * The rules encoded here define what a frame count means for this service.
 * Any incremental implementation that reads the file in pieces must produce
 * identical results for identical bytes.
 */

import { HEADER_BYTES, parseFrameHeader, type FrameHeader } from './frameHeader';
import { audioRegion } from './tags';
import { isVbrMetadataFrame } from './vbrHeader';

/** The outcome of counting a file. */
export interface FrameCountResult {
  /**
   * Audio frames: the number this API reports. Excludes a Xing/Info/VBRI
   * metadata frame, which is structurally a frame but carries no audio.
   */
  readonly frameCount: number;
  /** Every structurally valid frame found, metadata frame included. */
  readonly physicalFrames: number;
  /** Whether the stream opened with a metadata frame. */
  readonly hasVbrMetadataFrame: boolean;
  /** Bytes discarded while searching for sync; 0 for an undamaged file. */
  readonly resyncedBytes: number;
}

/**
 * Reads the header at `offset` and requires a second header exactly one frame
 * later before believing it.
 *
 * A lone sync word proves very little: 11 set bits followed by plausible field
 * values occur readily in audio payload and in arbitrary binary data. Two
 * headers whose separation matches the length the first one declares is a much
 * stronger signal, and it is what distinguishes a real stream from a file that
 * merely contains 0xFF bytes.
 *
 * @returns the confirmed header, or `null` if this offset does not begin one.
 */
function confirmFrameStart(bytes: Buffer, offset: number, end: number): FrameHeader | null {
  const header = parseFrameHeader(bytes, offset);
  if (header === null) return null;

  const nextOffset = offset + header.frameLengthBytes;
  if (nextOffset > end) return null;

  // The final frame of a file has nothing to confirm it; accept it once its
  // own bytes are all present.
  if (nextOffset + HEADER_BYTES > end) return header;

  return parseFrameHeader(bytes, nextOffset) === null ? null : header;
}

/**
 * Counts the frames in a complete MP3 file.
 *
 * Frames are located by arithmetic rather than by searching: each header
 * declares its own length, so the next header is expected exactly that many
 * bytes later. Scanning is used only to recover after that expectation fails.
 */
export function countFrames(bytes: Buffer): FrameCountResult {
  const { start, end } = audioRegion(bytes);

  let offset = start;
  let physicalFrames = 0;
  let metadataFrames = 0;
  let resyncedBytes = 0;
  let inSync = false;

  while (offset + HEADER_BYTES <= end) {
    // While in sync the chain itself is the evidence, so each landing offset is
    // trusted on its own; after a break, a single header is not enough.
    const header = inSync ? parseFrameHeader(bytes, offset) : confirmFrameStart(bytes, offset, end);

    if (header === null) {
      inSync = false;
      offset += 1;
      resyncedBytes += 1;
      continue;
    }

    // A frame whose declared length runs past the end of the audio region is
    // incomplete. Counting it would report audio the file does not contain.
    if (offset + header.frameLengthBytes > end) break;

    if (physicalFrames === 0 && isVbrMetadataFrame(bytes, offset, header)) {
      metadataFrames += 1;
    }

    physicalFrames += 1;
    offset += header.frameLengthBytes;
    inSync = true;
  }

  return {
    frameCount: physicalFrames - metadataFrames,
    physicalFrames,
    hasVbrMetadataFrame: metadataFrames > 0,
    resyncedBytes,
  };
}
