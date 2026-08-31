/** Builders for synthetic MP3 byte streams used by the counter tests. */

interface FrameOptions {
  /** 1-14; 9 is 128 kbps, which gives a 417-byte frame at 44.1 kHz. */
  readonly bitrateIndex?: number;
  /** 0 = 44100, 1 = 48000, 2 = 32000. */
  readonly sampleRateIndex?: number;
  readonly padding?: 0 | 1;
  /** 0 stereo, 1 joint stereo, 2 dual channel, 3 mono. */
  readonly channelMode?: number;
  /** Bytes written into the payload after the 4-byte header. */
  readonly payloadFill?: number;
}

const BITRATE_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const SAMPLE_RATE_HZ = [44100, 48000, 32000];

/** Length in bytes of the frame `frame()` would build with these options. */
export function frameLength(options: FrameOptions = {}): number {
  const { bitrateIndex = 9, sampleRateIndex = 0, padding = 0 } = options;
  const kbps = BITRATE_KBPS[bitrateIndex] ?? 0;
  const hz = SAMPLE_RATE_HZ[sampleRateIndex] ?? 44100;
  return Math.floor((144 * kbps * 1000) / hz) + padding;
}

/** A complete, structurally valid MPEG-1 Layer III frame. */
export function frame(options: FrameOptions = {}): Buffer {
  const {
    bitrateIndex = 9,
    sampleRateIndex = 0,
    padding = 0,
    channelMode = 1,
    payloadFill = 0x00,
  } = options;

  const header =
    ((0x7ff << 21) |
      (0b11 << 19) |
      (0b01 << 17) |
      (0b1 << 16) |
      (bitrateIndex << 12) |
      (sampleRateIndex << 10) |
      (padding << 9) |
      (channelMode << 6)) >>>
    0;

  const bytes = Buffer.alloc(frameLength(options), payloadFill);
  bytes.writeUInt32BE(header);
  return bytes;
}

/** A frame carrying a metadata marker at the offset its channel mode implies. */
export function metadataFrame(marker: 'Xing' | 'Info' | 'VBRI', channelMode = 1): Buffer {
  const bytes = frame({ channelMode });
  const sideInfo = marker === 'VBRI' ? 32 : channelMode === 3 ? 17 : 32;
  bytes.write(marker, 4 + sideInfo, 'latin1');
  return bytes;
}

/** An ID3v2 tag wrapping `body`, with the syncsafe size field it requires. */
export function id3v2Tag(body: Buffer, options: { footer?: boolean } = {}): Buffer {
  const footer = options.footer ?? false;
  const header = Buffer.alloc(10);
  header.write('ID3', 0, 'latin1');
  header[3] = 4; // version 2.4
  header[5] = footer ? 0x10 : 0x00;

  const size = body.length;
  header[6] = (size >>> 21) & 0x7f;
  header[7] = (size >>> 14) & 0x7f;
  header[8] = (size >>> 7) & 0x7f;
  header[9] = size & 0x7f;

  return Buffer.concat([header, body, footer ? Buffer.alloc(10) : Buffer.alloc(0)]);
}

/** A 128-byte ID3v1 tag, optionally filled with bytes that mimic a sync word. */
export function id3v1Tag(fill = 0x00): Buffer {
  const tag = Buffer.alloc(128, fill);
  tag.write('TAG', 0, 'latin1');
  return tag;
}
