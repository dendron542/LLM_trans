// グローバル変数
let originalText = '';
let modelName = '';
let decodedText = '';
let decodedModel = '';

// RateLimitError と formatErrorMessage は utils.js で定義されています

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Translation view loaded');
    console.log('URL:', window.location.href);

    // URLパラメータから翻訳情報を取得
    const urlParams = new URLSearchParams(window.location.search);
    originalText = urlParams.get('original');
    modelName = urlParams.get('model');
    const method = urlParams.get('method');

    console.log('Original text:', originalText);
    console.log('Model:', modelName);
    console.log('Method:', method);

    // イベントリスナーを設定
    setupEventListeners();

    // storageからデータを読み込む場合
    if (method === 'storage') {
        console.log('Storage方式でデータを読み込み中...');
        try {
            const result = await chrome.storage.local.get(['pendingTranslation']);
            const translationData = result.pendingTranslation;
            
            if (translationData) {
                console.log('Storageから翻訳データを取得:', translationData);
                
                // データをクリア
                await chrome.storage.local.remove(['pendingTranslation']);
                
                // 翻訳データを設定
                decodedText = translationData.text;
                
                console.log('画面を更新中... テキスト:', decodedText);
                
                // 原文を表示
                const originalTextElement = document.getElementById('originalText');
                const originalCharCountElement = document.getElementById('originalCharCount');
                const modelInfoElement = document.getElementById('modelInfo');
                
                if (originalTextElement) {
                    originalTextElement.textContent = decodedText;
                    originalTextElement.style.display = 'block'; // 強制再描画
                    console.log('原文を表示:', decodedText);
                } else {
                    console.error('originalText要素が見つかりません');
                }
                
                if (originalCharCountElement) {
                    originalCharCountElement.textContent = decodedText.length;
                } else {
                    console.error('originalCharCount要素が見つかりません');
                }
                
                if (modelInfoElement) {
                    modelInfoElement.textContent = `使用モデル: ${translationData.model}`;
                    console.log('モデル情報を表示:', translationData.model);
                } else {
                    console.error('modelInfo要素が見つかりません');
                }
                
                // 翻訳結果エリアを初期化
                const translatedTextElement = document.getElementById('translatedText');
                if (translatedTextElement) {
                    translatedTextElement.textContent = '翻訳中...';
                    translatedTextElement.className = 'text-content translated-text';
                    console.log('翻訳結果エリアを初期化');
                }

                // 翻訳を実行
                await performTranslationWithData(translationData);
                return;
            } else {
                console.log('Storageに翻訳データが見つかりません');
            }
        } catch (error) {
            console.error('Storage読み込みエラー:', error);
        }
    }

    // メッセージリスナーを設定（ポップアップからのメッセージを受信）
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('Received message:', request);
        
        if (request.action === 'ping') {
            console.log('Ping received, responding...');
            sendResponse({success: true});
            return true;
        }
        
        if (request.action === 'translate') {
            console.log('Received translation request from popup:', request);
            decodedText = request.text;
            
            // 原文を表示
            document.getElementById('originalText').textContent = decodedText;
            document.getElementById('originalCharCount').textContent = decodedText.length;
            
            // モデル情報を表示
            document.getElementById('modelInfo').textContent = `使用モデル: ${request.model}`;
            
            // 翻訳を実行
            performTranslationWithData(request);
            
            sendResponse({success: true});
            return true;
        }
    });

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
        // URLパラメータにテキストがない場合は、ストレージまたはメッセージを待つ
        console.log('URLパラメータなし、Storage確認またはメッセージ待機中...');
        
        // ストレージをチェック（URLパラメータのmethod=storageがない場合も対応）
        try {
            const result = await chrome.storage.local.get(['pendingTranslation']);
            const translationData = result.pendingTranslation;
            
            if (translationData) {
                console.log('Storageから翻訳データを発見:', translationData);
                
                // データをクリア
                await chrome.storage.local.remove(['pendingTranslation']);
                
                // 翻訳データを設定
                decodedText = translationData.text;
                
                // 原文を表示
                document.getElementById('originalText').textContent = decodedText;
                document.getElementById('originalCharCount').textContent = decodedText.length;
                
                // モデル情報を表示
                document.getElementById('modelInfo').textContent = `使用モデル: ${translationData.model}`;
                
                // 翻訳を実行
                await performTranslationWithData(translationData);
                return;
            }
        } catch (error) {
            console.error('Storage確認エラー:', error);
        }
        
        // ストレージにデータがない場合は、メッセージを待つ
        document.getElementById('originalText').textContent = '翻訳テキストの読み込み中...';
        document.getElementById('translatedText').textContent = '翻訳データを待機中...';
        document.getElementById('modelInfo').textContent = '使用モデル: 取得中...';
    }
});

// イベントリスナーを設定
function setupEventListeners() {
    document.getElementById('copyOriginalBtn').addEventListener('click', copyOriginal);
    document.getElementById('copyTranslatedBtn').addEventListener('click', copyTranslated);
}

// 翻訳関数は utils.js に移動しました

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

            // 翻訳実行（リトライ機能付き）
            const translatedText = await translateWithApiProvider(decodedText, apiUrl, apiKey, targetLanguage, finalModelName);
            console.log('Translation completed:', translatedText);

            // 翻訳結果を表示
            document.getElementById('translatedText').textContent = translatedText;
            document.getElementById('translatedCharCount').textContent = translatedText.length;
        } else {
            throw new Error('Chrome拡張機能のAPIにアクセスできません。この画面は拡張機能から開く必要があります。');
        }

    } catch (error) {
        console.error('翻訳エラー:', error);
        
        // エラーメッセージをフォーマット
        const formattedError = formatErrorMessage(error);
        let errorMessage = formattedError.message;
        
        if (formattedError.suggestions.length > 0) {
            errorMessage += '\n\n解決方法:\n• ' + formattedError.suggestions.join('\n• ');
        }
        
        document.getElementById('translatedText').innerHTML = `<div class="error">翻訳エラー: ${errorMessage}</div>`;
        document.getElementById('modelInfo').textContent = 'エラーが発生しました';
    }
}

// ポップアップから受信したデータで翻訳を実行
async function performTranslationWithData(data) {
    console.log('Starting translation with popup data...');
    document.getElementById('translatedText').textContent = '翻訳中...';

    try {
        // 翻訳実行（リトライ機能付き）
        const translatedText = await translateWithApiProvider(data.text, data.apiUrl, data.apiKey, data.targetLanguage, data.model);
        console.log('Translation completed:', translatedText);

        // 翻訳結果を表示
        document.getElementById('translatedText').textContent = translatedText;
        document.getElementById('translatedCharCount').textContent = translatedText.length;

    } catch (error) {
        console.error('翻訳エラー:', error);
        
        // エラーメッセージをフォーマット
        const formattedError = formatErrorMessage(error);
        let errorMessage = formattedError.message;
        
        if (formattedError.suggestions.length > 0) {
            errorMessage += '\n\n解決方法:\n• ' + formattedError.suggestions.join('\n• ');
        }
        
        document.getElementById('translatedText').innerHTML = `<div class="error">翻訳エラー: ${errorMessage}</div>`;
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
