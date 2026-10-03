document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  if (toggle) {
    var navbar = toggle.closest('.navbar');
    if (navbar) {
      toggle.addEventListener('click', function () {
        var open = navbar.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
  }

  // Alavalikot: avaus klikkaamalla, sulkeutuu kun klikataan muualle tai Esc
  var groups = document.querySelectorAll('.nav-group');
  function closeAll(except) {
    groups.forEach(function (g) {
      if (g === except) return;
      g.classList.remove('open');
      var b = g.querySelector('.nav-group-label');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }
  groups.forEach(function (g) {
    var btn = g.querySelector('.nav-group-label');
    if (!btn) return;
    btn.addEventListener('click', function (event) {
      event.stopPropagation();
      closeAll(g);
      var open = g.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
  document.addEventListener('click', function (event) {
    if (!event.target.closest('.nav-group')) closeAll(null);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeAll(null);
  });

  // Valinnat, jotka lähettävät lomakkeen heti
  document.querySelectorAll('select.auto-submit').forEach(function (sel) {
    sel.addEventListener('change', function () { sel.form.submit(); });
  });

  // Varmistuskysely lomakkeille joissa on data-confirm (esim. poistot)
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      if (!window.confirm(form.getAttribute('data-confirm'))) {
        event.preventDefault();
      }
    });
  });
});
