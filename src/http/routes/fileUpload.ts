/**
 * `POST /file-upload` — accepts one MP3 upload and reports its frame count.
 *
 * The MP3 may arrive either as a multipart file part or as the raw request
 * body, since clients differ in how they send a binary payload. Either way the
 * bytes are counted as they arrive and never assembled, so memory does not
 * grow with the size of the upload.
 *
 * The handler never sets a status code: it throws a typed error from
 * `../errors` and lets the single error handler render it.
 */

import type { Readable } from 'node:stream';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Config } from '../../config';
import { FrameCounter } from '../../mp3/frameCounter';
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

/** What reading an upload to its end established. */
interface UploadOutcome {
  readonly frameCount: number;
  readonly bytesRead: number;
}

/**
 * Counts the frames in a stream, refusing one that outgrows the limit.
 *
 * A readable in binary mode always yields Buffers, but its declared element
 * type is `any`, so the source is narrowed here.
 */
async function countStream(source: Readable, maxBytes: number): Promise<UploadOutcome> {
  const counter = new FrameCounter();
  let bytesRead = 0;

  for await (const chunk of source as AsyncIterable<Buffer>) {
    bytesRead += chunk.length;
    if (bytesRead > maxBytes) {
      throw new FileTooLargeError(maxBytes);
    }
    counter.update(chunk);
  }

  return { frameCount: counter.end().frameCount, bytesRead };
}

/** Reads the single file part of a multipart request. */
async function countMultipartFile(request: FastifyRequest, config: Config): Promise<UploadOutcome> {
  const part = await request.file();
  if (part === undefined) {
    throw new NoFileUploadedError(FILE_FIELD_NAME);
  }

  // The part must be read to the end before the response can be sent: busboy
  // will not finish parsing the request while a part stream is still pending.
  const outcome = await countStream(part.file, config.maxUploadBytes);

  // busboy stops reading at its own limit rather than overrunning it, so an
  // oversized part ends early and is only recognised once the stream is done.
  if (part.file.truncated) {
    throw new FileTooLargeError(config.maxUploadBytes);
  }

  return outcome;
}

/** Registers the upload route on `app`. */
export function registerFileUploadRoute(app: FastifyInstance, config: Config): void {
  app.post('/file-upload', async (request): Promise<FrameCountResponse> => {
    // A non-multipart body is left unparsed so that it can be read here as it
    // arrives, rather than being buffered first.
    const { frameCount, bytesRead } = request.isMultipart()
      ? await countMultipartFile(request, config)
      : await countStream(request.raw, config.maxUploadBytes);

    if (bytesRead === 0) {
      throw new NoFileUploadedError(FILE_FIELD_NAME);
    }

    if (frameCount === 0) {
      throw new NoFramesFoundError();
    }

    return { frameCount };
  });
}
