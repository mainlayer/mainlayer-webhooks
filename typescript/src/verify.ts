import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Compute the expected HMAC-SHA256 signature for a webhook payload.
 *
 * @param payload - Raw request body as a string or Buffer.
 * @param secret  - The webhook secret from the Mainlayer dashboard.
 * @returns       Hex-encoded HMAC-SHA256 digest.
 */
export function computeSignature(payload: string | Buffer, secret: string): string {
  const body = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  return createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Verify that the provided signature matches the expected signature for the
 * given payload and secret. Uses a timing-safe comparison to prevent
 * timing-based attacks.
 *
 * @param payload   - Raw request body as a string or Buffer.
 * @param signature - Value from the `X-Mainlayer-Signature` header.
 * @param secret    - The webhook secret from the Mainlayer dashboard.
 * @returns         `true` if the signature is valid, `false` otherwise.
 */
export function verifySignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expected = computeSignature(payload, secret);

  // Both buffers must have the same byte length for timingSafeEqual.
  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(signature, 'hex');

  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, receivedBuf);
}
