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
      out.appendChild(s);
    });
    say("Done in " + (res.ms / 1000).toFixed(1) + " seconds. " + c.findings.length + " findings.");
  }
  input.addEventListener("change", function () {
    var file = input.files && input.files[0];
    if (!file) return;
    out.textContent = "";
    say("Reading the file");
    file.arrayBuffer().then(function (bytes) {
      if (worker) worker.terminate();
      worker = new Worker("review-worker.js?base=vendor/", { type: "module" });
      worker.onmessage = function (e) {
        if (e.data.type === "status") say(e.data.text);
        else if (e.data.type === "result") draw(e.data);
        else if (e.data.type === "error") say("The review engine could not start. " + e.data.text);
      };
      worker.onerror = function () { say("The review engine could not start in this browser."); };
      worker.postMessage({ type: "run", name: file.name, bytes: bytes }, [bytes]);
    });
  });
})();
