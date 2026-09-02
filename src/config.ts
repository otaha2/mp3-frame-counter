/**
 * Runtime configuration, read from the environment.
 *
 * This is the only module that touches `process.env`; everything else receives
 * a `Config` so that tests can construct an app without mutating globals.
 */

/**
 * Default cap on a single uploaded file: 512 MiB, which is about nine hours of
 * 128 kbps audio or nearly four at 320.
 *
 * This is a policy limit, not a memory ceiling. The upload is counted as it
 * arrives, so memory does not depend on it; the cap bounds how long one request
 * may hold a connection and refuses a client early rather than after it has
 * sent gigabytes. It is set from the length of a plausible single MP3 — a
 * two-hour set at 320 kbps is already 275 MiB — so that no real file is turned
 * away for a limit that protects nothing. A deployment that cares more about
 * connection time than file length should lower it.
 */
const DEFAULT_MAX_UPLOAD_BYTES = 512 * 1024 * 1024;
const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '0.0.0.0';

/** Resolved settings for one running instance of the service. */
export interface Config {
  readonly port: number;
  readonly host: string;
  /** Uploads larger than this are rejected with 413 rather than buffered. */
  readonly maxUploadBytes: number;
}

/**
 * Reads a positive integer from `env`.
 *
 * Throws rather than silently falling back: a mistyped limit that quietly
 * becomes the default is worse than a service that refuses to start.
 */
function readPositiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, received "${raw}"`);
  }
  return value;
}

/** Builds the configuration for this process. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: readPositiveInt(env, 'PORT', DEFAULT_PORT),
    host: env.HOST ?? DEFAULT_HOST,
    maxUploadBytes: readPositiveInt(env, 'MAX_UPLOAD_BYTES', DEFAULT_MAX_UPLOAD_BYTES),
  };
}
