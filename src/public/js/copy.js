document.addEventListener('DOMContentLoaded', function () {
  // Kopioi-napit: data-copy="<textarea-id>"
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var src = document.getElementById(btn.getAttribute('data-copy'));
      if (!src) return;
      var text = src.value;
      var original = btn.textContent;
      var done = function () {
        btn.textContent = 'Kopioitu ✓';
        setTimeout(function () { btn.textContent = original; }, 2000);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, function () { fallback(); });
      } else {
        fallback();
      }
      function fallback() {
        src.style.display = 'block';
        src.select();
        try { document.execCommand('copy'); done(); } catch (e) { /* näytetään teksti käsin kopioitavaksi */ }
      }
    });
  });

  // Valinnat, jotka lähettävät lomakkeen heti
  document.querySelectorAll('select.auto-submit').forEach(function (sel) {
    sel.addEventListener('change', function () { sel.form.submit(); });
  });
});
