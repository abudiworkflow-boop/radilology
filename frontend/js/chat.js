// Chat module — conversational radiology Q&A with term lookup
const Chat = (() => {
  let history = [];
  const MAX_HISTORY = 50;

  function init() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');

    sendBtn.addEventListener('click', () => sendMessage());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    document.querySelectorAll('.chat-quick-actions .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.query;
        sendMessage();
      });
    });

    loadHistory();
  }

  const GREETINGS = /^(hi|hello|hey|hiya|howdy|sup|yo|good\s*(morning|afternoon|evening|day)|what'?s?\s*up|greetings)[\s!?.]*$/i;

  function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    appendMessage('user', text);
    input.value = '';

    const quickActions = document.getElementById('chat-quick-actions');
    if (quickActions) quickActions.classList.add('hidden');

    if (GREETINGS.test(text)) {
      const greeting = 'Hello! I\'m RadAssist, your AI radiology assistant. You can:\n\n' +
        '- Ask about any **radiology term** (e.g. "pneumothorax")\n' +
        '- Ask **clinical questions** (e.g. "What causes pleural effusion?")\n' +
        '- Request a **report** using the Report Builder tab\n' +
        '- **Upload an X-ray** in the Image Analysis tab\n\n' +
        'Try typing a condition name or asking a question!';
      appendMessage('assistant', greeting);
      history.push({ role: 'user', content: text });
      history.push({ role: 'assistant', content: greeting });
      trimHistory();
      saveHistory();
      return;
    }

    const typingEl = showTypingIndicator();

    const wordCount = text.split(/\s+/).length;
    const isTermLookup = wordCount <= 3 && !text.includes('?');

    const apiCall = isTermLookup
      ? API.lookup(text)
      : API.query(text, {});

    apiCall.then(result => {
      removeTypingIndicator(typingEl);

      if (typeof result === 'object' && (result.keywords || result.findings || result.differentials)) {
        appendRichMessage(result);
      } else if (typeof result === 'object' && result.result) {
        appendMessage('assistant', result.result);
      } else if (typeof result === 'object' && result.output) {
        appendMessage('assistant', result.output);
      } else if (typeof result === 'string') {
        appendMessage('assistant', result);
      } else {
        appendMessage('assistant', JSON.stringify(result, null, 2));
      }

      history.push({ role: 'user', content: text });
      history.push({ role: 'assistant', content: result });
      trimHistory();
      saveHistory();

    }).catch(err => {
      removeTypingIndicator(typingEl);
      appendMessage('assistant', `Sorry, I encountered an error: ${err.message}`, true);
    });
  }

  function appendMessage(role, content, isError) {
    const container = document.getElementById('chat-messages');
    const msgEl = document.createElement('div');
    msgEl.className = `chat-message ${role}`;

    if (role === 'user') {
      msgEl.innerHTML = `
        <div class="chat-bubble">${escapeHtml(content)}</div>
        <div class="chat-avatar">You</div>
      `;
    } else {
      const errorStyle = isError ? ' style="color: var(--error)"' : '';
      msgEl.innerHTML = `
        <div class="chat-avatar">RA</div>
        <div class="chat-bubble"${errorStyle}>${formatText(String(content))}</div>
      `;
    }

    container.appendChild(msgEl);
    scrollToBottom();
  }

  function appendRichMessage(result) {
    const container = document.getElementById('chat-messages');
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message assistant';

    let html = '<div class="chat-avatar">RA</div><div class="chat-bubble">';

    const keywords = parseArray(result.keywords);
    if (keywords.length > 0) {
      html += '<div style="margin-bottom:8px">' +
        keywords.map(k => `<span class="keyword">${escapeHtml(k)}</span>`).join(' ') +
        '</div>';
    }

    const findings = result.findings || result.key_findings || '';
    if (findings) {
      html += `<div class="chat-findings">${formatText(String(findings))}</div>`;
    }

    const diffs = parseArray(result.differentials || result.differential_diagnosis);
    if (diffs.length > 0) {
      html += '<div class="chat-differentials"><strong>Differential Diagnosis:</strong><ol>' +
        diffs.map(d => `<li>${escapeHtml(d)}</li>`).join('') +
        '</ol></div>';
    }

    const suggestion = result.report_suggestion || result.report_language || '';
    if (suggestion) {
      html += `<div class="chat-suggestion">${escapeHtml(suggestion)}</div>`;
    }

    html += '</div>';
    msgEl.innerHTML = html;

    container.appendChild(msgEl);
    scrollToBottom();
  }

  function showTypingIndicator() {
    const container = document.getElementById('chat-messages');
    const typing = document.createElement('div');
    typing.className = 'chat-message assistant';
    typing.innerHTML = `
      <div class="chat-avatar">RA</div>
      <div class="chat-bubble">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    `;
    container.appendChild(typing);
    scrollToBottom();
    return typing;
  }

  function removeTypingIndicator(el) {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  function scrollToBottom() {
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatText(str) {
    return escapeHtml(str)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  function parseArray(val) {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string' && val) {
      return val.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    }
    return [];
  }

  function trimHistory() {
    if (history.length > MAX_HISTORY) {
      history = history.slice(history.length - MAX_HISTORY);
    }
  }

  function saveHistory() {
    try {
      sessionStorage.setItem('radassist-chat', JSON.stringify(history));
    } catch { /* ignore */ }
  }

  function loadHistory() {
    try {
      const saved = sessionStorage.getItem('radassist-chat');
      if (!saved) return;

      history = JSON.parse(saved);
      const quickActions = document.getElementById('chat-quick-actions');

      history.forEach(msg => {
        if (msg.role === 'user') {
          appendMessage('user', msg.content);
          if (quickActions) quickActions.classList.add('hidden');
        } else if (msg.role === 'assistant') {
          const content = msg.content;
          if (typeof content === 'object' && (content.keywords || content.findings || content.differentials)) {
            appendRichMessage(content);
          } else if (typeof content === 'object' && content.result) {
            appendMessage('assistant', content.result);
          } else if (typeof content === 'object' && content.output) {
            appendMessage('assistant', content.output);
          } else {
            appendMessage('assistant', String(content));
          }
        }
      });
    } catch { /* ignore */ }
  }

  return { init };
})();
