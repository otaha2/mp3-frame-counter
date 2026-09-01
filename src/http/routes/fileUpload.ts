/**
 * `POST /file-upload` — accepts one MP3 upload and reports its frame count.
 *
 * The MP3 may arrive either as a multipart file part or as the raw request
 * body, since clients differ in how they send a binary payload.
 *
 * The handler never sets a status code: it throws a typed error from
 * `../errors` and lets the single error handler render it.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Config } from '../../config';
import { countFrames } from '../../mp3/countFrames';
import { FileTooLargeError, NoFileUploadedError, NoFramesFoundError } from '../errors';

/**
 * Field name used in the documentation and examples. The route accepts a file
 * part under any name; this is what error messages suggest.
 */
export const FILE_FIELD_NAME = 'file';

/** Successful response body. */
export interface FrameCountResponse {
  readonly frameCount: number;
}

/** Reads the single file part of a multipart request. */
async function readMultipartFile(request: FastifyRequest, config: Config): Promise<Buffer> {
  const part = await request.file();
  if (part === undefined) {
    throw new NoFileUploadedError(FILE_FIELD_NAME);
  }

  // The part must be read to the end before the response can be sent: busboy
  // will not finish parsing the request while a part stream is still pending.
  // The chunks are kept because the counter reads a complete buffer, making
  // peak memory one upload, bounded by the configured limit. Counting needs no
  // buffer of its own: a frame is decided by its own four-byte header.
  //
  // A readable in binary mode always yields Buffers, but its declared element
  // type is `any`, so it is narrowed here.
  const chunks: Buffer[] = [];
  for await (const chunk of part.file as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }

  // busboy stops reading at the limit rather than buffering the rest, so
  // truncation is reported as a flag once the stream ends.
  if (part.file.truncated) {
    throw new FileTooLargeError(config.maxUploadBytes);
  }

  return Buffer.concat(chunks);
}

/** Registers the upload route on `app`. */
export function registerFileUploadRoute(app: FastifyInstance, config: Config): void {
  app.post('/file-upload', async (request): Promise<FrameCountResponse> => {
    // A non-multipart body arrives as raw bytes from the catch-all parser,
    // which is configured elsewhere — so the type is checked, not assumed.
    const bytes = request.isMultipart() ? await readMultipartFile(request, config) : request.body;

    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      throw new NoFileUploadedError(FILE_FIELD_NAME);
    }

    const { frameCount } = countFrames(bytes);
    if (frameCount === 0) {
      throw new NoFramesFoundError();
    }

    return { frameCount };
  });
}
