/**
 * Application wiring: plugins, the single error handler, and route
 * registration. Kept separate from `index.ts` so tests can build an app and
 * drive it with `app.inject()` without opening a socket.
 */

import { STATUS_CODES } from 'node:http';
import multipart from '@fastify/multipart';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import type { Config } from '../config';
import { ApiError, ErrorCode, FileTooLargeError } from './errors';
import { registerFileUploadRoute } from './routes/fileUpload';

/** Fastify's code for a raw body that exceeded `bodyLimit`. */
const FASTIFY_BODY_TOO_LARGE = 'FST_ERR_CTP_BODY_TOO_LARGE';

/** The JSON body returned for every failure. Mirrors Fastify's own shape. */
export interface ErrorBody {
  readonly statusCode: number;
  readonly code: string;
  readonly error: string;
  readonly message: string;
}

function statusText(statusCode: number): string {
  return STATUS_CODES[statusCode] ?? 'Error';
}

function errorBody(statusCode: number, code: string, message: string): ErrorBody {
  return { statusCode, code, error: statusText(statusCode), message };
}

/** Fallback `code` for a framework error that carries none: `PAYLOAD_TOO_LARGE`. */
function codeFromStatus(statusCode: number): string {
  return statusText(statusCode).toUpperCase().replace(/\s+/g, '_');
}

/**
 * Builds a configured, un-started Fastify instance.
 *
 * @param config - resolved settings; the caller owns environment access.
 * @param options - Fastify options, used by tests to silence logging.
 */
export function buildApp(config: Config, options: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify({
    // Applies to a raw body; the multipart plugin enforces its own file limit.
    bodyLimit: config.maxUploadBytes,
    ...options,
  });

  // The built-in JSON and text parsers would decode a body this service never
  // wants decoded, so they are replaced by the catch-all below.
  app.removeAllContentTypeParsers();

  void app.register(multipart, {
    limits: {
      fileSize: config.maxUploadBytes,
      files: 1,
    },
  });

  // An MP3 may be sent either as a multipart file part or as the raw request
  // body. Everything that is not multipart is taken as raw bytes, whatever the
  // Content-Type claims: clients are inconsistent about labelling a binary
  // body — curl's --data-binary defaults to application/x-www-form-urlencoded
  // — and the bytes themselves settle whether this is an MP3. A body that does
  // not parse as MPEG-1 Layer III is reported as such by the route.
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    // An oversized raw body is rejected by Fastify and an oversized part by
    // busboy; to a client they are one condition, so they report as one.
    const failure =
      error.code === FASTIFY_BODY_TOO_LARGE ? new FileTooLargeError(config.maxUploadBytes) : error;

    if (failure instanceof ApiError) {
      return reply
        .status(failure.statusCode)
        .send(errorBody(failure.statusCode, failure.code, failure.message));
    }

    // Errors raised by Fastify or its plugins already carry a status; a
    // client-side one describes the caller's own mistake and is safe to relay.
    const statusCode = error.statusCode ?? 500;
    if (statusCode < 500) {
      return reply
        .status(statusCode)
        .send(errorBody(statusCode, error.code ?? codeFromStatus(statusCode), error.message));
    }

    // Never echo an unexpected failure to the client: it may name internal
    // paths or dependencies. Log it server-side, return nothing specific.
    request.log.error({ err: error }, 'unhandled error while serving request');
    return reply
      .status(500)
      .send(errorBody(500, ErrorCode.Internal, 'An unexpected error occurred.'));
  });

  registerFileUploadRoute(app, config);

  return app;
}
