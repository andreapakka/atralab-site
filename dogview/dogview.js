/* Solo gestione schede: indipendente dall'elaborazione delle immagini. */
(function () {
  'use strict';
  const tabs = [document.getElementById('dv-tab-photo'), document.getElementById('dv-tab-explore')];
  const panels = [document.getElementById('dv-photo'), document.getElementById('dv-explore')];
  function activate(idx) {
    tabs.forEach((tab, i) => {
      const active = i === idx;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      panels[i].hidden = !active;
    });
  }
  tabs.forEach((tab, i) => tab.addEventListener('click', () => activate(i)));
  activate(0);
})();
