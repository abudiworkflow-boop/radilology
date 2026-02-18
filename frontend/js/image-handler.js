// Reusable image upload/camera capture handler
// Usage: createImageHandler({ uploadZone, fileInput, preview, previewWrap, placeholder, clearBtn })
function createImageHandler(config) {
  let currentImageData = null;

  const uploadZone = document.getElementById(config.uploadZone);
  const fileInput = document.getElementById(config.fileInput);
  const preview = document.getElementById(config.preview);
  const previewWrap = document.getElementById(config.previewWrap);
  const placeholder = document.getElementById(config.placeholder);
  const clearBtn = config.clearBtn ? document.getElementById(config.clearBtn) : null;

  if (!uploadZone || !fileInput) return { getImageData: () => null, clear: () => {} };

  uploadZone.addEventListener('click', (e) => {
    if (e.target.closest('.btn-icon-close')) return;
    fileInput.click();
  });

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      processImage(file);
    }
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) processImage(file);
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clear();
      if (config.onClear) config.onClear();
    });
  }

  function processImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 1200;
        let { width, height } = img;

        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        currentImageData = canvas.toDataURL('image/jpeg', 0.8);

        if (preview) preview.src = currentImageData;
        if (previewWrap) previewWrap.classList.remove('hidden');
        if (placeholder) placeholder.classList.add('hidden');

        if (config.onChange) config.onChange(currentImageData);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function clear() {
    currentImageData = null;
    if (preview) preview.src = '';
    if (previewWrap) previewWrap.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
    if (fileInput) fileInput.value = '';
  }

  return {
    getImageData: () => currentImageData,
    clear,
  };
}
