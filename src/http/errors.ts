/**
 * Typed errors for the HTTP layer.
 *
 * Route handlers throw these; they never set a status code themselves. The
 * single error handler in `app.ts` turns them into the wire format. Fastify
 * serialises a thrown error's `statusCode` and `code` natively, so these
 * classes opt into the framework's convention rather than inventing one.
 */

/** Machine-readable discriminators sent as the `code` field. */
export const ErrorCode = {
  NoFileUploaded: 'NO_FILE_UPLOADED',
  FileTooLarge: 'FILE_TOO_LARGE',
  UnsupportedMediaType: 'UNSUPPORTED_MEDIA_TYPE',
  Internal: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Base class for every failure this API reports deliberately. */
export abstract class ApiError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: ErrorCode;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The request was multipart but carried no file part. */
export class NoFileUploadedError extends ApiError {
  readonly statusCode = 400;
  readonly code = ErrorCode.NoFileUploaded;

  constructor(fieldName: string) {
    super(`No file was uploaded. Send the MP3 as a multipart field named "${fieldName}".`);
  }
}

/** The upload exceeded the configured size limit. */
export class FileTooLargeError extends ApiError {
  readonly statusCode = 413;
  readonly code = ErrorCode.FileTooLarge;

  constructor(maxBytes: number) {
    super(`Uploaded file exceeds the maximum size of ${maxBytes} bytes.`);
  }
}

/** The request body was not a multipart/form-data upload. */
export class UnsupportedMediaTypeError extends ApiError {
  readonly statusCode = 415;
  readonly code = ErrorCode.UnsupportedMediaType;

  constructor(received: string | undefined) {
    const got = received === undefined || received === '' ? 'none' : received;
    super(`Expected Content-Type "multipart/form-data", received ${got}.`);
  }
}
