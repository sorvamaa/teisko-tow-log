document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  if (!toggle) return;
  var navbar = toggle.closest('.navbar');
  if (!navbar) return;
  toggle.addEventListener('click', function () {
    navbar.classList.toggle('nav-open');
  });
});
