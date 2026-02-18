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

  // Report Builder image handler (separate instance)
  createImageHandler({
    uploadZone: 'report-upload-area',
    fileInput: 'report-image-input',
    preview: 'report-image-preview',
    previewWrap: 'report-preview-wrap',
    placeholder: 'report-upload-placeholder',
    clearBtn: 'report-clear-btn',
  });

  // Initialize Report Builder
  ReportBuilder.init();

  // Initialize Chat
  Chat.init();
})();
