// Reader 1 (S-080): lists a ZIP's files in the browser with JSZip, same-origin, no network.
// Limits mirror engine/engine/intake.py; the engine re-checks every one before a file is opened.
importScripts("jszip.min.js");
var MAX_ZIP = 200 * 1048576, MAX_ENTRIES = 500, MAX_FILE = 50 * 1048576, MAX_TOTAL = 500 * 1048576, MAX_RATIO = 100;
var ALLOWED = { docx: 1, xlsx: 1, csv: 1, txt: 1, pdf: 1 };
function why(name, usize, csize) {
  var n = name.replace(/\\/g, "/"), m = /\.([A-Za-z0-9]+)$/.exec(n), ext = m ? m[1].toLowerCase() : "";
  if (n.charAt(0) === "/" || /(^|\/)\.\.(\/|$)/.test(n) || /^[A-Za-z]:/.test(n) || n.indexOf("\0") >= 0) return "the file path leaves the package folder";
  if (usize > MAX_FILE) return "the file is larger than 50 MB";
  if (csize && usize / csize > MAX_RATIO) return "the file expands more than 100 to 1";
  if (!ALLOWED[ext]) return (ext ? "." + ext : "this") + " is not a file type this review reads";
  return "";
}
self.onmessage = function (e) {
  var bytes = e.data.bytes;
  if (bytes.byteLength > MAX_ZIP) { self.postMessage({ ok: true, package: "the package is larger than 200 MB", files: [] }); return; }
  JSZip.loadAsync(bytes).then(function (z) {
    var files = [], total = 0;
    z.forEach(function (path, f) {
      if (f.dir) return;
      var d = f._data || {}, u = d.uncompressedSize || 0, c = d.compressedSize || 0;
      total += u;
      files.push({ name: path, size: u, refused: why(path, u, c) });
    });
    var pkg = "";
    if (files.length > MAX_ENTRIES) pkg = "the package holds more than 500 files";
    else if (total > MAX_TOTAL) pkg = "the files expand past the package limit";
    self.postMessage({ ok: true, package: pkg, files: files });
  }, function () { self.postMessage({ ok: false }); });
};
