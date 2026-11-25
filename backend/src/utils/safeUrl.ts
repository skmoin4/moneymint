import dns from "dns/promises";
import net from "net";

// Partner callback URLs are typed in by users and fetched by our server, so they must
// not point into our own network (SSRF). Private/loopback/link-local targets are refused
// unless ALLOW_PRIVATE_CALLBACKS=true (local development only).
function isPrivate(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivate(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

export async function assertPublicHttpUrl(raw: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Not a valid URL";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "URL must start with http:// or https://";
  if (process.env.ALLOW_PRIVATE_CALLBACKS === "true") return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  try {
    addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  } catch {
    return `Can't resolve ${host}`;
  }
  if (addresses.some(isPrivate)) return "URL points to a private or local address";
  return null;
}
