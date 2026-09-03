import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const functionUrl = process.env.CONTENT_IMAGE_MIGRATION_FUNCTION_URL;
const anonJwt = process.env.SUPABASE_ANON_JWT;
const storageBaseUrl = "https://farjyjcvduthawpdjuqe.supabase.co/storage/v1/object/public/content-assets";

if (!functionUrl || !anonJwt) {
  throw new Error("CONTENT_IMAGE_MIGRATION_FUNCTION_URL and SUPABASE_ANON_JWT are required");
}

const headers = {
  Authorization: `Bearer ${anonJwt}`,
  apikey: anonJwt,
  "Content-Type": "application/json",
};

async function callFunction(body) {
  const response = await fetch(functionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`migration function ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function resolveChromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes("/")) {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }
    const result = spawnSync("bash", ["-lc", `command -v ${candidate}`], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  throw new Error("Chrome/Chromium binary was not found on the runner");
}

async function waitForJson(url, timeoutMs = 15000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Chrome DevTools did not become ready: ${lastError ?? "timeout"}`);
}

class CdpClient {
  constructor(url) {
    if (typeof WebSocket !== "function") {
      throw new Error("Node WebSocket global is unavailable");
    }
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP WebSocket open timeout")), 10000);
      this.ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.ws.addEventListener("error", (event) => {
        clearTimeout(timer);
        reject(new Error(`CDP WebSocket error: ${event.message ?? "unknown"}`));
      }, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function imageToWebpBase64(cdp, sourceUrl) {
  const expression = `
    (async () => {
      const sourceUrl = ${JSON.stringify(sourceUrl)};
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.decoding = "async";
      const loaded = new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("image load failed: " + sourceUrl));
      });
      img.src = sourceUrl;
      await loaded;

      const maxWidth = 1200;
      const scale = Math.min(1, maxWidth / img.naturalWidth);
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("2d canvas unavailable");
      ctx.drawImage(img, 0, 0, width, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
      if (!blob || blob.type !== "image/webp") throw new Error("WebP encoding failed");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
      }
      return { base64: btoa(binary), width, height, size: bytes.length };
    })()
  `;

  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });

  if (result.exceptionDetails) {
    throw new Error(`browser conversion failed: ${JSON.stringify(result.exceptionDetails)}`);
  }
  const value = result.result?.value;
  if (!value?.base64) throw new Error(`browser conversion returned no data for ${sourceUrl}`);
  return value;
}

const discovered = await callFunction({ action: "discover" });
if (discovered.status !== "DISCOVERED") {
  throw new Error(`unexpected discovery response: ${JSON.stringify(discovered)}`);
}

if (!discovered.assets?.length) {
  const finalized = await callFunction({ action: "finalize" });
  console.log(JSON.stringify(finalized, null, 2));
  process.exit(finalized.status === "PUBLISHED_VERIFIED" ? 0 : 1);
}

const chromeBinary = resolveChromeBinary();
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fitbike-chrome-"));
const chrome = spawn(chromeBinary, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-web-security",
  "--allow-running-insecure-content",
  "--remote-debugging-port=9222",
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let stderr = "";
chrome.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  await waitForJson("http://127.0.0.1:9222/json/version");
  const targets = await waitForJson("http://127.0.0.1:9222/json/list");
  const target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (!target) throw new Error("No Chrome page target found");

  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url: "data:text/html,<html><body></body></html>" });
  await new Promise((resolve) => setTimeout(resolve, 300));

  for (const asset of discovered.assets) {
    const managedUrl = `${storageBaseUrl}/${asset.storage_path}`;
    const existing = await fetch(managedUrl, { method: "HEAD" });
    if (existing.ok) {
      console.log(JSON.stringify({
        stage: "ASSET_REUSED",
        source_url: asset.source_url,
        storage_path: asset.storage_path,
      }));
      continue;
    }

    const converted = await imageToWebpBase64(cdp, asset.fetch_url);
    if (converted.size > 4 * 1024 * 1024) {
      throw new Error(`converted WebP exceeds 4MB: ${asset.source_url}`);
    }
    const uploaded = await callFunction({
      action: "upload",
      source_url: asset.source_url,
      webp_base64: converted.base64,
      width: converted.width,
      height: converted.height,
      byte_size: converted.size,
    });
    if (uploaded.status !== "UPLOADED" && uploaded.status !== "ALREADY_STORED") {
      throw new Error(`upload failed: ${JSON.stringify(uploaded)}`);
    }
    console.log(JSON.stringify({
      stage: "ASSET_INTERNALIZED",
      source_url: asset.source_url,
      storage_path: uploaded.storage_path,
      width: converted.width,
      height: converted.height,
      byte_size: converted.size,
    }));
  }

  cdp.close();
  const finalized = await callFunction({ action: "finalize" });
  console.log(JSON.stringify(finalized, null, 2));
  if (finalized.status !== "PUBLISHED_VERIFIED" || finalized.remaining_external_hotlinks !== 0) {
    throw new Error(`final verification failed: ${JSON.stringify(finalized)}`);
  }
} finally {
  chrome.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 300));
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    console.warn(`Chrome temp cleanup warning: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (chrome.exitCode && chrome.exitCode !== 0) {
    console.error(stderr.slice(-4000));
  }
}
