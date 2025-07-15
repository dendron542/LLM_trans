// グローバル変数
let originalText = '';
let modelName = '';
let decodedText = '';
let decodedModel = '';

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Translation view loaded');
    console.log('URL:', window.location.href);

    // URLパラメータから翻訳情報を取得
    const urlParams = new URLSearchParams(window.location.search);
    originalText = urlParams.get('original');
    modelName = urlParams.get('model');

    console.log('Original text:', originalText);
    console.log('Model:', modelName);

    // イベントリスナーを設定
    setupEventListeners();

    if (originalText) {
        // 原文を表示（decodeURIComponent のエラーハンドリング）
        try {
            decodedText = decodeURIComponent(originalText);
        } catch (error) {
            console.warn('decodeURIComponent failed for originalText:', error);
            decodedText = originalText; // デコードに失敗した場合はそのまま使用
        }
        
        document.getElementById('originalText').textContent = decodedText;
        document.getElementById('originalCharCount').textContent = decodedText.length;

        // モデル情報を表示
        if (modelName) {
            try {
                decodedModel = decodeURIComponent(modelName);
            } catch (error) {
                console.warn('decodeURIComponent failed for modelName:', error);
                decodedModel = modelName; // デコードに失敗した場合はそのまま使用
            }
            document.getElementById('modelInfo').textContent = `使用モデル: ${decodedModel}`;
        } else {
            document.getElementById('modelInfo').textContent = '使用モデル: 取得中...';
        }

        // 翻訳を実行
        await performTranslation();
    } else {
        document.getElementById('originalText').textContent = 'エラー: 翻訳するテキストが指定されていません。';
        document.getElementById('translatedText').innerHTML = '<div class="error">翻訳するテキストが見つかりませんでした。</div>';
    }
});

// イベントリスナーを設定
function setupEventListeners() {
    document.getElementById('copyOriginalBtn').addEventListener('click', copyOriginal);
    document.getElementById('copyTranslatedBtn').addEventListener('click', copyTranslated);
}

async function performTranslation() {
    console.log('Starting translation...');

    try {
        // Chrome拡張機能のAPIを使って設定を取得
        if (typeof chrome !== 'undefined' && chrome.storage) {
            const result = await chrome.storage.sync.get(['apiUrl', 'apiKey', 'targetLanguage', 'model', 'customModel']);
            console.log('Settings retrieved:', result);

            const { apiUrl, apiKey, targetLanguage, model: configModel, customModel } = result;

            if (!apiUrl || !apiKey) {
                throw new Error('API設定が不完全です。拡張機能の設定を確認してください。');
            }

            // モデル名を決定（URLパラメータから取得したものを優先、なければ設定から）
            let finalModelName = modelName || configModel || 'gpt-3.5-turbo';
            if (configModel === 'custom' && customModel) {
                finalModelName = customModel;
            }

            console.log('Using model:', finalModelName);

            // モデル情報を更新
            document.getElementById('modelInfo').textContent = `使用モデル: ${finalModelName}`;

            // 翻訳実行
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: finalModelName,
                    messages: [
                        {
                            role: "system",
                            content: `あなたは優秀な翻訳者です。与えられたテキストを${targetLanguage === 'ja' ? '日本語' : targetLanguage || 'ja'}に翻訳してください。翻訳結果のみを返してください。`
                        },
                        {
                            role: "user",
                            content: decodedText
                        }
                    ],
                    max_tokens: 2000,
                    temperature: 0.3
                })
            });

            console.log('API response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API error:', errorText);
                throw new Error(`API Error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            console.log('API response data:', data);

            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error('APIレスポンスの形式が正しくありません');
            }

            const translatedText = data.choices[0].message.content.trim();
            console.log('Translation completed:', translatedText);

            // 翻訳結果を表示
            document.getElementById('translatedText').textContent = translatedText;
            document.getElementById('translatedCharCount').textContent = translatedText.length;
        } else {
            throw new Error('Chrome拡張機能のAPIにアクセスできません。この画面は拡張機能から開く必要があります。');
        }

    } catch (error) {
        console.error('翻訳エラー:', error);
        document.getElementById('translatedText').innerHTML = `<div class="error">翻訳エラー: ${error.message}</div>`;
        document.getElementById('modelInfo').textContent = 'エラーが発生しました';
    }
}

function copyOriginal() {
    navigator.clipboard.writeText(decodedText || originalText).then(() => {
        showNotification('原文をコピーしました');
    }).catch(err => {
        console.error('Copy failed:', err);
        showNotification('コピーに失敗しました');
    });
}

function copyTranslated() {
    const translatedElement = document.getElementById('translatedText');
    const translatedText = translatedElement.textContent;

    if (translatedText && !translatedText.includes('翻訳中') && !translatedText.includes('エラー')) {
        navigator.clipboard.writeText(translatedText).then(() => {
            showNotification('翻訳をコピーしました');
        });
    }
}

function showNotification(message) {
    // 簡単な通知を表示
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 12px 24px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        font-size: 14px;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 2000);
}
