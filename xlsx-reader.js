// Reader 3 (S-080): reads an Excel file's cells in the browser with JSZip, same-origin, no network.
// Each non-empty cell keeps a locator ("sheet Name, cell B7") so a finding can point back to it.
// A formula cell reports the value Excel last saved; the formula text is not run. Limits mirror engine/engine/intake.py.
importScripts("jszip.min.js");
var MAX_XLSX = 50 * 1048576, MAX_PART = 50 * 1048576, MAX_RATIO = 100, MAX_CELLS = 200000;
function unesc(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); })
    .replace(/&#x([0-9a-fA-F]+);/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/&amp;/g, "&");
}
function textOf(x) {
  var out = "", re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, m;
  while ((m = re.exec(x))) out += unesc(m[1]);
  return out.replace(/\s+/g, " ").trim();
}
function check(part) {
  var d = part._data || {}, u = d.uncompressedSize || 0, c = d.compressedSize || 0;
  if (u > MAX_PART) return "a part of the Excel file is larger than 50 MB";
  if (c && u / c > MAX_RATIO) return "the file expands more than 100 to 1";
  return "";
}
function read(z, name) {
  var p = z.file(name);
  if (!p) return Promise.resolve({ missing: true, xml: "" });
  var bad = check(p);
  if (bad) return Promise.resolve({ refused: bad, xml: "" });
  return p.async("string").then(function (xml) {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return { refused: "the file declares an outside reference, which this review will not open", xml: "" };
    return { xml: xml };
  });
}
function refuse(r) { self.postMessage({ ok: true, refused: r, items: [] }); }
self.onmessage = function (e) {
  var bytes = e.data.bytes;
  if (bytes.byteLength > MAX_XLSX) { refuse("the file is larger than 50 MB"); return; }
  JSZip.loadAsync(bytes).then(function (z) {
    if (!z.file("xl/workbook.xml")) { refuse("this is not an Excel file"); return; }
    return Promise.all([read(z, "xl/workbook.xml"), read(z, "xl/_rels/workbook.xml.rels"), read(z, "xl/sharedStrings.xml")]).then(function (a) {
      var bad = a.filter(function (x) { return x.refused; })[0];
      if (bad) { refuse(bad.refused); return; }
      var rels = {}, sheets = [], m, re = /<Relationship\s[^>]*>/g;
      while ((m = re.exec(a[1].xml))) {
        var id = /Id="([^"]*)"/.exec(m[0]), tg = /Target="([^"]*)"/.exec(m[0]);
        if (id && tg) rels[id[1]] = tg[1].replace(/^\/?(xl\/)?/, "xl/");
      }
      re = /<sheet\s[^>]*>/g;
      while ((m = re.exec(a[0].xml))) {
        var nm = /name="([^"]*)"/.exec(m[0]), rid = /r:id="([^"]*)"/.exec(m[0]);
        if (nm && rid && rels[rid[1]]) sheets.push({ name: unesc(nm[1]), path: rels[rid[1]] });
      }
      var shared = (a[2].xml.match(/<si[ >][\s\S]*?<\/si>/g) || []).map(textOf);
      var items = [], chain = Promise.resolve();
      sheets.forEach(function (s) {
        chain = chain.then(function () {
          if (items.refused) return;
          return read(z, s.path).then(function (r) {
            if (r.refused) { items.refused = r.refused; return; }
            var cre = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, c;
            while ((c = cre.exec(r.xml))) {
              var ref = /\br="([A-Z]+[0-9]+)"/.exec(c[1]), ty = /\bt="([^"]*)"/.exec(c[1]), body = c[2] || "", t = "";
              if (!ref) continue;
              var v = /<v>([\s\S]*?)<\/v>/.exec(body);
              if (ty && ty[1] === "s") t = v ? shared[+v[1]] || "" : "";
              else if (ty && ty[1] === "inlineStr") t = textOf(body);
              else if (v) t = unesc(v[1]).trim();
              if (t) items.push({ locator: "sheet " + s.name + ", cell " + ref[1], text: t });
              if (items.length > MAX_CELLS) { items.refused = "the file holds more than 200000 filled cells"; return; }
            }
          });
        });
      });
      return chain.then(function () {
        if (items.refused) refuse(items.refused);
        else self.postMessage({ ok: true, refused: "", items: items });
      });
    });
  }).then(null, function () { self.postMessage({ ok: false }); });
};
