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
  UnreadableUpload: 'UNREADABLE_UPLOAD',
  FileTooLarge: 'FILE_TOO_LARGE',
  NoFramesFound: 'NO_FRAMES_FOUND',
  RouteNotFound: 'ROUTE_NOT_FOUND',
  MethodNotAllowed: 'METHOD_NOT_ALLOWED',
  Internal: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Base class for every failure this API reports deliberately. */
export abstract class ApiError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: ErrorCode;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The request carried no bytes to count. */
export class NoFileUploadedError extends ApiError {
  readonly statusCode = 400;
  readonly code = ErrorCode.NoFileUploaded;

  /** @param exampleFieldName - suggested field name; any name is accepted. */
  constructor(exampleFieldName: string) {
    super(
      `No file was uploaded. Send the MP3 as the request body, or as a multipart file part — any field name is accepted, for example "${exampleFieldName}".`,
    );
  }
}

/**
 * Bytes were received but contained no frames of the supported format.
 *
 * Reported rather than answering zero: a count of zero would suggest a valid
 * but empty MP3, when the likely cause is a file of another kind.
 */
export class NoFramesFoundError extends ApiError {
  readonly statusCode = 400;
  readonly code = ErrorCode.NoFramesFound;

  constructor() {
    super(
      'No MPEG Version 1 Layer III frames were found. The upload does not appear to be an MP3 file of that format.',
    );
  }
}

/**
 * The multipart body could not be read to the end.
 *
 * Covers a body with no boundary, a truncated one, and a second file part
 * arriving where only one is accepted — busboy reports these as stream
 * failures carrying no status, and all of them mean the caller sent something
 * this endpoint cannot read.
 */
export class UnreadableUploadError extends ApiError {
  readonly statusCode = 400;
  readonly code = ErrorCode.UnreadableUpload;

  /**
   * @param cause - the underlying stream failure, kept so that a defect
   * misclassified as a client error is still visible in the logs.
   */
  constructor(cause?: unknown) {
    super(
      'The upload could not be read. Send exactly one file in a well-formed multipart/form-data body, or the MP3 as the raw request body.',
      { cause },
    );
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
