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
export function verifySourceSignature(bytes: Uint8Array, mime: string) {
  const prefix = new TextDecoder().decode(bytes.subarray(0, 12));
  const ok = mime === "image/png"
    ? bytes.length >= 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
    : mime === "image/jpeg"
    ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mime === "image/webp"
    ? prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP"
    : mime === "application/pdf"
    ? prefix.startsWith("%PDF-")
    : false;
  if (!ok) throw Error("SOURCE_SIGNATURE_INVALID");
}

// Resolve every redirect separately, reject mixed public/private DNS answers,
// then connect to the validated IP directly. TLS still verifies the original host.
async function resolvePublic(u: URL, signal: AbortSignal): Promise<string> {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(host)) {
    if (!publicIp(host)) throw Error("SOURCE_IP_UNSAFE");
    return host;
  }
  // HTTPS DNS works in Edge runtimes without outbound UDP/53. The resolver
  // endpoint is fixed, never user-controlled; returned addresses are still checked.
  const results = await Promise.all(["A", "AAAA"].map(async (type) => {
    const endpoint = new URL("https://cloudflare-dns.com/dns-query");
    endpoint.searchParams.set("name", host);
    endpoint.searchParams.set("type", type);
    const res = await fetch(endpoint, {
      signal,
      redirect: "error",
      headers: { accept: "application/dns-json" },
    });
    if (!res.ok) throw Error("SOURCE_DNS_FAILED");
    const body = await res.text();
    if (body.length > 65536) throw Error("SOURCE_DNS_FAILED");
    const data = JSON.parse(body);
    if (data.Status !== 0) throw Error("SOURCE_DNS_FAILED");
    return (data.Answer ?? []).filter((a: { type: number }) =>
      a.type === 1 || a.type === 28
    )
      .map((a: { data: string }) => a.data) as string[];
  }));
  const addresses = results.flat();
  if (!addresses.length) throw Error("SOURCE_DNS_FAILED");
  if (!addresses.every(publicIp)) throw Error("SOURCE_IP_UNSAFE");
  return addresses.find((a) => ipaddr.parse(a).kind() === "ipv4") ??
    addresses[0];
}
export type Download = {
  bytes: Uint8Array;
  mime: string;
  finalUrl: string;
  redirects: string[];
};
type Hop = { bytes?: Uint8Array; mime?: string; location?: string };
async function fetchPinned(
  u: URL,
  address: string,
  signal: AbortSignal,
  fileInput = false,
): Promise<Hop> {
  // Dial only the validated address, then authenticate TLS using the source host.
  // startTls preserves hostname verification without re-resolving the socket.
  let conn: Deno.Conn | null = null;
  const close = () => {
    try {
      conn?.close();
    } catch { /* already closed */ }
  };
  let abortHandler: () => void;
  const abort = new Promise<never>((_, reject) => {
    abortHandler = () => {
      close();
      reject(Error("SOURCE_TIMEOUT"));
    };
    signal.addEventListener("abort", abortHandler, { once: true });
  });
  const operation = async () => {
    conn = await Deno.connect({ hostname: address, port: 443 });
    if (signal.aborted) {
      close();
      throw Error("SOURCE_TIMEOUT");
    }
    conn = await Deno.startTls(conn as Deno.TcpConn, {
      hostname: u.hostname.replace(/^\[|\]$/g, ""),
    });
    if (signal.aborted) {
      close();
      throw Error("SOURCE_TIMEOUT");
    }
    const request = new TextEncoder().encode(
      `GET ${
        u.pathname + u.search
      } HTTP/1.1\r\nHost: ${u.host}\r\nUser-Agent: FitBike-Source-Stage/2.0\r\nAccept: image/png,image/jpeg,image/webp,application/pdf\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`,
    );
    let written = 0;
    while (written < request.length) {
      written += await conn.write(request.subarray(written));
    }
    const parts: Uint8Array[] = [];
    let total = 0,
      headerEnd = -1,
      head = new Uint8Array(0),
      mime = "",
      max = 25165824;
    const headers: Record<string, string> = {};
    let status = 0;
    while (true) {
      const buf = new Uint8Array(65536);
      const n = await conn.read(buf);
      if (n === null) break;
      const part = buf.slice(0, n);
      parts.push(part);
      total += n;
      if (headerEnd < 0) {
        const joined = new Uint8Array(head.length + n);
        joined.set(head);
        joined.set(part, head.length);
        head = joined;
        for (let i = 0; i <= head.length - 4; i++) {
          if (
            head[i] === 13 && head[i + 1] === 10 && head[i + 2] === 13 &&
            head[i + 3] === 10
          ) {
            headerEnd = i + 4;
            break;
          }
        }
        if (headerEnd < 0 && head.length > 32768) {
          throw Error("SOURCE_HEADERS_TOO_LARGE");
        }
        if (headerEnd >= 0) {
          if (headerEnd > 32768) throw Error("SOURCE_HEADERS_TOO_LARGE");
          const lines = new TextDecoder().decode(
            head.subarray(0, headerEnd - 4),
          ).split("\r\n");
          const match = /^HTTP\/1\.[01] (\d{3})/.exec(lines.shift() ?? "");
          if (!match) throw Error("SOURCE_HTTP_INVALID");
          status = Number(match[1]);
          for (const line of lines) {
            const colon = line.indexOf(":");
            if (colon < 1) throw Error("SOURCE_HTTP_INVALID");
            const key = line.slice(0, colon).toLowerCase();
            if (key in headers) {
              if (
                [
                  "content-length",
                  "transfer-encoding",
                  "content-type",
                  "content-encoding",
                  "location",
                ].includes(key)
              ) throw Error("SOURCE_HTTP_INVALID");
              continue; // Noncritical repeated headers (e.g. Set-Cookie) are not consumed.
            }
            headers[key] = line.slice(colon + 1).trim();
          }
          if ([301, 302, 303, 307, 308].includes(status)) {
            if (!headers.location) throw Error("SOURCE_REDIRECT_INVALID");
            return { location: headers.location };
          }
          if (status !== 200) throw Error(`SOURCE_HTTP_${status}`);
          mime = (headers["content-type"] ?? "").split(";")[0].trim()
            .toLowerCase();
          if (
            !["image/png", "image/jpeg", "image/webp", "application/pdf"]
              .includes(mime) && !(fileInput && ["application/octet-stream", ""].includes(mime))
          ) throw Error("SOURCE_MIME_INVALID");
          if (
            headers["content-encoding"] &&
            headers["content-encoding"] !== "identity"
          ) throw Error("SOURCE_ENCODING_UNSUPPORTED");
          max = mime === "application/pdf" ? 25165824 : 8388608;
          if (
            headers["content-length"] &&
            (!/^\d+$/.test(headers["content-length"]) ||
              Number(headers["content-length"]) > max)
          ) throw Error("SOURCE_TOO_LARGE");
        }
      }
      if (total > max + 1048576) throw Error("SOURCE_TOO_LARGE");
      if (
        headerEnd >= 0 && headers["content-length"] &&
        !headers["transfer-encoding"] &&
        total >= headerEnd + Number(headers["content-length"])
      ) break;
    }
    if (headerEnd < 0) throw Error("SOURCE_HTTP_INVALID");
    const raw = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      raw.set(part, offset);
      offset += part.length;
    }
    let bytes = raw.subarray(headerEnd);
    if (headers["transfer-encoding"]) {
      if (
        headers["transfer-encoding"].toLowerCase() !== "chunked" ||
        headers["content-length"]
      ) throw Error("SOURCE_HTTP_INVALID");
      const chunks: Uint8Array[] = [];
      let pos = 0, size = 0, ended = false;
      while (pos < bytes.length) {
        let end = pos;
        while (
          end + 1 < bytes.length &&
          !(bytes[end] === 13 && bytes[end + 1] === 10)
        ) end++;
        const hex =
          new TextDecoder().decode(bytes.subarray(pos, end)).split(";")[0];
        if (!/^[a-fA-F0-9]{1,8}$/.test(hex)) throw Error("SOURCE_HTTP_INVALID");
        const n = parseInt(hex, 16);
        pos = end + 2;
        if (n === 0) {
          ended = true;
          break;
        }
        size += n;
        if (size > max) throw Error("SOURCE_TOO_LARGE");
        if (
          pos + n + 2 > bytes.length || bytes[pos + n] !== 13 ||
          bytes[pos + n + 1] !== 10
        ) throw Error("SOURCE_HTTP_INVALID");
        chunks.push(bytes.subarray(pos, pos + n));
        pos += n + 2;
      }
      if (!ended) throw Error("SOURCE_HTTP_INVALID");
      bytes = new Uint8Array(size);
      let p = 0;
      for (const c of chunks) {
        bytes.set(c, p);
        p += c.length;
      }
    } else if (
      headers["content-length"] &&
      bytes.length !== Number(headers["content-length"])
    ) throw Error("SOURCE_HTTP_INVALID");
    if (!bytes.length) throw Error("SOURCE_EMPTY");
    if (bytes.length > max) throw Error("SOURCE_TOO_LARGE");
    if (fileInput && ["application/octet-stream", ""].includes(mime)) {
      if (bytes[0] === 137 && bytes[1] === 80) mime = "image/png";
      else if (bytes[0] === 255 && bytes[1] === 216) mime = "image/jpeg";
      else if (new TextDecoder().decode(bytes.subarray(0,4)) === "RIFF") mime = "image/webp";
      else throw Error("NATIVE_FILE_MUST_BE_IMAGE");
    }
    verifySourceSignature(bytes, mime);
    return { bytes, mime };
  };
  try {
    return await Promise.race([operation(), abort]);
  } finally {
    signal.removeEventListener("abort", abortHandler!);
    close();
  }
}
export async function downloadSource(value: unknown, fileInput = false): Promise<Download> {
  const signal = AbortSignal.timeout(20000), redirects: string[] = [];
  let u = sourceUrl(value);
  try {
    for (let hop = 0; hop <= 4; hop++) {
      const address = await resolvePublic(u, signal);
      const result = await fetchPinned(u, address, signal, fileInput);
      if (result.location) {
        if (hop === 4) throw Error("SOURCE_REDIRECT_LIMIT");
        u = sourceUrl(new URL(result.location, u).href);
        redirects.push(u.href);
        continue;
      }
      return {
        bytes: result.bytes!,
        mime: result.mime!,
        finalUrl: u.href,
        redirects,
      };
    }
    throw Error("SOURCE_REDIRECT_LIMIT");
  } catch (e) {
    if (signal.aborted) throw Error("SOURCE_TIMEOUT");
    throw e;
  }
}
