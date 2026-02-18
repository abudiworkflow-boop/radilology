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

    // Render report text
    const reportEl = document.getElementById('analysis-report-text');
    reportEl.textContent = result.report || result.output || JSON.stringify(result, null, 2);

    // Render findings — handle both string[] and object[] formats
    const findingsList = document.getElementById('analysis-findings-list');
    const findings = result.findings || [];
    if (Array.isArray(findings) && findings.length > 0) {
      findingsList.innerHTML = findings.map(f => {
        if (typeof f === 'string') return `<li>${escapeHtml(f)}</li>`;
        // Rich finding object: {finding, severity, confidence, evidence, differential[]}
        const severity = f.severity || '';
        const badge = severity === 'CRITICAL' ? 'critical' : severity === 'SIGNIFICANT' ? 'significant' : 'incidental';
        const diffList = Array.isArray(f.differential) && f.differential.length
          ? `<div class="finding-differentials"><strong>Differentials:</strong> ${f.differential.map(d => escapeHtml(d)).join(', ')}</div>` : '';
        const evidenceBlock = f.evidence
          ? `<div class="finding-evidence"><strong>Evidence:</strong> ${escapeHtml(f.evidence)}</div>` : '';
        const conf = f.confidence ? `<span class="confidence-tag">${escapeHtml(f.confidence)}</span>` : '';
        return `<li class="finding-item">
          <div class="finding-header"><span class="severity-badge ${badge}">${escapeHtml(severity)}</span> ${conf} ${escapeHtml(f.finding || '')}</div>
          ${evidenceBlock}${diffList}
        </li>`;
      }).join('');
    } else {
      findingsList.innerHTML = '<li>No specific findings identified</li>';
    }

    // Render impression
    document.getElementById('analysis-impression').textContent = result.impression || '';

    // Render recommendations — handle both string and object[] formats
    const recsEl = document.getElementById('analysis-recommendations');
    const recs = result.recommendations;
    if (Array.isArray(recs) && recs.length > 0) {
      recsEl.innerHTML = recs.map(r => {
        if (typeof r === 'string') return escapeHtml(r);
        const urgency = r.urgency ? `<span class="urgency-tag ${(r.urgency || '').toLowerCase()}">${escapeHtml(r.urgency)}</span> ` : '';
        const guideline = r.guideline ? ` <em class="guideline-ref">(${escapeHtml(r.guideline)})</em>` : '';
        return `<div class="rec-item">${urgency}${escapeHtml(r.action || '')}${guideline}</div>`;
      }).join('');
    } else {
      recsEl.textContent = typeof recs === 'string' ? recs : '';
    }

    // Render sources badge
    const sourcesEl = document.getElementById('analysis-sources');
    if (sourcesEl && result.sources) {
      const src = result.sources;
      const label = src.includes('perplexity') ? 'Pinecone KB + Perplexity' : 'Pinecone KB';
      sourcesEl.textContent = label;
      sourcesEl.className = 'sources-badge' + (src.includes('perplexity') ? ' dual' : '');
      sourcesEl.classList.remove('hidden');
    }

    // Render quality grade if available
    if (result.quality_metrics) {
      const qm = result.quality_metrics;
      const gradeEl = document.getElementById('analysis-quality-grade');
      if (gradeEl) {
        gradeEl.textContent = `Quality: ${qm.grade} (${qm.score}/100)`;
        gradeEl.className = 'quality-grade grade-' + (qm.grade || 'D').toLowerCase();
        gradeEl.classList.remove('hidden');
      }
    }

    // Render severity summary if available
    if (result.severity_summary) {
      const ss = result.severity_summary;
      const summaryEl = document.getElementById('analysis-severity-summary');
      if (summaryEl) {
        const parts = [];
        if (ss.critical > 0) parts.push(`<span class="severity-badge critical">${ss.critical} Critical</span>`);
        if (ss.significant > 0) parts.push(`<span class="severity-badge significant">${ss.significant} Significant</span>`);
        if (ss.incidental > 0) parts.push(`<span class="severity-badge incidental">${ss.incidental} Incidental</span>`);
        summaryEl.innerHTML = parts.join(' ');
        summaryEl.classList.remove('hidden');
      }
    }

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
