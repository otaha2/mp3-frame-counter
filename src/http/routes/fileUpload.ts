/**
 * `POST /file-upload` — accepts one MP3 upload and reports its frame count.
 *
 * The handler never sets a status code: it throws a typed error from
 * `../errors` and lets the single error handler render it.
 */

import type { FastifyInstance } from 'fastify';
import type { Config } from '../../config';
import { countFrames } from '../../mp3/countFrames';
import { FileTooLargeError, NoFileUploadedError, UnsupportedMediaTypeError } from '../errors';

/**
 * Field name used in the documentation and examples. The route accepts a file
 * part under any name; this is what error messages suggest.
 */
export const FILE_FIELD_NAME = 'file';

/** Successful response body. */
export interface FrameCountResponse {
  readonly frameCount: number;
}

/** Registers the upload route on `app`. */
export function registerFileUploadRoute(app: FastifyInstance, config: Config): void {
  app.post('/file-upload', async (request): Promise<FrameCountResponse> => {
    // Reached only when the request carries no Content-Type: Fastify skips
    // body parsing entirely, so the catch-all parser in `app.ts` never runs.
    if (!request.isMultipart()) {
      throw new UnsupportedMediaTypeError(request.headers['content-type']);
    }

    const part = await request.file();
    if (part === undefined) {
      throw new NoFileUploadedError(FILE_FIELD_NAME);
    }

    // The part must be read to the end before the response can be sent:
    // busboy will not finish parsing the request while a part stream is
    // still pending.
    //
    // The counter reads a complete buffer, so the chunks are collected rather
    // than measured as they arrive. Peak memory is one upload, bounded by the
    // configured limit; counting itself needs no buffer, since a frame is
    // decided by its own four-byte header.
    // The part stream is a Node readable in binary mode, which always yields
    // Buffers; its declared element type is `any`, so it is narrowed here.
    const chunks: Buffer[] = [];
    for await (const chunk of part.file as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }

    // busboy stops reading at the limit rather than buffering the rest, so
    // truncation is reported as a flag once the stream ends.
    if (part.file.truncated) {
      throw new FileTooLargeError(config.maxUploadBytes);
    }

    const { frameCount } = countFrames(Buffer.concat(chunks));
    return { frameCount };
  });
}
