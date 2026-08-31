/**
 * `POST /file-upload` — accepts one MP3 upload and reports its frame count.
 *
 * The handler never sets a status code: it throws a typed error from
 * `../errors` and lets the single error handler render it.
 */

import type { FastifyInstance } from 'fastify';
import type { Config } from '../../config';
import { FileTooLargeError, NoFileUploadedError, UnsupportedMediaTypeError } from '../errors';

/** Multipart field name the MP3 is expected under. */
export const FILE_FIELD_NAME = 'file';

/** Successful response body. */
export interface FrameCountResponse {
  readonly frameCount: number;
}

/** Registers the upload route on `app`. */
export function registerFileUploadRoute(app: FastifyInstance, config: Config): void {
  app.post('/file-upload', async (request): Promise<FrameCountResponse> => {
    if (!request.isMultipart()) {
      throw new UnsupportedMediaTypeError(request.headers['content-type']);
    }

    const part = await request.file();
    if (part === undefined) {
      throw new NoFileUploadedError(FILE_FIELD_NAME);
    }

    // The part stream must be consumed to completion even when its contents
    // are not needed yet: busboy will not finish parsing the request — and the
    // response will not be sent — while a part stream is still pending.
    // Step 4 replaces this drain with the streaming frame counter.
    for await (const _chunk of part.file) {
      // Intentionally empty: bytes are discarded until the counter lands.
    }

    // busboy stops at the limit rather than buffering the rest, so truncation
    // is reported as a flag once the stream ends.
    if (part.file.truncated) {
      throw new FileTooLargeError(config.maxUploadBytes);
    }

    return { frameCount: 0 };
  });
}
