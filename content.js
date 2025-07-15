// Content script読み込み確認
console.log('LLM翻訳拡張機能 Content Script 読み込み完了');

// 翻訳結果を表示するポップアップのスタイル
const style = document.createElement('style');
style.textContent = `
  .llm-translation-popup {
    position: fixed;
    background: white;
    border: 1px solid #ccc;
    border-radius: 8px;
    padding: 15px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    max-width: 300px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    line-height: 1.4;
  }
  
  .llm-translation-popup .original-text {
    color: #666;
    font-style: italic;
    margin-bottom: 10px;
    border-bottom: 1px solid #eee;
    padding-bottom: 8px;
  }
  
  .llm-translation-popup .translated-text {
    color: #333;
    font-weight: bold;
  }
  
  .llm-translation-popup .close-btn {
    position: absolute;
    top: 5px;
    right: 8px;
    background: none;
    border: none;
    font-size: 16px;
    cursor: pointer;
    color: #999;
  }
  
  .llm-translation-popup .close-btn:hover {
    color: #333;
  }
  
  .llm-translation-error {
    background: #ffebee;
    border-color: #f44336;
    color: #c62828;
  }
`;
document.head.appendChild(style);

// バックグラウンドスクリプトからのメッセージを受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script メッセージ受信:', message);

  if (message.action === "ping") {
    sendResponse({ status: "ready" });
  } else if (message.action === "showTranslation") {
    showTranslationPopup(message.originalText, message.translatedText, message.model);
  } else if (message.action === "showError") {
    showErrorPopup(message.message);
  } else if (message.action === "showTranslating") {
    showTranslatingPopup(message.originalText);
  }
});

// 翻訳結果を表示するポップアップを作成
function showTranslationPopup(originalText, translatedText, model) {
  // 既存のポップアップを削除
  removeExistingPopup();

  const popup = document.createElement('div');
  popup.className = 'llm-translation-popup';
  popup.innerHTML = `
        <button class="close-btn">&times;</button>
        <div class="original-text">${escapeHtml(originalText)}</div>
        <div class="translated-text">${escapeHtml(translatedText)}</div>
        ${model ? `<div style="font-size: 12px; color: #999; margin-top: 8px;">使用モデル: ${escapeHtml(model)}</div>` : ''}
    `;

  // マウス位置の近くに表示
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    popup.style.left = Math.min(rect.left, window.innerWidth - 320) + 'px';
    popup.style.top = (rect.bottom + 10) + 'px';
  }

  document.body.appendChild(popup);

  // クローズボタンのイベント
  popup.querySelector('.close-btn').onclick = () => {
    popup.remove();
  };

  // 3秒後に自動で閉じる
  setTimeout(() => {
    if (popup.parentNode) {
      popup.remove();
    }
  }, 5000);
}

// エラーメッセージを表示
function showErrorPopup(message) {
  removeExistingPopup();

  const popup = document.createElement('div');
  popup.className = 'llm-translation-popup llm-translation-error';
  popup.innerHTML = `
    <button class="close-btn">&times;</button>
    <div>${escapeHtml(message)}</div>
  `;

  popup.style.left = '20px';
  popup.style.top = '20px';

  document.body.appendChild(popup);

  popup.querySelector('.close-btn').onclick = () => {
    popup.remove();
  };

  setTimeout(() => {
    if (popup.parentNode) {
      popup.remove();
    }
  }, 3000);
}

// 翻訳中ポップアップを表示
function showTranslatingPopup(originalText) {
  removeExistingPopup();

  const popup = document.createElement('div');
  popup.className = 'llm-translation-popup';
  popup.innerHTML = `
    <button class="close-btn">&times;</button>
    <div class="original-text">${escapeHtml(originalText)}</div>
    <div class="translated-text">翻訳中...</div>
  `;

  // マウス位置の近くに表示
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    popup.style.left = Math.min(rect.left, window.innerWidth - 320) + 'px';
    popup.style.top = (rect.bottom + 10) + 'px';
  }

  document.body.appendChild(popup);

  // クローズボタンのイベント
  popup.querySelector('.close-btn').onclick = () => {
    popup.remove();
  };
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
