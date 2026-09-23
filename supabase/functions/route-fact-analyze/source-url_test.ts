import { assertPublicSourceUrl, isPrivateHostname, stripHostBrackets } from './source-url.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertRejected(url: string): void {
  try {
    assertPublicSourceUrl(url);
  } catch {
    return;
  }
  throw new Error(`expected ${url} to be rejected`);
}

function assertAllowed(url: string): void {
  assertPublicSourceUrl(url);
}

Deno.test('the bracketed IPv6 forms that bypassed the first guard are rejected', () => {
  // WHATWG keeps the brackets, so the old `host === '::1'` comparison never
  // matched. These three are the regression this file exists for.
  assertRejected('http://[::1]:8080/');
  assertRejected('http://[::ffff:7f00:1]/');
  assertRejected('http://[fd00::1]/');
  assertRejected('http://[::ffff:169.254.169.254]/latest/meta-data/');
});

Deno.test('other loopback, link-local and unique-local IPv6 forms are rejected', () => {
  assertRejected('http://[::]/');
  assertRejected('http://[fe80::1]/');
  assertRejected('http://[fec0::1]/');
  assertRejected('http://[fc00::1]/');
  assertRejected('http://[2002:7f00:1::]/'); // 6to4 wrapping 127.0.0.1
  assertRejected('http://[2002:a9fe:a9fe::]/'); // 6to4 wrapping 169.254.169.254
  assertRejected('http://[64:ff9b::7f00:1]/'); // NAT64 wrapping 127.0.0.1
});

Deno.test('local hostnames are rejected', () => {
  assertRejected('http://localhost/');
  assertRejected('http://localhost./');
  assertRejected('http://api.localhost/');
  assertRejected('http://printer.local/');
  assertRejected('http://metadata.google.internal/');
});

Deno.test('private IPv4 is rejected in every written form', () => {
  assertRejected('http://127.0.0.1/');
  assertRejected('http://127.1.2.3/');
  assertRejected('http://0.0.0.0/');
  assertRejected('http://10.0.0.1/');
  assertRejected('http://172.20.1.1/');
  assertRejected('http://192.168.1.1/');
  assertRejected('http://169.254.169.254/latest/meta-data/');
  // WHATWG normalizes these to dotted quads before the check runs.
  assertRejected('http://2130706433/');
  assertRejected('http://0x7f000001/');
});

Deno.test('public hosts and public IPv6 are allowed', () => {
  assertAllowed('https://example.com/');
  assertAllowed('https://www.2bulu.com/mc/community/detail?id=75985058');
  assertAllowed('http://xn--fiqs8s.example/');
  assertAllowed('http://[2001:4860:4860::8888]/');
  assertAllowed('http://172.32.0.1/'); // just outside 172.16/12
  assertAllowed('http://11.0.0.1/'); // just outside 10/8
});

Deno.test('non-http protocols are rejected before the host is considered', () => {
  assertRejected('ftp://example.com/file.txt');
  assertRejected('file:///etc/passwd');
  assertRejected('not a url');
});

Deno.test('host parsing helpers behave on their own inputs', () => {
  assert(stripHostBrackets('[::1]') === '::1', 'brackets must be stripped');
  assert(stripHostBrackets('example.com') === 'example.com', 'plain hosts are untouched');
  // Unparseable input fails closed.
  assert(isPrivateHostname(''), 'an empty host cannot be classified as public');
  assert(isPrivateHostname('[zzzz::1]'), 'an unparseable literal cannot be classified as public');
  // The dotted-quad tail form, normalized away by WHATWG but checked directly.
  assert(isPrivateHostname('::ffff:127.0.0.1'), 'IPv4-mapped dotted quad must be private');
  assert(!isPrivateHostname('::ffff:8.8.8.8'), 'IPv4-mapped public address must pass');
});
