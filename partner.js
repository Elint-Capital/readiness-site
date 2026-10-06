// Partner view (PILOT-1, S-050): the one same-origin script on partner.html.
// It re-skins this page live from the form (name, logo, two colors, domain) and shows usage from this browser's own count.
// Nothing is sent anywhere; the logo file is read here and shown from a local object URL.
(function () {
  var root = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };
  var name = $("pv-name"), accent = $("pv-color1"), second = $("pv-color2"), domain = $("pv-domain"), logo = $("pv-logo");
  var preview = $("pv-preview"), mark = $("pv-mark"), host = $("pv-host");

  function lum(hex) {
    var n = parseInt(hex.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (v) {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function ink(hex) { return lum(hex) > 0.4 ? "#111827" : "#FFFFFF"; }
  function apply() {
    var n = name.value.trim() || "Your name here";
    root.style.setProperty("--ag-accent", accent.value);
    root.style.setProperty("--ag-accent-hover", second.value);
    root.style.setProperty("--ag-on-accent", ink(accent.value));
    mark.textContent = n;
    host.textContent = (domain.value.trim() || "readiness.example") + "/start";
    document.querySelectorAll(".ag-tenant").forEach(function (t) { t.textContent = n; });
  }
  [name, accent, second, domain].forEach(function (i) { i.addEventListener("input", apply); });
  logo.addEventListener("change", function () {
    var f = logo.files && logo.files[0];
    if (!f) return;
    var img = $("pv-img");
    img.src = URL.createObjectURL(f);
    img.hidden = false;
  });
  var tenants = {
    "1": ["Avenida", "#2457E6", "#1B47C2", "readiness.elintcapital.com/avenida"],
    "2": ["Harbor Bend Lending", "#0F766E", "#115E59", "readiness.elintcapital.com/harborbend"]
  };
  function load(k) {
    var t = tenants[k];
    name.value = t[0]; accent.value = t[1]; second.value = t[2]; domain.value = t[3];
    $("pv-img").hidden = true; apply();
  }
  document.querySelectorAll("input[name=pv-tenant]").forEach(function (r) {
    r.addEventListener("change", function () { if (r.checked) load(r.value); });
  });
  $("pv-reset").addEventListener("click", function () {
    var c = document.querySelector("input[name=pv-tenant]:checked");
    load(c ? c.value : "1");
  });
  var n = 0;
  try { n = parseInt(localStorage.getItem("sba.reviews") || "0", 10) || 0; } catch (e) { n = 0; }
  $("pv-usage").textContent = n + (n === 1 ? " file" : " files");
  apply();
})();
