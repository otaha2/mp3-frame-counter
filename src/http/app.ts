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
import { ApiError, ErrorCode, UnsupportedMediaTypeError } from './errors';
import { registerFileUploadRoute } from './routes/fileUpload';

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
  const app = Fastify(options);

  // This API accepts exactly one body format. Dropping the built-in JSON and
  // text parsers means any other Content-Type reaches the catch-all below and
  // gets an actionable 415 instead of Fastify's bare "Unsupported Media Type".
  app.removeAllContentTypeParsers();

  void app.register(multipart, {
    limits: {
      fileSize: config.maxUploadBytes,
      files: 1,
    },
  });

  // Catches every Content-Type except multipart/form-data. A request with no
  // Content-Type header at all never reaches a parser, so the route guards
  // that case itself; the two checks together cover every non-multipart body.
  app.addContentTypeParser('*', (request, _payload, done) => {
    done(new UnsupportedMediaTypeError(request.headers['content-type']), undefined);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ApiError) {
      return reply
        .status(error.statusCode)
        .send(errorBody(error.statusCode, error.code, error.message));
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
