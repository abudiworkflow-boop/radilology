// n8n Webhook API communication layer
const API = (() => {
  const BASE_URL = 'https://abudii.app.n8n.cloud/webhook';
  const TIMEOUT = 60000;

  async function request(body, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout || TIMEOUT);

    try {
      const res = await fetch(`${BASE_URL}/radiology`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error (${res.status}): ${text}`);
      }

      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      throw err;
    }
  }

  return {
    // Query the radiology knowledge base
    async query(queryText, filters = {}) {
      return request({
        message: queryText,
        query: queryText,
        modality: filters.modality || '',
        system: filters.system || '',
      });
    },

    // Generate a structured radiology report
    async generateReport(reportData) {
      return request({
        message: `Generate radiology report for ${reportData.modality || ''} ${reportData.bodyPart || ''}`,
        findings: reportData.findings || [],
        modality: reportData.modality,
        body_part: reportData.bodyPart,
        clinical_history: reportData.clinicalHistory || '',
        impression_notes: reportData.impressionNotes || '',
      });
    },

    // Analyze an X-ray image using GPT-4o vision
    async analyzeImage(imageData) {
      return request({
        message: 'Analyze this X-ray image',
        type: 'image_analysis',
        image: imageData.image,
        modality: imageData.modality || 'xray',
        body_part: imageData.bodyPart || '',
        clinical_context: imageData.clinicalContext || '',
      });
    },

    // Real-time Radiopaedia lookup
    async lookup(term) {
      return request({
        message: term,
        term: term,
      });
    },
  };
})();
