import ipaddr from "npm:ipaddr.js@2.2.0";

export function publicIp(address: string): boolean {
  try {
    const ip = ipaddr.parse(address);
    if (ip.range() !== "unicast") return false;
    if (ip.kind() === "ipv6") return ip.match(ipaddr.parse("2000::"), 3);
    return true;
  } catch {
    return false;
  }
}
export function sourceUrl(value: unknown): URL {
  let u: URL;
  try {
    u = new URL(String(value));
  } catch {
    throw Error("SOURCE_URL_INVALID");
  }
  const host = u.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "")
    .toLowerCase();
  if (
    u.protocol !== "https:" || u.username || u.password || u.port || u.hash ||
    !host.includes(".") ||
    /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host) ||
    host === "metadata.google.internal" ||
    (ipaddr.isValid(host) && !publicIp(host))
  ) {
    throw Error("SOURCE_URL_UNSAFE");
  }
  return u;
}
