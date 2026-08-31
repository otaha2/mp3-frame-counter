/** Builds multipart/form-data request bodies for `app.inject()`. */

import FormData from 'form-data';

/** A payload plus the headers describing it, ready to spread into `inject()`. */
export interface MultipartRequest {
  readonly payload: Buffer;
  readonly headers: Record<string, string>;
}

/**
 * Encodes `content` as a single-file multipart body.
 *
 * @param fieldName - form field the file is attached to.
 * @param filename - name reported for the part.
 * @param content - raw file bytes.
 */
export function multipartFile(
  fieldName: string,
  filename: string,
  content: Buffer,
): MultipartRequest {
  const form = new FormData();
  form.append(fieldName, content, { filename, contentType: 'audio/mpeg' });

  return {
    payload: form.getBuffer(),
    headers: form.getHeaders(),
  };
}

/** Encodes a multipart body containing only a non-file field. */
export function multipartWithoutFile(fieldName: string, value: string): MultipartRequest {
  const form = new FormData();
  form.append(fieldName, value);

  return {
    payload: form.getBuffer(),
    headers: form.getHeaders(),
  };
}
