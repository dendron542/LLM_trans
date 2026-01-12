// Service worker imports utils.js.
importScripts('utils.js');

// Create context menu on install.
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
    chrome.contextMenus.create({
        id: "translate-text",
        title: "翻訳する",
        contexts: ["selection"]
    });
    console.log('Context menu created');
});

// Handle context menu click.
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== "translate-text") {
        return;
    }

    const selectedText = typeof info.selectionText === 'string'
        ? info.selectionText.trim()
        : '';
    if (!tab || typeof tab.id !== 'number') {
        console.warn('Right-click translate: invalid tab info');
        return;
    }

    console.log('Context menu clicked:', selectedText);

    try {
        // Ensure content script is loaded.
        try {
            await chrome.tabs.sendMessage(tab.id, { action: "ping" });
        } catch (error) {
            console.log('Content script not ready; injecting.');
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
            // Wait briefly then send message.
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (!selectedText) {
            chrome.tabs.sendMessage(tab.id, {
                action: "showError",
                message: "翻訳するテキストが選択されていません。翻訳したいテキストを選択してから右クリックしてください。"
            });
            return;
        }

        // Load settings.
        const result = await chrome.storage.sync.get([
            'apiUrl',
            'apiKey',
            'targetLanguage',
            'model',
            'customModel',
            'textLengthLimit'
        ]);
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

        // Determine model name.
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

        // Length limit (default: 200). Use new tab for long text.
        const lengthLimit = textLengthLimit || 200;
        if (selectedText.length > lengthLimit) {
            console.log('Opening translation tab for long text');
            console.log('Selected text length:', selectedText.length);
            console.log('Model name:', modelName);

            await chrome.storage.local.set({
                pendingTranslation: {
                    text: selectedText,
                    model: modelName,
                    apiUrl: apiUrl,
                    apiKey: apiKey,
                    targetLanguage: targetLanguage || 'ja'
                }
            });

            const translationUrl = chrome.runtime.getURL('translation_view.html') + '?method=storage';
            chrome.tabs.create({
                url: translationUrl,
                active: true
            });
            return;
        }

        // Show translating message.
        chrome.tabs.sendMessage(tab.id, {
            action: "showTranslating",
            originalText: selectedText
        });

        // Translate via API.
        const translatedText = await translateWithApiProvider(
            selectedText,
            apiUrl,
            apiKey,
            targetLanguage || 'ja',
            modelName
        );

        chrome.tabs.sendMessage(tab.id, {
            action: "showTranslation",
            originalText: selectedText,
            translatedText: translatedText,
            model: modelName
        });
    } catch (error) {
        console.error('Translation error:', error);

        const formattedError = formatErrorMessage(error);
        let errorMessage = formattedError.message;

        if (formattedError.suggestions.length > 0) {
            errorMessage += '\n\n解決方法:\n・ ' + formattedError.suggestions.join('\n・ ');
        }

        chrome.tabs.sendMessage(tab.id, {
            action: "showError",
            message: errorMessage,
            errorType: formattedError.type
        });
    }
});

// RateLimitError and formatErrorMessage are defined in utils.js.
// utils.js is imported via importScripts for the service worker.