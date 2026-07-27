/**
 * Validates a `?next=` destination before anything redirects to it.
 *
 * `value.startsWith("/")` is the obvious check and it is not enough:
 * `//evil.example.com` also starts with a slash and is a protocol-relative URL,
 * so a browser treats it as another origin. That turns the sign-in page into an
 * open redirect — a link that looks like it goes to FinTrack, sends you through
 * a real login, and lands you somewhere else entirely.
 *
 * `/\evil.example.com` is the same trick: browsers normalise the backslash to a
 * forward slash before resolving.
 *
 * Lives in a module with no directive so the proxy, the server and the client
 * forms all agree on one definition.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;

  // Protocol-relative, in either slash form.
  if (value.startsWith("//") || value.startsWith("/\\")) return null;

  // A control character could smuggle a line break into a header.
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return null;
  }

  return value;
}
