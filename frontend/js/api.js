// n8n Webhook API communication layer
const API = (() => {
  const ENDPOINT = 'https://abudii.app.n8n.cloud/webhook/radiology';
  const TIMEOUT = 120000;

  async function request(body, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout || TIMEOUT);

    try {
      const res = await fetch(ENDPOINT, {
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

      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        throw new Error('Server returned an invalid response. Please try again.');
      }
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      throw err;
    }
  }

  return {
    // Unified chat — handles queries, lookups, and report requests
    async chat(messageText, filters = {}) {
      return request({
        message: messageText,
        modality: filters.modality || '',
        system: filters.system || '',
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
  };
})();
