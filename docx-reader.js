// Reader 2 (S-080): reads a Word file's text in the browser with JSZip, same-origin, no network.
// Each paragraph keeps a locator ("paragraph n", "table t, row r, cell c") so a finding can point back to it.
// Limits mirror engine/engine/intake.py; the engine re-checks every one before a file is opened.
importScripts("jszip.min.js");
var MAX_DOCX = 50 * 1048576, MAX_PART = 50 * 1048576, MAX_RATIO = 100, MAX_PARAS = 20000;
function unesc(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); })
    .replace(/&#x([0-9a-fA-F]+);/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/&amp;/g, "&");
}
function paraText(p) {
  var out = "", re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g, m;
  while ((m = re.exec(p))) out += m[1] !== undefined ? unesc(m[1]) : " ";
  return out.replace(/\s+/g, " ").trim();
}
// Walks the body in order: a paragraph outside a table is "paragraph n"; a table is walked row by row, cell by cell.
function walk(xml) {
  var items = [], pn = 0, tn = 0, re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\/>|<w:p[ >][\s\S]*?<\/w:p>/g, m;
  while ((m = re.exec(xml))) {
    if (m[0].indexOf("<w:tbl>") === 0) {
      tn++;
      var rows = m[0].match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
      rows.forEach(function (r, ri) {
        (r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).forEach(function (c, ci) {
          var t = (c.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(paraText).filter(Boolean).join(" ");
          if (t) items.push({ locator: "table " + tn + ", row " + (ri + 1) + ", cell " + (ci + 1), text: t });
        });
      });
    } else {
      pn++;
      var t = m[0] === "<w:p/>" ? "" : paraText(m[0]);
      if (t) items.push({ locator: "paragraph " + pn, text: t });
    }
  }
  return items;
}
self.onmessage = function (e) {
  var bytes = e.data.bytes;
  if (bytes.byteLength > MAX_DOCX) { self.postMessage({ ok: true, refused: "the file is larger than 50 MB", items: [] }); return; }
  JSZip.loadAsync(bytes).then(function (z) {
    var part = z.file("word/document.xml");
    if (!part) { self.postMessage({ ok: true, refused: "this is not a Word file", items: [] }); return; }
    var d = part._data || {}, u = d.uncompressedSize || 0, c = d.compressedSize || 0;
    if (u > MAX_PART) { self.postMessage({ ok: true, refused: "the Word text is larger than 50 MB", items: [] }); return; }
    if (c && u / c > MAX_RATIO) { self.postMessage({ ok: true, refused: "the file expands more than 100 to 1", items: [] }); return; }
    return part.async("string").then(function (xml) {
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) { self.postMessage({ ok: true, refused: "the file declares an outside reference, which this review will not open", items: [] }); return; }
      var items = walk(xml);
      if (items.length > MAX_PARAS) { self.postMessage({ ok: true, refused: "the file holds more than 20000 paragraphs", items: [] }); return; }
      self.postMessage({ ok: true, refused: "", items: items });
    });
  }).then(null, function () { self.postMessage({ ok: false }); });
};
