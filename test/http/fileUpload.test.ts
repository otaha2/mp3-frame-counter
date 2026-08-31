/**
 * HTTP-layer tests: the request/response contract of `POST /file-upload`.
 *
 * These exercise routing, multipart handling and error rendering only. Frame
 * counting is verified independently in the `test/mp3` suites, so a wrong
 * answer points at exactly one layer.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp, type ErrorBody } from '../../src/http/app';
import type { Config } from '../../src/config';
import { FILE_FIELD_NAME, type FrameCountResponse } from '../../src/http/routes/fileUpload';
import { multipartFile, multipartWithoutFile } from '../helpers/multipart';

const SAMPLE_PATH = join(__dirname, '..', 'fixtures', 'sample.mp3');

const testConfig: Config = {
  port: 0,
  host: '127.0.0.1',
  maxUploadBytes: 200 * 1024 * 1024,
};

function build(overrides: Partial<Config> = {}): FastifyInstance {
  return buildApp({ ...testConfig, ...overrides }, { logger: false });
}

describe('POST /file-upload', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('accepts an MP3 upload and answers with a frame count', async () => {
    app = build();
    const sample = readFileSync(SAMPLE_PATH);

    const response = await app.inject({
      method: 'POST',
      url: '/file-upload',
      ...multipartFile(FILE_FIELD_NAME, 'sample.mp3', sample),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');

    const body = response.json<FrameCountResponse>();
    expect(Object.keys(body)).toEqual(['frameCount']);
    expect(typeof body.frameCount).toBe('number');
  });

  it('rejects a multipart request that carries no file', async () => {
    app = build();

    const response = await app.inject({
      method: 'POST',
      url: '/file-upload',
      ...multipartWithoutFile('note', 'no file here'),
    });

    expect(response.statusCode).toBe(400);

    const body = response.json<ErrorBody>();
    expect(body).toMatchObject({
      statusCode: 400,
      code: 'NO_FILE_UPLOADED',
      error: 'Bad Request',
    });
    expect(body.message).toContain(FILE_FIELD_NAME);
  });

  it('rejects an upload larger than the configured limit', async () => {
    app = build({ maxUploadBytes: 1024 });

    const response = await app.inject({
      method: 'POST',
      url: '/file-upload',
      ...multipartFile(FILE_FIELD_NAME, 'big.mp3', Buffer.alloc(4096, 0x41)),
    });

    expect(response.statusCode).toBe(413);

    const body = response.json<ErrorBody>();
    expect(body).toMatchObject({
      statusCode: 413,
      code: 'FILE_TOO_LARGE',
      error: 'Payload Too Large',
    });
    expect(body.message).toContain('1024');
  });

  it.each([
    ['application/json', '{"file":"x"}'],
    ['text/plain', 'plain text'],
    ['application/octet-stream', 'raw bytes'],
  ])('rejects a %s body as unsupported media', async (contentType, payload) => {
    app = build();

    const response = await app.inject({
      method: 'POST',
      url: '/file-upload',
      headers: { 'content-type': contentType },
      payload,
    });

    expect(response.statusCode).toBe(415);

    const body = response.json<ErrorBody>();
    expect(body).toMatchObject({
      statusCode: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      error: 'Unsupported Media Type',
    });
    expect(body.message).toContain(contentType);
  });

  it('answers 404 in the standard error shape for an unknown route', async () => {
    app = build();

    const response = await app.inject({ method: 'POST', url: '/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
  });
});
