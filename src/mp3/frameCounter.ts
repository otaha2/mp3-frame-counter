/**
 * Incremental frame counting over a stream of chunks.
 *
 * Bytes arrive in arbitrary pieces, so a frame header may be split across two
 * of them and a frame may span many. The counter therefore holds only what it
 * cannot yet decide: at most one frame while it is looking for the start of
 * the stream, and the trailing bytes that may prove to be an ID3v1 tag.
 * Everything else is consumed by arithmetic — a frame declares its own length,
 * so its remaining bytes are counted off without being kept.
 */

import { HEADER_BYTES, parseFrameHeader, type FrameHeader } from './frameHeader';
import { ID3V1_TAG_BYTES, ID3V2_HEADER_BYTES, hasId3v1Tag, id3v2TagSizeBytes } from './tags';
import { isVbrMetadataFrame } from './vbrHeader';

/** The outcome of counting a stream. */
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
  /**
   * Bytes passed over while searching for sync. Zero for a well-formed single
   * file; non-zero also for anything legal this parser does not model, such as
   * a tag appearing part-way through a stream.
   */
  readonly resyncedBytes: number;
}

/** What the counter decided about a header it managed to parse. */
type Verdict = 'accept' | 'reject' | 'wait';

/**
 * Counts frames as bytes arrive.
 *
 * Feed chunks with {@link update} in order, then call {@link end} once. The
 * result depends only on the bytes, never on how they were divided.
 */
export class FrameCounter {
  /** Bytes received but not yet decided upon. */
  private pending: Buffer = Buffer.alloc(0);

  /** Bytes still to be consumed without inspection: a tag body or a frame. */
  private skipRemaining = 0;

  /**
   * Whether the bytes being skipped are a frame, and if so whether it carries
   * encoder metadata. Null while skipping a tag body, which completes no
   * frame.
   */
  private skippedFrameIsMetadata: boolean | null = null;

  /** Whether the previous frame ended where this one begins. */
  private inSync = false;

  /** Whether the leading ID3v2 tag has been measured. */
  private tagMeasured = false;

  private ended = false;
  private physicalFrames = 0;
  private metadataFrames = 0;
  private resyncedBytes = 0;

  /** Accepts the next chunk of the stream. */
  update(chunk: Buffer): void {
    if (this.ended) throw new Error('FrameCounter.update called after end');
    if (chunk.length === 0) return;

    // Adopting the chunk outright avoids a copy whenever the previous one was
    // fully consumed, which is the common case while skipping a frame.
    this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);
    this.consume();
  }

  /** Marks the end of the stream and returns the count. */
  end(): FrameCountResult {
    if (this.ended) throw new Error('FrameCounter.end called twice');

    // Only now is it possible to know which bytes are the last 128, and so
    // whether they are an ID3v1 tag rather than audio.
    if (hasId3v1Tag(this.pending)) {
      this.pending = this.pending.subarray(0, this.pending.length - ID3V1_TAG_BYTES);
    }

    this.ended = true;
    this.consume();

    return {
      frameCount: this.physicalFrames - this.metadataFrames,
      physicalFrames: this.physicalFrames,
      hasVbrMetadataFrame: this.metadataFrames > 0,
      resyncedBytes: this.resyncedBytes,
    };
  }

  /**
   * How far into `pending` it is safe to read.
   *
   * Until the stream ends the final 128 bytes are withheld, because they may
   * be an ID3v1 tag and must not be scanned as audio. Nothing beyond this
   * point is read, so a header is never assembled from withheld bytes.
   */
  private get limit(): number {
    return this.ended ? this.pending.length : this.pending.length - ID3V1_TAG_BYTES;
  }

  private consume(): void {
    const limit = this.limit;
    if (limit <= 0) return;
    if (!this.measureLeadingTag(limit)) return;

    let offset = 0;
    while (offset < limit) {
      if (this.skipRemaining > 0) {
        offset = this.skip(offset, limit);
        continue;
      }

      if (limit - offset < HEADER_BYTES) break; // undecidable until more arrives

      const header = parseFrameHeader(this.pending, offset);
      if (header === null) {
        offset = this.resync(offset);
        continue;
      }

      const verdict = this.judge(header, offset, limit);
      if (verdict === 'wait') break;
      if (verdict === 'reject') {
        offset = this.resync(offset);
        continue;
      }

      this.beginFrame(header, offset);
    }

    this.pending = offset === 0 ? this.pending : this.pending.subarray(offset);
  }

  /**
   * Measures a leading ID3v2 tag, once its 10-byte header has arrived.
   *
   * @returns whether counting may proceed; false asks for more bytes.
   */
  private measureLeadingTag(limit: number): boolean {
    if (this.tagMeasured) return true;
    if (limit < ID3V2_HEADER_BYTES && !this.ended) return false;

    this.skipRemaining = id3v2TagSizeBytes(this.pending);
    this.skippedFrameIsMetadata = null;
    this.tagMeasured = true;
    return true;
  }

  /** Consumes as much of the current skip as the available bytes allow. */
  private skip(offset: number, limit: number): number {
    const taken = Math.min(this.skipRemaining, limit - offset);
    this.skipRemaining -= taken;

    if (this.skipRemaining === 0 && this.skippedFrameIsMetadata !== null) {
      this.physicalFrames += 1;
      if (this.skippedFrameIsMetadata) this.metadataFrames += 1;
      this.skippedFrameIsMetadata = null;
      this.inSync = true;
    }

    return offset + taken;
  }

  private resync(offset: number): number {
    this.inSync = false;
    this.resyncedBytes += 1;
    return offset + 1;
  }

  /**
   * Decides whether a parsed header really begins a frame.
   *
   * While in sync the chain itself is the evidence. Otherwise a second header
   * must sit exactly one frame later, since a lone sync word occurs readily in
   * audio payload and in unrelated binary data.
   */
  private judge(header: FrameHeader, offset: number, limit: number): Verdict {
    if (this.inSync) return 'accept';

    const nextOffset = offset + header.frameLengthBytes;
    if (nextOffset + HEADER_BYTES <= limit) {
      return parseFrameHeader(this.pending, nextOffset) === null ? 'reject' : 'accept';
    }

    // Not enough bytes to look ahead; more may still arrive.
    if (!this.ended) return 'wait';

    // The stream is over: a frame that fits exactly has nothing to confirm it
    // and is accepted, while one running past the end was never complete.
    return nextOffset <= limit ? 'accept' : 'reject';
  }

  /** Starts consuming an accepted frame's bytes. */
  private beginFrame(header: FrameHeader, offset: number): void {
    this.skipRemaining = header.frameLengthBytes;

    // Only the frame opening the stream carries encoder metadata; the same
    // marker later on is audio payload.
    this.skippedFrameIsMetadata =
      this.physicalFrames === 0 && isVbrMetadataFrame(this.pending, offset, header);
  }
}
