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
                const translationUrl = chrome.runtime.getURL('translation_view.html') +
                    `?original=${encodeURIComponent(selectedText)}&model=${encodeURIComponent(modelName)}`;

                console.log('Opening translation tab with URL:', translationUrl);
                console.log('Selected text length:', selectedText.length);
                console.log('Model name:', modelName);

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

            // 翻訳を実行
            const translatedText = await translateText(selectedText, apiUrl, apiKey, targetLanguage || 'ja', modelName);

            // 結果をコンテンツスクリプトに送信
            chrome.tabs.sendMessage(tab.id, {
                action: "showTranslation",
                originalText: selectedText,
                translatedText: translatedText,
                model: modelName
            });

        } catch (error) {
            console.error('翻訳エラー:', error);
        }
    }
});

// LLM APIを使って翻訳する関数
async function translateText(text, apiUrl, apiKey, targetLanguage, model) {
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: "system",
                        content: `あなたは優秀な翻訳者です。与えられたテキストを${targetLanguage === 'ja' ? '日本語' : targetLanguage}に翻訳してください。翻訳結果のみを返してください。`
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                max_tokens: 1000,
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error ${response.status}: ${errorText}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const responseText = await response.text();
            throw new Error(`APIが正しいJSON形式で応答していません。レスポンス: ${responseText.substring(0, 200)}...`);
        }

        const data = await response.json();

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('APIレスポンスの形式が正しくありません');
        }

        return data.choices[0].message.content.trim();
    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            throw new Error('ネットワークエラー: API URLが正しいか確認してください');
        }
        throw error;
    }
}
