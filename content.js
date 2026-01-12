// Content script読み込み確認
console.log('LLM翻訳拡張機能 Content Script 読み込み完了');

// エラー表示用ポップアップのスタイル
const style = document.createElement('style');
style.textContent = `
  .llm-translation-error {
    position: fixed;
    background: #ffebee;
    border: 1px solid #f44336;
    border-radius: 8px;
    padding: 15px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    max-width: 300px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    line-height: 1.4;
    color: #c62828;
  }

  .llm-translation-error .close-btn {
    position: absolute;
    top: 5px;
    right: 8px;
    background: none;
    border: none;
    font-size: 16px;
    cursor: pointer;
    color: #999;
  }

  .llm-translation-error .close-btn:hover {
    color: #333;
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
  }
});

// エラーメッセージを表示
function showErrorPopup(message) {
  removeExistingPopup();

  const popup = document.createElement('div');
  popup.className = 'llm-translation-error';
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

// 既存のポップアップを削除
function removeExistingPopup() {
  const existing = document.querySelector('.llm-translation-error');
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
