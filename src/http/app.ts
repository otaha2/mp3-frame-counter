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
import { ApiError, ErrorCode } from './errors';
import { registerFileUploadRoute } from './routes/fileUpload';

/** Methods checked when deciding whether a path exists under another verb. */
const ROUTABLE_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

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

/** Fallback `code` for a framework error that carries none, from its status name. */
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

  // The built-in JSON and text parsers would buffer and decode a body this
  // service never wants decoded, so they are replaced by the catch-all below.
  app.removeAllContentTypeParsers();

  // One file per request: this endpoint counts one MP3, and declaring the
  // limit here keeps the route from having to police it.
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
  // — and the bytes themselves settle whether this is an MP3.
  //
  // The body is deliberately left unread here so that the route can count it
  // as it arrives; buffering it first would defeat that.
  app.addContentTypeParser('*', (_request, _payload, done) => {
    done(null, undefined);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ApiError) {
      // A client error that wraps something else keeps that cause out of the
      // response but not out of the logs, so a defect misreported as a client
      // mistake can still be found.
      if (error.cause !== undefined) {
        request.log.warn({ err: error.cause }, 'upload rejected; underlying cause');
      }

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

  // Fastify renders a missing route through its own handler, which would
  // otherwise be the one response in this API without a `code`. A known path
  // reached by the wrong method is answered 405 rather than 404, since the
  // resource exists and only the method is wrong.
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? request.url;
    const allowed = ROUTABLE_METHODS.filter((method) => app.hasRoute({ method, url: path }));

    if (allowed.length > 0) {
      return reply
        .status(405)
        .header('Allow', allowed.join(', '))
        .send(
          errorBody(
            405,
            ErrorCode.MethodNotAllowed,
            `${request.method} is not supported for ${path}. Use ${allowed.join(' or ')}.`,
          ),
        );
    }

    return reply
      .status(404)
      .send(errorBody(404, ErrorCode.RouteNotFound, `No route exists for ${path}.`));
  });

  registerFileUploadRoute(app, config);

  return app;
}
