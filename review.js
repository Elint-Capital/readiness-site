// Browser door (PILOT-1, S-050): the one same-origin script on the review page.
// It starts the engine Worker, hands it the chosen file as bytes, and draws the findings.v1 contract with textContent only.
// The file is read here and never sent anywhere; this script makes no network call for user data.
(function () {
  var input = document.getElementById("review-file");
  var statusEl = document.getElementById("review-status");
  var out = document.getElementById("review-results");
  var privacy = document.getElementById("review-privacy");
  var worker = null;

  function say(text) { statusEl.textContent = text; }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function draw(res) {
    var c = res.contract;
    out.textContent = "";
    privacy.textContent = c.privacy_line;
    var sum = el("p", "ag-muted", "Rules used: SOP 50 10 " + c.sop_version + ". " + c.summary.map(function (s) { return s.count + " " + s.state; }).join(" · ") + ".");
    out.appendChild(sum);
    c.findings.forEach(function (f, i) {
      var s = el("section", "ag-section");
      s.setAttribute("data-finding", String(i + 1));
      s.setAttribute("aria-label", "Finding " + (i + 1));
      s.appendChild(el("p", "", "")).appendChild(el("strong", "", f.state + ": " + f.title));
      s.appendChild(el("p", "", "Found: " + f.found));
      s.appendChild(el("p", "ag-loc ag-mono", f.locators.join("; ")));
      if (f.cure.steps.length) s.appendChild(el("p", "", f.cure.label + ": " + f.cure.steps.join(" ")));
      s.appendChild(el("p", "ag-muted", "Rule: " + f.rule_id + " · " + f.citation));
      var d = el("details", "");
      d.appendChild(el("summary", "", "What does this mean?"));
      d.appendChild(el("p", "", "This finding comes from rule " + f.rule_id + ", which reads: " + f.citation));
      s.appendChild(d);
      s.appendChild(el("p", "", "Not sure what to do with this finding? Call us through your Avenida contact and mention rule " + f.rule_id + "."));
      out.appendChild(s);
    });
    var r = res.receipt;
    if (r) out.appendChild(el("p", "ag-muted ag-mono", "Run " + r.run_id + " · " + r.module + " · " + r.finished_at + " · engine " + r.engine_sha + " · rules " + r.rules_sha + " · " + Object.keys(r.counts).map(function (k) { return r.counts[k] + " " + k; }).join(", ")));
    say("Done in " + (res.ms / 1000).toFixed(1) + " seconds. " + c.findings.length + " findings.");
  }
  var mapEl = document.getElementById("review-map");
  var KINDS = { pdf: "PDF", docx: "Word", xlsx: "Excel", csv: "Spreadsheet export", txt: "Text", png: "Image", jpg: "Image", jpeg: "Image", zip: "ZIP" };
  function kind(name) { var m = /\.([a-z0-9]+)$/i.exec(name); return (m && KINDS[m[1].toLowerCase()]) || "Other"; }
  function size(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  // Names only: reads the ZIP's central directory; nothing is unpacked or sent.
  function zipNames(bytes) {
    var v = new DataView(bytes), names = [], i = bytes.byteLength - 22;
    while (i >= 0 && v.getUint32(i, true) !== 0x06054b50) i--;
    if (i < 0) return names;
    var n = v.getUint16(i + 10, true), p = v.getUint32(i + 16, true), dec = new TextDecoder();
    for (var k = 0; k < n && p + 46 <= bytes.byteLength && v.getUint32(p, true) === 0x02014b50; k++) {
      var nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
      var name = dec.decode(new Uint8Array(bytes, p + 46, nl));
      if (name.slice(-1) !== "/") names.push(name);
      p += 46 + nl + xl + cl;
    }
    return names;
  }
  // Reader 1 (S-080): JSZip in a same-origin Worker lists size and intake refusals; the hand reader above is the fallback.
  function zipList(bytes) {
    return new Promise(function (resolve) {
      var w;
      try { w = new Worker("zip-reader.js"); } catch (x) { resolve(null); return; }
      var done = function (v) { try { w.terminate(); } catch (x) {} resolve(v); };
      w.onmessage = function (e) { done(e.data && e.data.ok ? e.data : null); };
      w.onerror = function () { done(null); };
      w.postMessage({ bytes: bytes.slice(0) });
    });
  }
  // Reader 2 (S-080): JSZip in a same-origin Worker reads a Word file's text; every line keeps its place (paragraph, or table row and cell).
  function docxRead(bytes) {
    return new Promise(function (resolve) {
      var w;
      try { w = new Worker("docx-reader.js"); } catch (x) { resolve(null); return; }
      var done = function (v) { try { w.terminate(); } catch (x) {} resolve(v); };
      w.onmessage = function (e) { done(e.data && e.data.ok ? e.data : null); };
      w.onerror = function () { done(null); };
      w.postMessage({ bytes: bytes.slice(0) });
    });
  }
  // Reader 3 (S-080): JSZip in a same-origin Worker reads an Excel file's cells; every line keeps its place (sheet and cell).
  function xlsxRead(bytes) {
    return new Promise(function (resolve) {
      var w;
      try { w = new Worker("xlsx-reader.js"); } catch (x) { resolve(null); return; }
      var done = function (v) { try { w.terminate(); } catch (x) {} resolve(v); };
      w.onmessage = function (e) { done(e.data && e.data.ok ? e.data : null); };
      w.onerror = function () { done(null); };
      w.postMessage({ bytes: bytes.slice(0) });
    });
  }
  function drawMap(rows) {
    mapEl.textContent = "";
    mapEl.appendChild(el("p", "", rows.length + " documents in this file. The review reads the first ZIP or PDF; the rest are listed so a person can read them."));
    var t = el("table", "ag-table"), h = el("tr");
    t.appendChild(el("caption", "ag-sr-only", "Documents in the loan file"));
    ["Document", "Kind", "Size", "Read by the review"].forEach(function (x) { var th = el("th", "", x); th.setAttribute("scope", "col"); h.appendChild(th); });
    t.appendChild(h);
    rows.forEach(function (r) { var tr = el("tr"); [r.name, r.kind, r.size, r.read].forEach(function (x) { tr.appendChild(el("td", "", x)); }); t.appendChild(tr); });
    mapEl.appendChild(t);
  }
  function pickFirst(files) {
    for (var i = 0; i < files.length; i++) if (/\.(zip|pdf)$/i.test(files[i].name)) return files[i];
    return null;
  }
  function buildMap(files) {
    var rows = [], jobs = [], first = pickFirst(files);
    Array.prototype.forEach.call(files, function (f) {
      var k = kind(f.name), read = f === first ? "Yes" : (k === "Image" ? "Not read, a person reads it" : "Listed, a person reads it");
      if (k === "ZIP") {
        jobs.push(f.arrayBuffer().then(function (b) {
          rows.push({ name: f.name, kind: k, size: size(f.size), read: read });
          return zipList(b).then(function (r) {
            if (!r) { zipNames(b).forEach(function (n) { rows.push({ name: f.name + " / " + n, kind: kind(n), size: "", read: f === first ? "Yes" : "Listed, a person reads it" }); }); return; }
            r.files.forEach(function (x) {
              var rd = r.package ? "Not read: " + r.package : x.refused ? "Not read: " + x.refused : f === first ? "Yes" : "Listed, a person reads it";
              rows.push({ name: f.name + " / " + x.name + (x.tab ? " (UPP tab " + x.tab + ")" : ""), kind: kind(x.name), size: size(x.size), read: rd });
            });
          });
        }));
      } else if (k === "Word" && f !== first) {
        var row = { name: f.name, kind: k, size: size(f.size), read: read };
        rows.push(row);
        jobs.push(f.arrayBuffer().then(docxRead).then(function (r) {
          if (!r) return;
          row.read = r.refused ? "Not read: " + r.refused : "Text read in your browser, " + r.items.length + " passages, each with its place in the file. A person checks them against the rules.";
        }));
      } else if (k === "Excel" && f !== first) {
        var xrow = { name: f.name, kind: k, size: size(f.size), read: read };
        rows.push(xrow);
        jobs.push(f.arrayBuffer().then(xlsxRead).then(function (r) {
          if (!r) return;
          xrow.read = r.refused ? "Not read: " + r.refused : "Cells read in your browser, " + r.items.length + " filled cells, each with its sheet and cell. A person checks them against the rules.";
        }));
      } else rows.push({ name: f.name, kind: k, size: size(f.size), read: read });
    });
    return Promise.all(jobs).then(function () { drawMap(rows); });
  }
  input.addEventListener("change", function () {
    var all = input.files;
    if (!all || !all.length) return;
    if (mapEl) buildMap(all);
    var picked = Array.prototype.slice.call(all);
    var one = picked.length === 1 || !picked.some(function (f) { return !/\.zip$/i.test(f.name); });
    var file = one ? pickFirst(all) : picked[0];
    if (!file) { out.textContent = ""; say("No ZIP or PDF in this pick. The documents are listed above for a person to read."); return; }
    out.textContent = "";
    say("Reading the file");
    Promise.all((one ? [file] : picked).map(function (f) { return f.arrayBuffer().then(function (b) { return { name: f.name, bytes: b }; }); })).then(function (list) {
      if (worker) worker.terminate();
      worker = new Worker("review-worker.js?base=vendor/", { type: "module" });
      worker.onmessage = function (e) {
        if (e.data.type === "status") say(e.data.text);
        else if (e.data.type === "result") draw(e.data);
        else if (e.data.type === "error") say("The review engine could not start. " + e.data.text);
      };
      worker.onerror = function () { say("The review engine could not start in this browser."); };
      worker.postMessage({ type: "run", files: list }, list.map(function (x) { return x.bytes; }));
    });
  });
})();
