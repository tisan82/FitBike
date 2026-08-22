import fs from "node:fs";

const width = Number(process.argv[2]);
const height = Number(process.argv[3]);
const output = process.argv[4];
const tabs = await (await fetch("http://127.0.0.1:9222/json")).json();
const tab = tabs.find((item) => item.type === "page");
if (!tab) throw new Error("No browser page target found.");

const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let id = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function send(method, params = {}) {
  const requestId = ++id;
  socket.send(JSON.stringify({ id: requestId, method, params }));
  return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
}

await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
await send("Page.enable");
await send("Page.navigate", { url: "http://localhost:3001/tire-detail/model/MAXXIS_MA_RS" });
await new Promise((resolve) => setTimeout(resolve, 4000));
await send("Runtime.evaluate", { expression: "scrollTo(0, document.documentElement.scrollHeight)" });
await new Promise((resolve) => setTimeout(resolve, 3000));
const metrics = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => ({
    innerWidth,
    innerHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    images: [...document.images].map((image) => ({
      alt: image.alt,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      rect: image.getBoundingClientRect().toJSON(),
    })),
  }))()`,
});
const layout = await send("Page.getLayoutMetrics");
const screenshot = await send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: true,
  clip: {
    x: 0,
    y: 0,
    width: layout.cssContentSize.width,
    height: layout.cssContentSize.height,
    scale: 1,
  },
});
fs.writeFileSync(output, Buffer.from(screenshot.data, "base64"));
console.log(JSON.stringify(metrics.result.value, null, 2));
socket.close();
