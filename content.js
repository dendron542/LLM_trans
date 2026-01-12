// Content script読み込み確認
console.log('LLM翻訳拡張機能 Content Script 読み込み完了');

// ポップアップのスタイル
const style = document.createElement('style');
style.textContent = `
  .llm-translation-popup {
    position: fixed;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 15px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    max-width: 400px;
    max-height: 500px;
    overflow-y: auto;
    font-family: Arial, sans-serif;
    font-size: 14px;
    line-height: 1.6;
  }

  .llm-translation-error {
    background: #ffebee;
    border-color: #f44336;
    color: #c62828;
  }

  .llm-translation-translating {
    background: #fff3e0;
    border-color: #ff9800;
    color: #e65100;
  }

  .llm-translation-result {
    background: #e8f5e9;
    border-color: #4caf50;
  }

  .llm-translation-popup .close-btn {
    position: absolute;
    top: 5px;
    right: 8px;
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: #999;
  }

  .llm-translation-popup .close-btn:hover {
    color: #333;
  }

  .llm-translation-popup .title {
    font-weight: bold;
    margin-bottom: 10px;
    padding-right: 20px;
  }

  .llm-translation-popup .content {
    margin-bottom: 10px;
  }

  .llm-translation-popup .label {
    font-weight: bold;
    color: #555;
    margin-top: 10px;
    margin-bottom: 5px;
  }

  .llm-translation-popup .text {
    padding: 10px;
    background: #f5f5f5;
    border-radius: 4px;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .llm-translation-result .text {
    background: white;
  }
`;
document.head.appendChild(style);

// バックグラウンドスクリプトからのメッセージを受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script メッセージ受信:', message);

  if (message.action === "ping") {
    sendResponse({ status: "ready" });
  } else if (message.action === "showError") {
    showErrorPopup(message.message);
  } else if (message.action === "showTranslating") {
    showTranslatingPopup(message.originalText);
  } else if (message.action === "showTranslation") {
    showTranslationPopup(message.originalText, message.translatedText, message.model);
  }
});

// 翻訳中メッセージを表示
function showTranslatingPopup(originalText) {
  removeExistingPopup();

  const popup = document.createElement('div');
  popup.className = 'llm-translation-popup llm-translation-translating';
  popup.innerHTML = `
    <button class="close-btn">&times;</button>
    <div class="title">翻訳中...</div>
    <div class="content">
      <div class="label">原文:</div>
      <div class="text">${escapeHtml(originalText)}</div>
    </div>
  `;

  positionPopup(popup);
  document.body.appendChild(popup);

  popup.querySelector('.close-btn').onclick = () => {
    popup.remove();
  };
}

// 翻訳結果を表示
function showTranslationPopup(originalText, translatedText, model) {
  removeExistingPopup();

  const popup = document.createElement('div');
  popup.className = 'llm-translation-popup llm-translation-result';
  popup.innerHTML = `
    <button class="close-btn">&times;</button>
    <div class="title">翻訳完了 (${escapeHtml(model || '')})</div>
    <div class="content">
      <div class="label">原文:</div>
      <div class="text">${escapeHtml(originalText)}</div>
      <div class="label">翻訳:</div>
      <div class="text">${escapeHtml(translatedText)}</div>
    </div>
  `;

  positionPopup(popup);
  document.body.appendChild(popup);

  popup.querySelector('.close-btn').onclick = () => {
    popup.remove();
  };

  // 10秒後に自動で閉じる
  setTimeout(() => {
    if (popup.parentNode) {
      popup.remove();
    }
  }, 10000);
}

// エラーメッセージを表示
function showErrorPopup(message) {
  removeExistingPopup();

  const popup = document.createElement('div');
  popup.className = 'llm-translation-popup llm-translation-error';
  popup.innerHTML = `
    <button class="close-btn">&times;</button>
    <div class="title">エラー</div>
    <div class="content">${escapeHtml(message)}</div>
  `;

  positionPopup(popup);
  document.body.appendChild(popup);

  popup.querySelector('.close-btn').onclick = () => {
    popup.remove();
  };

  setTimeout(() => {
    if (popup.parentNode) {
      popup.remove();
    }
  }, 5000);
}

// ポップアップの位置を設定
function positionPopup(popup) {
  popup.style.left = '20px';
  popup.style.top = '20px';
}

// 既存のポップアップを削除
function removeExistingPopup() {
  const existing = document.querySelector('.llm-translation-popup');
  if (existing) {
    existing.remove();
  }
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
