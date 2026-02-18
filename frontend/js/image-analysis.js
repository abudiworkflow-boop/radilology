// Image Analysis module — upload X-ray, get AI-powered analysis
const ImageAnalysis = (() => {
  let imageHandler = null;

  function init() {
    imageHandler = createImageHandler({
      uploadZone: 'analysis-upload-zone',
      fileInput: 'analysis-file-input',
      preview: 'analysis-preview',
      previewWrap: 'analysis-preview-wrap',
      placeholder: 'analysis-placeholder',
      clearBtn: 'analysis-clear-btn',
      onChange: () => updateAnalyzeButton(),
      onClear: () => updateAnalyzeButton(),
    });

    document.getElementById('analyze-btn').addEventListener('click', analyzeImage);
    document.getElementById('copy-analysis-btn').addEventListener('click', copyReport);
  }

  function updateAnalyzeButton() {
    const btn = document.getElementById('analyze-btn');
    btn.disabled = !imageHandler.getImageData();
  }

  async function analyzeImage() {
    const image = imageHandler.getImageData();
    if (!image) return;

    const modality = document.getElementById('analysis-modality').value;
    const bodyPart = document.getElementById('analysis-bodypart').value;
    const clinicalContext = document.getElementById('analysis-clinical').value;

    showLoading(true);
    hideResults();
    hideError();

    try {
      const result = await API.analyzeImage({ image, modality, bodyPart, clinicalContext });
      renderResults(result, image);
    } catch (err) {
      showError(err.message);
    } finally {
      showLoading(false);
    }
  }

  function renderResults(result, imageData) {
    document.getElementById('analysis-result-img').src = imageData;

    const reportEl = document.getElementById('analysis-report-text');
    reportEl.textContent = result.report || result.output || JSON.stringify(result, null, 2);

    const findingsList = document.getElementById('analysis-findings-list');
    const findings = result.findings || [];
    if (Array.isArray(findings) && findings.length > 0) {
      findingsList.innerHTML = findings.map(f => `<li>${escapeHtml(f)}</li>`).join('');
    } else {
      findingsList.innerHTML = '<li>No specific findings identified</li>';
    }

    document.getElementById('analysis-impression').textContent = result.impression || '';
    document.getElementById('analysis-recommendations').textContent = result.recommendations || '';

    document.getElementById('analysis-results').classList.remove('hidden');
  }

  function copyReport() {
    const report = document.getElementById('analysis-report-text').textContent;
    const findings = document.getElementById('analysis-findings-list').textContent;
    const impression = document.getElementById('analysis-impression').textContent;
    const recommendations = document.getElementById('analysis-recommendations').textContent;

    const text = `${report}\n\nKey Findings:\n${findings}\n\nImpression:\n${impression}\n\nRecommendations:\n${recommendations}`;

    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copy-analysis-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Report'; }, 2000);
    });
  }

  function showLoading(show) {
    document.getElementById('analysis-loading').classList.toggle('hidden', !show);
    document.getElementById('analyze-btn').disabled = show;
  }

  function hideResults() {
    document.getElementById('analysis-results').classList.add('hidden');
  }

  function showError(msg) {
    const el = document.getElementById('analysis-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function hideError() {
    document.getElementById('analysis-error').classList.add('hidden');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { init };
})();
