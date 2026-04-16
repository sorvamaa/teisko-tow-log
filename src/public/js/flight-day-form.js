document.addEventListener('DOMContentLoaded', function () {
  // Pilot search filter
  var searchInput = document.getElementById('pilot-search');
  var pilotList = document.getElementById('pilot-list');
  var options = pilotList.querySelectorAll('.pilot-option');

  searchInput.addEventListener('input', function () {
    var query = this.value.toLowerCase().trim();
    options.forEach(function (opt) {
      var name = opt.getAttribute('data-name');
      opt.style.display = (!query || name.indexOf(query) !== -1) ? '' : 'none';
    });
  });

  // Toggle selected class on click
  options.forEach(function (opt) {
    var cb = opt.querySelector('input[type="checkbox"]');
    cb.addEventListener('change', function () {
      opt.classList.toggle('selected', cb.checked);
    });
  });

  // Add new pilots
  var container = document.getElementById('new-pilots-container');
  var input = document.getElementById('new-pilot-input');
  var addBtn = document.getElementById('add-pilot-btn');
  var counter = 0;

  function addNewPilot() {
    var name = input.value.trim();
    if (!name) return;

    counter++;
    var row = document.createElement('div');
    row.className = 'new-pilot-tag';
    row.innerHTML =
      '<input type="hidden" name="new_pilot_names[]" value="' + name.replace(/"/g, '&quot;') + '">' +
      '<span>' + name.replace(/</g, '&lt;') + '</span>' +
      '<button type="button" class="remove-pilot" aria-label="Poista">&times;</button>';

    row.querySelector('.remove-pilot').addEventListener('click', function () {
      row.remove();
    });

    container.appendChild(row);
    input.value = '';
    input.focus();
  }

  addBtn.addEventListener('click', addNewPilot);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addNewPilot();
    }
  });
});
