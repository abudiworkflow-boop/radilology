// Report builder — manages findings, keyword suggestions, and report generation
const ReportBuilder = (() => {
  let findings = [];

  const COMMON_KEYWORDS = [
    'Normal cardiac silhouette', 'Clear lungs bilaterally', 'No pneumothorax',
    'No pleural effusion', 'No acute osseous abnormality', 'Unremarkable mediastinum',
    'No focal consolidation', 'No free air', 'Mild degenerative changes',
    'No acute fracture', 'Soft tissues unremarkable', 'Normal alignment',
    'No lymphadenopathy', 'Stable appearance', 'Redemonstrated',
    'Opacity noted in', 'Consolidation in', 'Effusion present',
    'Fracture line through', 'Widened mediastinum', 'Cardiomegaly',
    'Atelectasis at', 'Nodule measuring', 'Mass effect',
    'Disc herniation at', 'Stenosis at', 'Compression fracture',
  ];

  function init() {
    const addBtn = document.getElementById('add-finding-btn');
    const findingInput = document.getElementById('finding-input');
    const generateBtn = document.getElementById('generate-report-btn');
    const copyBtn = document.getElementById('copy-report-btn');
    const saveDraftBtn = document.getElementById('save-draft-btn');

    addBtn.addEventListener('click', () => addFinding());
    findingInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addFinding();
    });

    findingInput.addEventListener('input', () => showSuggestions(findingInput.value));

    generateBtn.addEventListener('click', generateReport);
    copyBtn.addEventListener('click', copyReport);
    saveDraftBtn.addEventListener('click', saveDraft);

    loadDraft();
  }

  function addFinding(text) {
    const input = document.getElementById('finding-input');
    const value = text || input.value.trim();
    if (!value) return;

    findings.push(value);
    input.value = '';
    renderFindings();
    hideSuggestions();
  }

  function removeFinding(index) {
    findings.splice(index, 1);
    renderFindings();
  }

  function renderFindings() {
    const list = document.getElementById('findings-list');
    list.innerHTML = findings.map((f, i) => `
      <div class="finding-item">
        <span>${f}</span>
        <button class="remove-finding" data-index="${i}">&times;</button>
      </div>
    `).join('');

    list.querySelectorAll('.remove-finding').forEach(btn => {
      btn.addEventListener('click', () => removeFinding(parseInt(btn.dataset.index)));
    });
  }

  function showSuggestions(query) {
    const container = document.getElementById('keyword-suggestions');
    if (!query || query.length < 2) {
      hideSuggestions();
      return;
    }

    const lower = query.toLowerCase();
    const matches = COMMON_KEYWORDS.filter(k =>
      k.toLowerCase().includes(lower) && !findings.includes(k)
    ).slice(0, 6);

    if (matches.length === 0) {
      hideSuggestions();
      return;
    }

    container.innerHTML = matches.map(m =>
      `<button class="suggestion-chip">${m}</button>`
    ).join('');

    container.classList.remove('hidden');

    container.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        addFinding(chip.textContent);
      });
    });
  }

  function hideSuggestions() {
    document.getElementById('keyword-suggestions').classList.add('hidden');
  }

  async function generateReport() {
    const modality = document.getElementById('report-modality').value;
    const bodyPart = document.getElementById('report-bodypart').value;
    const clinicalHistory = document.getElementById('clinical-history').value;

    if (findings.length === 0) {
      showError('report-error', 'Please add at least one finding.');
      return;
    }

    showLoading('report-loading', true);
    hideError('report-error');
    document.getElementById('generated-report').classList.add('hidden');

    try {
      const result = await API.generateReport({
        findings,
        modality,
        bodyPart,
        clinicalHistory,
      });

      const reportContent = document.getElementById('report-content');
      reportContent.textContent = result.report || result.output || JSON.stringify(result, null, 2);
      document.getElementById('generated-report').classList.remove('hidden');
    } catch (err) {
      showError('report-error', err.message);
    } finally {
      showLoading('report-loading', false);
    }
  }

  function copyReport() {
    const content = document.getElementById('report-content').textContent;
    navigator.clipboard.writeText(content).then(() => {
      const btn = document.getElementById('copy-report-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Report'; }, 2000);
    });
  }

  function saveDraft() {
    const draft = {
      modality: document.getElementById('report-modality').value,
      bodyPart: document.getElementById('report-bodypart').value,
      clinicalHistory: document.getElementById('clinical-history').value,
      findings,
      report: document.getElementById('report-content').textContent,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem('radassist-draft', JSON.stringify(draft));
    const btn = document.getElementById('save-draft-btn');
    btn.textContent = 'Saved!';
    setTimeout(() => { btn.textContent = 'Save Draft'; }, 2000);
  }

  function loadDraft() {
    const saved = localStorage.getItem('radassist-draft');
    if (!saved) return;

    try {
      const draft = JSON.parse(saved);
      document.getElementById('report-modality').value = draft.modality || 'xray';
      document.getElementById('report-bodypart').value = draft.bodyPart || 'chest';
      document.getElementById('clinical-history').value = draft.clinicalHistory || '';
      findings = draft.findings || [];
      renderFindings();
      if (draft.report) {
        document.getElementById('report-content').textContent = draft.report;
        document.getElementById('generated-report').classList.remove('hidden');
      }
    } catch {
      // Ignore corrupt drafts
    }
  }

  function prefill(data) {
    if (data.modality) {
      document.getElementById('report-modality').value = data.modality;
    }
    if (data.bodyPart) {
      document.getElementById('report-bodypart').value = data.bodyPart;
    }
    if (data.clinicalHistory) {
      document.getElementById('clinical-history').value = data.clinicalHistory;
    }
    if (data.findings && Array.isArray(data.findings)) {
      findings = [...data.findings];
      renderFindings();
    }
    if (data.report) {
      document.getElementById('report-content').textContent = data.report;
      document.getElementById('generated-report').classList.remove('hidden');
    }
  }

  function showLoading(id, show) {
    document.getElementById(id).classList.toggle('hidden', !show);
  }

  function showError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function hideError(id) {
    document.getElementById(id).classList.add('hidden');
  }

  return {
    init,
    addFinding,
    prefill,
    getFindings: () => [...findings],
  };
})();
