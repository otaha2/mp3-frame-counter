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
import FormData from 'form-data';
import { multipartFile, multipartWithoutFile } from '../helpers/multipart';

const FIXTURES = join(__dirname, '..', 'fixtures');
const SAMPLE_PATH = join(FIXTURES, 'sample.mp3');

interface ExpectedCounts {
  readonly files: Record<string, { readonly expectedFrameCount: number }>;
  readonly edgeCases: Record<string, { readonly expectedFrameCount: number }>;
}

const groundTruth = JSON.parse(
  readFileSync(join(FIXTURES, 'expected-counts.json'), 'utf8'),
) as ExpectedCounts;

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

  it('answers with the sample’s verified frame count', async () => {
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
    expect(body.frameCount).toBe(groundTruth.files['sample.mp3']?.expectedFrameCount);
  });

  it.each(Object.keys(groundTruth.files))('reports the recorded count for %s', async (name) => {
    app = build();

    const response = await app.inject({
      method: 'POST',
      url: '/file-upload',
      ...multipartFile(FILE_FIELD_NAME, name, readFileSync(join(FIXTURES, name))),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<FrameCountResponse>().frameCount).toBe(
      groundTruth.files[name]?.expectedFrameCount,
    );
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

  it('rejects a multipart upload larger than the configured limit', async () => {
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

  it('rejects a raw body larger than the configured limit with the same error', async () => {
    // Fastify rejects an oversized raw body, busboy an oversized part; both
    // must reach the client as one condition.
    app = build({ maxUploadBytes: 1024 });

    const response = await app.inject({
      method: 'POST',
      url: '/file-upload',
      headers: { 'content-type': 'audio/mpeg' },
      payload: Buffer.alloc(4096, 0x41),
    });

    expect(response.statusCode).toBe(413);
    expect(response.json<ErrorBody>()).toMatchObject({
      statusCode: 413,
      code: 'FILE_TOO_LARGE',
    });
  });

  describe('a raw request body', () => {
    it.each([
      'audio/mpeg',
      'application/octet-stream',
      // curl's --data-binary sends this unless told otherwise, so a plain
      // binary upload must not depend on the client labelling it correctly.
      'application/x-www-form-urlencoded',
    ])('is counted when sent as %s', async (contentType) => {
      app = build();

      const response = await app.inject({
        method: 'POST',
        url: '/file-upload',
        headers: { 'content-type': contentType },
        payload: readFileSync(SAMPLE_PATH),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<FrameCountResponse>().frameCount).toBe(
        groundTruth.files['sample.mp3']?.expectedFrameCount,
      );
    });

    it('is counted when the client sends no Content-Type at all', async () => {
      app = build();

      const response = await app.inject({
        method: 'POST',
        url: '/file-upload',
        payload: readFileSync(SAMPLE_PATH),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<FrameCountResponse>().frameCount).toBe(
        groundTruth.files['sample.mp3']?.expectedFrameCount,
      );
    });
  });

  describe('bodies that are not MP3 files', () => {
    it.each([
      ['JSON', '{"file":"x"}'],
      ['plain text', 'this is definitely not an mp3'],
      ['arbitrary binary', Buffer.alloc(4096, 0x7e)],
    ])('reports %s as containing no frames', async (_label, payload) => {
      app = build();

      const response = await app.inject({ method: 'POST', url: '/file-upload', payload });

      expect(response.statusCode).toBe(400);

      const body = response.json<ErrorBody>();
      expect(body).toMatchObject({
        statusCode: 400,
        code: 'NO_FRAMES_FOUND',
        error: 'Bad Request',
      });
      expect(body.message).toContain('MPEG Version 1 Layer III');
    });

    it('rejects an empty request rather than answering zero', async () => {
      app = build();

      const response = await app.inject({ method: 'POST', url: '/file-upload' });

      expect(response.statusCode).toBe(400);
      expect(response.json<ErrorBody>()).toMatchObject({ code: 'NO_FILE_UPLOADED' });
    });
  });

  it('accepts a file part under any field name', async () => {
    app = build();

    const response = await app.inject({
      method: 'POST',
      url: '/file-upload',
      ...multipartFile('audio', 'sample.mp3', readFileSync(SAMPLE_PATH)),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<FrameCountResponse>().frameCount).toBe(
      groundTruth.files['sample.mp3']?.expectedFrameCount,
    );
  });

  describe('uploads the server cannot read', () => {
    it('rejects a multipart body with no boundary', async () => {
      app = build();

      const response = await app.inject({
        method: 'POST',
        url: '/file-upload',
        headers: { 'content-type': 'multipart/form-data' },
        payload: readFileSync(SAMPLE_PATH),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ErrorBody>()).toMatchObject({ code: 'UNREADABLE_UPLOAD' });
    });

    it('never answers a multi-file request with a server error', async () => {
      // Sending several files is outside what this endpoint offers, so no
      // particular answer is promised. What is promised is that the caller's
      // mistake is never reported as a fault of the server's.
      app = build();

      const form = new FormData();
      form.append('file', readFileSync(SAMPLE_PATH), { filename: 'a.mp3' });
      form.append('second', readFileSync(join(FIXTURES, 'cbr-128-stereo-bare.mp3')), {
        filename: 'b.mp3',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/file-upload',
        payload: form.getBuffer(),
        headers: form.getHeaders(),
      });

      expect(response.statusCode).toBeLessThan(500);
    });
  });

  describe('files that are not well formed', () => {
    it('counts the complete frames of a truncated MP3', async () => {
      app = build();

      const response = await app.inject({
        method: 'POST',
        url: '/file-upload',
        ...multipartFile(
          FILE_FIELD_NAME,
          'truncated.mp3',
          readFileSync(join(FIXTURES, 'truncated.mp3')),
        ),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<FrameCountResponse>().frameCount).toBe(
        groundTruth.edgeCases['truncated.mp3']?.expectedFrameCount,
      );
    });

    it('rejects a real file of another format', async () => {
      app = build();

      const response = await app.inject({
        method: 'POST',
        url: '/file-upload',
        ...multipartFile(
          FILE_FIELD_NAME,
          'not-audio.wav',
          readFileSync(join(FIXTURES, 'not-audio.wav')),
        ),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ErrorBody>()).toMatchObject({ code: 'NO_FRAMES_FOUND' });
    });
  });

  it('reports an unexpected failure without describing it', async () => {
    // The suppression is deliberate: Fastify's default handler echoes the raw
    // exception message, which would put internal paths in the response body.
    app = build();
    app.get('/boom', () => {
      throw new Error('a secret internal detail');
    });

    const response = await app.inject({ method: 'GET', url: '/boom' });

    expect(response.statusCode).toBe(500);
    expect(response.json<ErrorBody>()).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
    });
    expect(response.body).not.toContain('secret internal detail');
  });

  describe('routing failures use the same error shape', () => {
    it('answers 404 with a code for an unknown route', async () => {
      app = build();

      const response = await app.inject({ method: 'POST', url: '/nope' });

      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(response.json<ErrorBody>()).toMatchObject({
        statusCode: 404,
        code: 'ROUTE_NOT_FOUND',
        error: 'Not Found',
      });
    });

    it('answers 405 with an Allow header when only the method is wrong', async () => {
      app = build();

      const response = await app.inject({ method: 'GET', url: '/file-upload' });

      expect(response.statusCode).toBe(405);
      expect(response.headers.allow).toBe('POST');
      expect(response.json<ErrorBody>()).toMatchObject({
        statusCode: 405,
        code: 'METHOD_NOT_ALLOWED',
      });
      expect(response.json<ErrorBody>().message).toContain('POST');
    });
  });
});
