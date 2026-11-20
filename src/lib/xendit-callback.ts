import 'server-only'

import { timingSafeEqual } from 'node:crypto'

/** Verify callback token in constant time; shared-account callbacks depend on this route. */
export function isValidXenditCallbackToken(receivedToken: string | null): boolean {
  const expected = process.env.XENDIT_CALLBACK_TOKEN
  if (!expected || !receivedToken) return false
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(receivedToken)
  if (expectedBuffer.length !== receivedBuffer.length || expectedBuffer.length === 0) return false
  return timingSafeEqual(expectedBuffer, receivedBuffer)
}
