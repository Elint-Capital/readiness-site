// PILOT-1: the engine in a Web Worker. The file is read here and never sent anywhere; there is no fetch of user data.
// Messages in:  {type:"run", name, bytes:ArrayBuffer}   Messages out: {type:"status"|"result"|"error", ...}
// Config: self.location.search ?base=<url of a same-origin folder holding pyodide/, wheels/ and bundle.json>
const base = new URL(new URL(self.location).searchParams.get("base") || "./vendor/", self.location).href;
let py, ready;
const say = (text) => postMessage({ type: "status", text });

async function boot() {
  const { loadPyodide } = await import(base + "pyodide/pyodide.mjs");
  say("Starting the review engine");
  py = await loadPyodide({ indexURL: base + "pyodide/" });
  await py.loadPackage(["lxml", "pyyaml", "micropip"]);
  const mp = py.pyimport("micropip");
  const wheels = await (await fetch(base + "wheels.json")).json();
  py.FS.mkdirTree("/whl");
  for (const w of wheels) {
    py.FS.writeFile("/whl/" + w, new Uint8Array(await (await fetch(base + "wheels/" + w)).arrayBuffer()));
    await mp.install("emfs:/whl/" + w, { deps: false });
  }
  // bundle.json: { "<path under /repo>": "<base64>" } for engine/engine, rules, research/corpus
  const bundle = await (await fetch(base + "bundle.json")).json();
  for (const [p, b64] of Object.entries(bundle)) {
    py.FS.mkdirTree("/repo/" + p.split("/").slice(0, -1).join("/"));
    py.FS.writeFile("/repo/" + p, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  }
  py.runPython("import sys; sys.path.insert(0,'/repo/engine')");
}

onmessage = async (e) => {
  if (e.data.type !== "run") return;
  try {
    ready ||= boot();
    await ready;
    say("Reading the file");
    py.FS.mkdirTree("/in");
    py.FS.writeFile("/in/file.zip", new Uint8Array(e.data.bytes));
    const t = performance.now();
    const out = py.runPython(`
import json
from pathlib import Path
from engine.run import review
review(Path('/in/file.zip'), Path('/out/run'), '', None, in_browser=True)
json.dumps({'contract': json.load(open('/out/run/findings.contract.json')),
            'html': open('/out/run/report.html').read()})`);
    postMessage({ type: "result", ms: Math.round(performance.now() - t), ...JSON.parse(out),
      xlsx: py.FS.readFile("/out/run/appended-workbook.xlsx"), docx: py.FS.readFile("/out/run/report.docx") });
  } catch (err) {
    postMessage({ type: "error", text: String(err) });
  }
};
