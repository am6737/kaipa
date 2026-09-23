// Host checks for the source URL an admin asks the analyzer to read.
//
// The first version of this compared `host === '::1'` and a few IPv4 prefixes.
// WHATWG keeps the brackets on an IPv6 literal, so `new URL('http://[::1]/').hostname`
// is '[::1]' and that comparison never matched: `[::1]`, `[::ffff:7f00:1]` and
// `[fd00::1]` all reached the fetch. The rule here is ordered and parsed rather
// than string-matched, and it fails closed on anything it cannot classify.
//
// Boundary: this is a static check on the host, so it cannot see DNS. A domain
// that resolves to an internal address still passes (rebinding), which is why
// the fetch must keep `redirect: 'error'` — that is what stops an allowed
// public host from bouncing the request to an internal one.

function parseIpv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link local, incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  return false;
}

/** Expands an IPv6 literal to eight 16-bit groups, or null when unparseable. */
function expandIpv6(host: string): number[] | null {
  if (!host.includes(':')) return null;
  const halves = host.split('::');
  if (halves.length > 2) return null;
  const groupsOf = (part: string): number[] | null => {
    if (part === '') return [];
    const out: number[] = [];
    for (const group of part.split(':')) {
      // A dotted-quad tail (::ffff:127.0.0.1) becomes two groups. WHATWG
      // normalizes this form away before we see it, but the function is
      // exported and tested directly.
      const v4 = parseIpv4(group);
      if (v4) { out.push(v4[0] * 256 + v4[1], v4[2] * 256 + v4[3]); continue; }
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      out.push(parseInt(group, 16));
    }
    return out;
  };
  const head = groupsOf(halves[0]);
  if (!head) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const tail = groupsOf(halves[1]);
  if (!tail) return null;
  const gap = 8 - head.length - tail.length;
  if (gap < 0) return null;
  return [...head, ...new Array(gap).fill(0), ...tail];
}

/** Private, loopback, link-local and IPv6 forms that can reach one of those. */
export function isPrivateHostname(host: string): boolean {
  const name = stripHostBrackets(host).toLowerCase().replace(/\.$/, '');
  if (!name) return true;
  // `.internal` is reserved for private use (and is what cloud metadata
  // endpoints resolve through), so no legitimate public source lives there.
  if (name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.local') || name.endsWith('.internal')) return true;

  const ipv4 = parseIpv4(name);
  if (ipv4) return isPrivateIpv4(ipv4);

  const groups = expandIpv6(name);
  if (!groups) {
    // Fail closed. What reaches this is a host that looks like an address
    // literal (a colon, or nothing but digits and dots) but did not parse, and
    // an address that cannot be classified cannot be allowed.
    return name.includes(':') || /^[0-9.]+$/.test(name);
  }
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const embedded = (high: number, low: number) => [high >> 8, high & 0xff, low >> 8, low & 0xff];
  if (groups.every(group => group === 0)) return true; // ::
  if (groups.slice(0, 7).every(group => group === 0) && g7 === 1) return true; // ::1
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((g0 & 0xffc0) === 0xfec0) return true; // fec0::/10 site local (deprecated)
  // Wrapping forms carry an IPv4 address that the IPv6 range checks miss.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return isPrivateIpv4(embedded(g6, g7)); // ::ffff:0:0/96
  }
  if (g0 === 0x2002) return isPrivateIpv4(embedded(g1, g2)); // 2002::/16 6to4
  if (g0 === 0x0064 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isPrivateIpv4(embedded(g6, g7)); // 64:ff9b::/96 NAT64
  }
  return false;
}

/** WHATWG keeps the brackets on an IPv6 literal; range checks need them gone. */
export function stripHostBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

export function assertPublicSourceUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('来源链接格式不正确');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('来源链接只支持 HTTP/HTTPS');
  if (isPrivateHostname(parsed.hostname)) throw new Error('来源链接不能指向本机或内网地址');
  return parsed;
}
