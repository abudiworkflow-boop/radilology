// Main application — tab navigation and module initialization
(function () {
  // Tab navigation
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      tabs.forEach(t => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab);
      });

      panels.forEach(p => {
        p.classList.toggle('active', p.id === `tab-${target}`);
      });
    });
  });

  // Initialize Image Analysis module
  ImageAnalysis.init();

  // Initialize Chat
  Chat.init();
})();
