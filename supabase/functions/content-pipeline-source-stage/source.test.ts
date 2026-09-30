import assert from "node:assert/strict";
import { publicIp, sourceUrl, verifySourceSignature } from "./source.ts";
Deno.test("private metadata mapped and reserved IPs blocked", () => {
  for (
    const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.0.1",
      "169.254.169.254",
      "100.100.100.200",
      "0.0.0.0",
      "224.0.0.1",
      "192.0.2.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "2001:db8::1",
    ]
  ) assert.equal(publicIp(ip), false, ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
    assert.equal(publicIp(ip), true, ip);
  }
});
Deno.test("public HTTPS no manufacturer allowlist", () => {
  for (
    const u of [
      "https://upload.wikimedia.org/a.jpg",
      "https://dgaddcosprod.blob.core.windows.net/a.png",
    ]
  ) assert.equal(sourceUrl(u).href, u);
  for (
    const u of [
      "http://example.org/a",
      "https://localhost/a",
      "https://foo.local/a",
      "https://127.1/a",
      "https://0x7f000001/a",
      "https://169.254.169.254/a",
      "https://[::ffff:127.0.0.1]/a",
      "https://user:pass@example.org/a",
      "https://example.org:8443/a",
      "https://example.org/a#fragment",
    ]
  ) assert.throws(() => sourceUrl(u));
});
Deno.test("MIME matches file signature", () => {
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  verifySourceSignature(png, "image/png");
  verifySourceSignature(
    new TextEncoder().encode("%PDF-1.7\n"),
    "application/pdf",
  );
  assert.throws(() =>
    verifySourceSignature(new TextEncoder().encode("<html>bad"), "image/jpeg")
  );
  assert.throws(() => verifySourceSignature(png, "image/svg+xml"));
});

async function mockedDownload(response: Uint8Array, addresses = ["8.8.8.8"]) {
  const { downloadSource } = await import("./source.ts");
  const oldFetch = globalThis.fetch,
    oldConnect = Deno.connect,
    oldTls = Deno.startTls;
  const calls: { dial?: string; tls?: string } = {};
  let sent = false;
  const conn = {
    close() {},
    write(b: Uint8Array) {
      return Promise.resolve(b.length);
    },
    read(b: Uint8Array) {
      if (sent) return Promise.resolve(null);
      sent = true;
      b.set(response);
      return Promise.resolve(response.length);
    },
  };
  try {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            Status: 0,
            Answer: addresses.map((data) => ({ type: 1, data })),
          }),
        ),
      );
    Deno.connect = ((opts: Deno.ConnectOptions) => {
      calls.dial = opts.hostname;
      return Promise.resolve(conn);
    }) as typeof Deno.connect;
    Deno.startTls = ((_c: Deno.TcpConn, opts: Deno.StartTlsOptions) => {
      calls.tls = opts.hostname;
      return Promise.resolve(conn);
    }) as typeof Deno.startTls;
    const result = await downloadSource("https://photos.public-site.org/a.png");
    return { result, calls };
  } finally {
    globalThis.fetch = oldFetch;
    Deno.connect = oldConnect;
    Deno.startTls = oldTls;
  }
}
const encode = (s: string) => new TextEncoder().encode(s);
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
function response(header: string, body = png) {
  const h = encode(header);
  const b = new Uint8Array(h.length + body.length);
  b.set(h);
  b.set(body, h.length);
  return b;
}
Deno.test("pinned public IP retains original TLS identity and accepts repeated noncritical headers", async () => {
  const { result, calls } = await mockedDownload(
    response(
      "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: 8\r\nSet-Cookie: a=1\r\nSet-Cookie: b=2\r\n\r\n",
    ),
  );
  assert.deepEqual(result.bytes, png);
  assert.equal(calls.dial, "8.8.8.8");
  assert.equal(calls.tls, "photos.public-site.org");
});
Deno.test("mixed DNS, private redirect, oversized length and ambiguous framing rejected", async () => {
  await assert.rejects(
    () =>
      mockedDownload(response("HTTP/1.1 200 OK\r\n\r\n"), [
        "8.8.8.8",
        "127.0.0.1",
      ]),
    /SOURCE_IP_UNSAFE/,
  );
  await assert.rejects(
    () =>
      mockedDownload(
        response(
          "HTTP/1.1 302 Found\r\nLocation: https:\/\/169.254.169.254\/image.png\r\n\r\n",
        ),
      ),
    /SOURCE_URL_UNSAFE/,
  );
  await assert.rejects(
    () =>
      mockedDownload(
        response(
          "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: 9000000\r\n\r\n",
        ),
      ),
    /SOURCE_TOO_LARGE/,
  );
  await assert.rejects(
    () =>
      mockedDownload(
        response(
          "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: 8\r\nContent-Length: 8\r\n\r\n",
        ),
      ),
    /SOURCE_HTTP_INVALID/,
  );
});
Deno.test("chunked framing decoded and truncation rejected", async () => {
  const body = response("8\r\n", png);
  const end = encode("\r\n0\r\n\r\n");
  const chunks = new Uint8Array(body.length + end.length);
  chunks.set(body);
  chunks.set(end, body.length);
  const h =
    "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nTransfer-Encoding: chunked\r\n\r\n";
  assert.deepEqual(
    (await mockedDownload(response(h, chunks))).result.bytes,
    png,
  );
  await assert.rejects(
    () => mockedDownload(response(h, body)),
    /SOURCE_HTTP_INVALID/,
  );
});
