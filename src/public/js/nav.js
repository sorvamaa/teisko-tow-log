document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  if (toggle) {
    var navbar = toggle.closest('.navbar');
    if (navbar) {
      toggle.addEventListener('click', function () {
        navbar.classList.toggle('nav-open');
      });
    }
  }

  // Varmistuskysely lomakkeille joissa on data-confirm (esim. poistot)
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      if (!window.confirm(form.getAttribute('data-confirm'))) {
        event.preventDefault();
      }
    });
  });
});
