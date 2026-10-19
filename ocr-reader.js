// Reader 4 (S-080): reads text from a photo or scan in the browser with Tesseract (same-origin, no network, S-050).
// Each line keeps a locator ("image, line n") and a confidence 0 to 100. Below the bar the image is not read:
// "image n, not read, a person reads it". Limits mirror engine/engine/intake.py.
importScripts("ocr/tesseract.min.js");
var MAX_IMAGE = 25 * 1048576, BAR = 85, MAX_PIXELS = 40e6;
function magic(b) {
  var u = new Uint8Array(b, 0, Math.min(12, b.byteLength));
  if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) return "png";
  if (u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return "jpeg";
  return "";
}
function pixels(b, kind) {
  var v = new DataView(b), n = b.byteLength, i;
  if (kind === "png") return n < 24 ? Infinity : v.getUint32(16) * v.getUint32(20);
  for (i = 2; i + 9 < n;) {
    if (v.getUint8(i) !== 0xff) { i++; continue; }
    var m = v.getUint8(i + 1);
    if (m === 0xff) { i++; continue; }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return v.getUint16(i + 5) * v.getUint16(i + 7);
    i += 2 + (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01 ? 0 : v.getUint16(i + 2));
  }
  return Infinity;
}
var base = new URL("ocr/", self.location.href).href;
self.onmessage = function (e) {
  var bytes = e.data.bytes, n = e.data.n || 1;
  var no = function (why) { self.postMessage({ ok: true, refused: why, read: false, items: [], confidence: 0 }); };
  if (bytes.byteLength > MAX_IMAGE) return no("the image is larger than 25 MB");
  var kind = magic(bytes);
  if (!kind) return no("this is not a PNG or JPEG image");
  if (!(pixels(bytes, kind) <= MAX_PIXELS)) return no("the image has more than 40 million pixels, or its size cannot be read");
  Tesseract.createWorker("eng", 1, { workerPath: base + "worker.min.js", corePath: base, langPath: base, gzip: true, workerBlobURL: false })
    .then(function (w) {
      return w.recognize(new Blob([bytes], { type: "image/" + kind })).then(function (r) {
        var d = r.data, conf = Math.round(d.confidence || 0);
        var items = (d.lines || []).map(function (l, i) {
          return { locator: "image " + n + ", line " + (i + 1), text: String(l.text || "").replace(/\s+/g, " ").trim(), confidence: Math.round(l.confidence || 0) };
        }).filter(function (x) { return x.text; });
        return w.terminate().then(function () {
          if (conf < BAR || !items.length) self.postMessage({ ok: true, refused: "", read: false, items: [], confidence: conf, note: "image " + n + ", not read, a person reads it" });
          else self.postMessage({ ok: true, refused: "", read: true, items: items, confidence: conf });
        });
      });
    }).then(null, function () { self.postMessage({ ok: false }); });
};
