/**
 * Counting MPEG-1 Layer III frames in a complete buffer.
 *
 * A convenience over {@link FrameCounter} for callers that already hold the
 * whole file. The counting rules live in that class alone, so a buffer and a
 * stream of chunks cannot drift apart.
 */

import { FrameCounter, type FrameCountResult } from './frameCounter';

export type { FrameCountResult };

/** Counts the frames in a complete MP3 file. */
export function countFrames(bytes: Buffer): FrameCountResult {
  const counter = new FrameCounter();
  counter.update(bytes);
  return counter.end();
}
