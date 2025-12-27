// Service Workerでutils.jsをインポート
importScripts('utils.js');

// 右クリックメニューを作成
chrome.runtime.onInstalled.addListener(() => {
    console.log('LLM翻訳拡張機能がインストールされました');
    chrome.contextMenus.create({
        id: "translate-text",
        title: "選択したテキストを翻訳",
        contexts: ["selection"]
    });
    console.log('コンテキストメニューが作成されました');
});

// 右クリックメニューがクリックされた時の処理
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "translate-text") {
        const selectedText = info.selectionText;

        console.log('コンテキストメニューがクリックされました:', selectedText);

        try {
            // Content scriptが読み込まれているかチェック
            try {
                await chrome.tabs.sendMessage(tab.id, { action: "ping" });
            } catch (error) {
                console.log('Content script未読み込み、注入します');
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                // 少し待ってからメッセージを送信
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // 設定からAPI情報を取得
            const result = await chrome.storage.sync.get(['apiUrl', 'apiKey', 'targetLanguage', 'model', 'customModel', 'textLengthLimit']);
            const { apiUrl, apiKey, targetLanguage, model, customModel, textLengthLimit } = result;

            if (!apiUrl || !apiKey) {
                let errorMessage = "設定が不完全です: ";
                const missing = [];
                if (!apiUrl) missing.push("API URL");
                if (!apiKey) missing.push("APIキー");
                errorMessage += missing.join("と") + "を設定してください。\n\n拡張機能のアイコンをクリックして設定を行ってください。";

                chrome.tabs.sendMessage(tab.id, {
                    action: "showError",
                    message: errorMessage
                });
                return;
            }

            // モデル名を決定
            let modelName = model || 'gpt-3.5-turbo';
            if (model === 'custom' && customModel) {
                modelName = customModel;
            } else if (model === 'custom' && !customModel) {
                chrome.tabs.sendMessage(tab.id, {
                    action: "showError",
                    message: "カスタムモデル名が設定されていません"
                });
                return;
            }

            // 文字数制限をチェック（デフォルトは200文字）
            const lengthLimit = textLengthLimit || 200; if (selectedText.length > lengthLimit) {
                // 文字数が制限を超える場合、新しいタブで表示
                console.log('Opening translation tab for long text');
                console.log('Selected text length:', selectedText.length);
                console.log('Model name:', modelName);

                // 翻訳データをStorageに保存
                await chrome.storage.local.set({
                    pendingTranslation: {
                        text: selectedText,
                        model: modelName,
                        apiUrl: apiUrl,
                        apiKey: apiKey,
                        targetLanguage: targetLanguage || 'ja'
                    }
                });

                // タブを開く（storage方式）
                const translationUrl = chrome.runtime.getURL('translation_view.html') + '?method=storage';
                chrome.tabs.create({
                    url: translationUrl,
                    active: true
                });
                return;
            }

            // 文字数が制限以下の場合、従来通りポップアップで表示
            // 翻訳中メッセージを表示
            chrome.tabs.sendMessage(tab.id, {
                action: "showTranslating",
                originalText: selectedText
            });

            // 翻訳を実行（utils.jsは既にimportScriptsで読み込み済み）
            const translatedText = await translateWithApiProvider(selectedText, apiUrl, apiKey, targetLanguage || 'ja', modelName);

            // 結果をコンテンツスクリプトに送信
            chrome.tabs.sendMessage(tab.id, {
                action: "showTranslation",
                originalText: selectedText,
                translatedText: translatedText,
                model: modelName
            });

        } catch (error) {
            console.error('翻訳エラー:', error);
            
            // エラーメッセージをフォーマット
            const formattedError = formatErrorMessage(error);
            let errorMessage = formattedError.message;
            
            if (formattedError.suggestions.length > 0) {
                errorMessage += '\n\n解決方法:\n• ' + formattedError.suggestions.join('\n• ');
            }
            
            // ユーザーにエラーを通知
            chrome.tabs.sendMessage(tab.id, {
                action: "showError",
                message: errorMessage,
                errorType: formattedError.type
            });
        }
    }
});

// RateLimitError と formatErrorMessage は utils.js で定義されています
// utils.jsはservice workerでimportして使用
