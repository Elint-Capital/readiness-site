// Download PDF (DRAFT-BANNER-1, S-050): the one same-origin script on results and print pages.
// It opens the browser's print dialog; the draft banner prints with the page. Nothing is sent anywhere.
(function () {
  var b = document.getElementById("ag-download-pdf");
  if (b) b.addEventListener("click", function () { window.print(); });
})();
