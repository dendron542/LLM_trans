document.addEventListener('DOMContentLoaded', async () => {
    // 保存された設定を読み込み（UI言語も含む）
    const result = await chrome.storage.sync.get(['apiUrl', 'apiKey', 'targetLanguage', 'model', 'customModel', 'uiLanguage', 'textLengthLimit']);

    // UI言語の設定（デフォルトは日本語）
    const uiLang = result.uiLanguage || 'ja';
    if (document.getElementById('uiLanguage')) {
        document.getElementById('uiLanguage').value = uiLang;
    }

    // UI言語を適用
    updateUILanguage(uiLang);

    if (result.apiUrl) {
        document.getElementById('apiUrl').value = result.apiUrl;
    }
    if (result.apiKey) {
        document.getElementById('apiKey').value = result.apiKey;
    }
    if (result.targetLanguage) {
        document.getElementById('targetLanguage').value = result.targetLanguage;
    }
    if (result.model) {
        document.getElementById('model').value = result.model;
        // カスタムモデルの場合は入力フィールドを表示
        if (result.model === 'custom') {
            document.getElementById('customModelGroup').style.display = 'block';
            if (result.customModel) {
                document.getElementById('customModel').value = result.customModel;
            }
        }
    }
    // 文字数制限の設定（デフォルトは200文字）
    if (result.textLengthLimit) {
        document.getElementById('textLengthLimit').value = result.textLengthLimit;
    } else {
        document.getElementById('textLengthLimit').value = 200;
    }

    // UI言語変更のイベントリスナー
    document.getElementById('uiLanguage').addEventListener('change', function () {
        updateUILanguage(this.value);
        // 言語設定をすぐに保存
        chrome.storage.sync.set({ uiLanguage: this.value });
    });

    document.getElementById('model').addEventListener('change', function () {
        const customModelGroup = document.getElementById('customModelGroup');
        if (this.value === 'custom') {
            customModelGroup.style.display = 'block';
        } else {
            customModelGroup.style.display = 'none';
        }
    });

    // 翻訳セクションの初期化
    initializeTranslationSection();
    
    // カスタムモデル管理の初期化
    initializeCustomModelManagement();
});

// 保存ボタンのイベント
document.getElementById('save').addEventListener('click', async () => {
    const apiUrl = document.getElementById('apiUrl').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();
    const targetLanguage = document.getElementById('targetLanguage').value;
    const model = document.getElementById('model').value;
    const customModel = document.getElementById('customModel').value.trim();
    const uiLanguage = document.getElementById('uiLanguage').value;
    const textLengthLimit = parseInt(document.getElementById('textLengthLimit').value) || 200;

    // カスタムモデルが選択されているがモデル名が入力されていない場合
    if (model === 'custom' && !customModel) {
        showStatus(getTranslatedText('customModelRequired'), 'error');
        return;
    }

    try {
        // 設定を保存
        const settingsToSave = {
            targetLanguage: targetLanguage,
            model: model,
            uiLanguage: uiLanguage,
            textLengthLimit: textLengthLimit
        };

        // 入力されている項目のみ保存
        if (apiUrl) {
            settingsToSave.apiUrl = apiUrl;
        }
        if (apiKey) {
            settingsToSave.apiKey = apiKey;
        }
        if (model === 'custom' && customModel) {
            settingsToSave.customModel = customModel;
        }

        await chrome.storage.sync.set(settingsToSave);

        showStatus(getTranslatedText('settingsSaved'), 'success');
    } catch (error) {
        showStatus(getTranslatedText('settingsSaveFailed'), 'error');
    }
});

// ステータスメッセージを表示
function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;

    setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.className = '';
    }, 3000);
}

// 翻訳セクションの初期化
function initializeTranslationSection() {
    const inputText = document.getElementById('inputText');
    const translateBtn = document.getElementById('translateBtn');
    const translationResult = document.getElementById('translationResult');

    if (translateBtn) {
        // 翻訳ボタンのクリックイベント
        translateBtn.addEventListener('click', function () {
            const text = inputText.value.trim();
            if (text) {
                translateText(text);
            }
        });
    }

    const translateInTabBtn = document.getElementById('translateInTabBtn');
    if (translateInTabBtn) {
        // 新しいタブで翻訳ボタンのクリックイベント
        translateInTabBtn.addEventListener('click', function () {
            const text = inputText.value.trim();
            if (text) {
                translateInNewTab(text);
            }
        });
    } if (inputText) {
        // Ctrl+Enterキーで翻訳実行
        inputText.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault(); // デフォルトの動作を防ぐ
                const text = inputText.value.trim();
                if (text) {
                    translateText(text);
                }
            }
        });

        // 通常のEnterキーでも翻訳実行（オプション）
        inputText.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault(); // デフォルトの動作を防ぐ
                const text = inputText.value.trim();
                if (text) {
                    translateText(text);
                }
            }
        });
    }    // 翻訳実行関数
    async function translateText(text) {
        if (!translationResult) return;

        console.log('翻訳開始:', text); // デバッグログ
        translationResult.textContent = getTranslatedText('translating');

        try {
            // 設定を取得
            const result = await chrome.storage.sync.get(['apiUrl', 'apiKey', 'targetLanguage', 'model', 'customModel']);
            const { apiUrl, apiKey, targetLanguage, model, customModel } = result;

            console.log('取得した設定:', result); // デバッグログ

            if (!apiUrl || !apiKey) {
                translationResult.textContent = getTranslatedText('apiSettingsRequired');
                return;
            }

            // モデル名を決定
            let modelName = model || 'gpt-3.5-turbo';
            if (model === 'custom' && customModel) {
                modelName = customModel;
            } else if (model === 'custom' && !customModel) {
                translationResult.textContent = getTranslatedText('customModelRequired');
                return;
            }

            console.log('使用するモデル:', modelName); // デバッグログ

            // 翻訳実行
            const translation = await translateWithApiProvider(text, apiUrl, apiKey, targetLanguage || 'ja', modelName);
            translationResult.textContent = translation;

        } catch (error) {
            console.error('翻訳エラー:', error); // デバッグログ
            
            // エラーメッセージをフォーマット
            const formattedError = formatErrorMessage(error);
            let errorMessage = formattedError.message;
            
            if (formattedError.suggestions.length > 0) {
                errorMessage += '\n\n解決方法:\n• ' + formattedError.suggestions.join('\n• ');
            }
            
            translationResult.textContent = getTranslatedText('translationError') + ': ' + errorMessage;
        }
    }

    // 新しいタブで翻訳実行関数
    async function translateInNewTab(text) {
        console.log('新しいタブで翻訳開始:', text); // デバッグログ

        try {
            // 設定を取得
            const result = await chrome.storage.sync.get(['apiUrl', 'apiKey', 'targetLanguage', 'model', 'customModel']);
            const { apiUrl, apiKey, targetLanguage, model, customModel } = result;

            console.log('取得した設定:', result); // デバッグログ

            if (!apiUrl || !apiKey) {
                alert(getTranslatedText('apiSettingsRequired'));
                return;
            }

            // モデル名を決定
            let modelName = model || 'gpt-3.5-turbo';
            if (model === 'custom' && customModel) {
                modelName = customModel;
            } else if (model === 'custom' && !customModel) {
                alert(getTranslatedText('customModelRequired'));
                return;
            }

            console.log('使用するモデル:', modelName); // デバッグログ

            // 翻訳データを一時的にstorageに保存
            const translationData = {
                text: text,
                apiUrl: apiUrl,
                apiKey: apiKey,
                targetLanguage: targetLanguage || 'ja',
                model: modelName,
                timestamp: Date.now()
            };
            
            console.log('翻訳データをstorageに保存:', translationData);
            await chrome.storage.local.set({ pendingTranslation: translationData });

            // 新しいタブでtranslation_view.htmlを開く
            chrome.tabs.create({
                url: chrome.runtime.getURL('translation_view.html?method=storage')
            }, async (tab) => {
                console.log('新しいタブを作成しました:', tab.id);
                
                // バックアップとしてメッセージも送信を試行
                setTimeout(async () => {
                    try {
                        console.log('バックアップメッセージを送信中...');
                        await chrome.tabs.sendMessage(tab.id, {
                            action: 'translate',
                            text: text,
                            apiUrl: apiUrl,
                            apiKey: apiKey,
                            targetLanguage: targetLanguage || 'ja',
                            model: modelName
                        });
                        console.log('バックアップメッセージ送信成功');
                    } catch (error) {
                        console.log('バックアップメッセージ送信失敗（問題なし）:', error.message);
                    }
                }, 1000);
            });

        } catch (error) {
            console.error('新しいタブで翻訳エラー:', error); // デバッグログ
            
            // エラーメッセージをフォーマット
            const formattedError = formatErrorMessage(error);
            let errorMessage = formattedError.message;
            
            if (formattedError.suggestions.length > 0) {
                errorMessage += '\n\n解決方法:\n• ' + formattedError.suggestions.join('\n• ');
            }
            
            alert(getTranslatedText('translationError') + ': ' + errorMessage);
        }
    }
}

// RateLimitError と formatErrorMessage は utils.js で定義されています

// テスト接続ボタンのイベント
document.getElementById('testConnection').addEventListener('click', async () => {
    const apiUrl = document.getElementById('apiUrl').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();
    const model = document.getElementById('model').value;
    const customModel = document.getElementById('customModel').value.trim();
    const testResult = document.getElementById('testResult');

    if (!apiUrl || !apiKey) {
        showTestResult('API URLとAPIキーを入力してください', 'error');
        return;
    }

    // API URL検証
    const urlValidation = validateApiUrl(apiUrl);
    if (!urlValidation.isValid) {
        showTestResult(urlValidation.message, 'error');
        return;
    }

    // モデル名を決定
    let modelName = model || 'gpt-3.5-turbo';
    if (model === 'custom') {
        if (!customModel) {
            showTestResult('カスタムモデル名を入力してください', 'error');
            return;
        }
        modelName = customModel;
    }

    showTestResult('接続をテスト中...', 'info');

    try {
        const testText = 'Hello';
        const translation = await translateWithApiProvider(testText, apiUrl, apiKey, 'ja', modelName);
        showTestResult(`接続成功！テスト翻訳: "${testText}" → "${translation}"`, 'success');
    } catch (error) {
        let errorMessage = 'テスト失敗: ' + error.message;

        // より詳細なエラー情報を提供
        if (error.message.includes('Failed to fetch')) {
            errorMessage += '\n\n考えられる原因:\n- API URLが間違っている\n- ネットワーク接続の問題\n- CORSエラー';
        } else if (error.message.includes('401')) {
            errorMessage += '\n\n原因: APIキーが無効です';
        } else if (error.message.includes('403')) {
            errorMessage += '\n\n原因: APIへのアクセスが拒否されました（APIキーの権限不足）';
        } else if (error.message.includes('404')) {
            errorMessage += '\n\n原因: APIエンドポイントが見つかりません（URL確認）';
        } else if (error.message.includes('JSON')) {
            errorMessage += '\n\n原因: 入力されたURLはWebサイトのページを指しています。\n正しいAPI エンドポイントを入力してください。\n\n例:\n- OpenAI: https://api.openai.com/v1/chat/completions\n- Claude: https://api.anthropic.com/v1/messages';
        }

        showTestResult(errorMessage, 'error');
    }
});

// API URL検証関数
function validateApiUrl(url) {
    try {
        const urlObj = new URL(url);

        // 一般的なWebサイトのURLパターンをチェック
        if (urlObj.pathname === '/' || urlObj.pathname === '' ||
            urlObj.pathname.endsWith('.html') || urlObj.pathname.endsWith('.php') ||
            urlObj.hostname.includes('github.io') || urlObj.hostname.includes('vercel.app') ||
            urlObj.hostname.includes('netlify.app')) {
            return {
                isValid: false,
                message: 'エラー: WebサイトのURLが入力されています。\n\nAPI エンドポイントを入力してください:\n\n• OpenAI: https://api.openai.com/v1/chat/completions\n• Claude: https://api.anthropic.com/v1/messages\n• Azure OpenAI: https://[resource].openai.azure.com/openai/deployments/[deployment]/chat/completions?api-version=2023-12-01-preview'
            };
        }

        // APIエンドポイントらしいかチェック
        const isApiLike = urlObj.pathname.includes('/api/') ||
            urlObj.pathname.includes('/v1/') ||
            urlObj.pathname.includes('chat/completions') ||
            urlObj.pathname.includes('messages') ||
            urlObj.hostname.includes('api.');

        if (!isApiLike) {
            return {
                isValid: false,
                message: '警告: このURLはAPIエンドポイントのように見えません。\n\n正しいAPI URLを確認してください。'
            };
        }

        return { isValid: true };
    } catch (e) {
        return {
            isValid: false,
            message: 'エラー: 有効なURLではありません。\n\nhttps:// または http:// で始まる完全なURLを入力してください。'
        };
    }
}

function showTestResult(message, type) {
    const testResult = document.getElementById('testResult');
    testResult.style.display = 'block';
    testResult.textContent = message;
    testResult.className = `test-result ${type}`;

    if (type === 'success') {
        testResult.style.background = '#d4edda';
        testResult.style.color = '#155724';
        testResult.style.border = '1px solid #c3e6cb';
    } else if (type === 'error') {
        testResult.style.background = '#f8d7da';
        testResult.style.color = '#721c24';
        testResult.style.border = '1px solid #f5c6cb';
    } else {
        testResult.style.background = '#d1ecf1';
        testResult.style.color = '#0c5460';
        testResult.style.border = '1px solid #bee5eb';
    }
}

// API URL クイック選択機能
function setApiUrl(url) {
    document.getElementById('apiUrl').value = url;
}

// グローバルに関数を公開
window.setApiUrl = setApiUrl;

// カスタムモデル管理機能
// UUID生成関数
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// カスタムモデル配列を取得
async function getCustomModels() {
    const result = await chrome.storage.sync.get(['customModels']);
    return result.customModels || [];
}

// カスタムモデル配列を保存
async function saveCustomModels(customModels) {
    await chrome.storage.sync.set({ customModels });
}

// カスタムモデルを追加
async function addCustomModel(modelName, displayName = null) {
    const customModels = await getCustomModels();
    const newModel = {
        id: generateUUID(),
        name: modelName.trim(),
        displayName: displayName ? displayName.trim() : modelName.trim()
    };
    
    // 重複チェック
    const exists = customModels.some(model => model.name === newModel.name);
    if (exists) {
        throw new Error(getTranslatedText('modelNameExists'));
    }
    
    customModels.push(newModel);
    await saveCustomModels(customModels);
    return newModel;
}

// カスタムモデルを削除
async function deleteCustomModel(modelId) {
    const customModels = await getCustomModels();
    const filteredModels = customModels.filter(model => model.id !== modelId);
    await saveCustomModels(filteredModels);
}

// カスタムモデルを更新
async function updateCustomModel(modelId, modelName, displayName = null) {
    const customModels = await getCustomModels();
    const modelIndex = customModels.findIndex(model => model.id === modelId);
    
    if (modelIndex === -1) {
        throw new Error('モデルが見つかりません');
    }
    
    // 他のモデルとの重複チェック（自分以外）
    const exists = customModels.some((model, index) => 
        index !== modelIndex && model.name === modelName.trim());
    if (exists) {
        throw new Error(getTranslatedText('modelNameExists'));
    }
    
    customModels[modelIndex] = {
        ...customModels[modelIndex],
        name: modelName.trim(),
        displayName: displayName ? displayName.trim() : modelName.trim()
    };
    
    await saveCustomModels(customModels);
    return customModels[modelIndex];
}

// 多言語対応のための翻訳データ
const translations = {
    ja: {
        // セクション
        translationSection: 'LLM翻訳',
        settingsSection: 'LLM翻訳設定',
        troubleshootingSection: 'トラブルシューティング',        // フィールドラベル
        uiLanguageLabel: 'UI言語:',
        apiUrlLabel: 'API URL:',
        apiKeyLabel: 'APIキー:',
        modelLabel: 'モデル:',
        customModelLabel: 'カスタムモデル名:',
        targetLanguageLabel: '翻訳先言語:',
        textLengthLimitLabel: 'テキスト長制限:',

        // ボタン
        translateBtn: '翻訳する',
        translateInTabBtn: '新しいタブで翻訳',
        testConnectionBtn: '設定をテスト',
        saveBtn: '設定を保存',
        openaiBtn: 'OpenAI',
        claudeBtn: 'Claude',        // プレースホルダー
        inputPlaceholder: '翻訳したいテキストを入力してください... (Enterまたはボタンで翻訳)',
        customModelPlaceholder: 'モデル名を入力',

        // メッセージ
        translationResult: '翻訳結果:',
        rightClickMessage: '選択したテキストを右クリックで翻訳、または上の入力欄にテキストを入力してください。',
        customModelRequired: 'カスタムモデル名を入力してください',
        settingsSaved: '設定が保存されました',
        settingsSaveFailed: '設定の保存に失敗しました',
        translating: '翻訳中...',
        apiSettingsRequired: 'API URLまたはAPIキーが設定されていません。下の設定セクションで設定してください。',
        translationError: '翻訳エラー',        // ヘルプテキスト
        uiLanguageHelp: '拡張機能の表示言語を選択してください',
        modelHelp: '使用するLLMモデルを選択してください',
        customModelHelp: 'APIプロバイダーのモデル名を正確に入力してください',
        textLengthLimitHelp: 'この文字数を超えるテキストは別タブで表示されます（デフォルト: 200文字）',
        apiExamples: '主なAPI URL例:',

        // 言語オプション
        japanese: '日本語',
        english: '英語',
        chinese: '中国語',
        korean: '韓国語',
        french: 'フランス語',
        german: 'ドイツ語',
        spanish: 'スペイン語',

        // トラブルシューティング
        contextMenuTrouble: '右クリックメニューが表示されない場合:',
        contextMenuSteps: '1. ページをリロード (F5)<br>2. 拡張機能を無効化→有効化<br>3. Chromeを再起動',
        translationTrouble: '翻訳が実行されない場合:',
        translationSteps: '1. テキストを選択してから右クリック<br>2. 開発者ツール (F12) のConsoleでエラー確認<br>3. 設定をテストボタンで接続確認',

        // カスタムモデル管理
        customModelManagement: 'カスタムモデル管理',
        addModelBtn: 'モデルを追加',
        savedModels: '保存済みモデル:',
        noSavedModels: 'カスタムモデルが保存されていません',
        selectBtn: '選択',
        deleteBtn: '削除',
        modelNamePlaceholder: 'モデル名 (例: claude-3-opus)',
        displayNamePlaceholder: '表示名 (例: Claude 3 Opus)',
        enterModelName: 'モデル名を入力してください',
        modelAdded: 'カスタムモデルを追加しました',
        modelSelected: 'を選択しました',
        confirmDelete: 'このカスタムモデルを削除しますか？',
        modelDeleted: 'カスタムモデルを削除しました',
        modelNameExists: 'モデル名が既に存在します'
    },
    en: {
        // セクション
        translationSection: 'LLM Translation',
        settingsSection: 'LLM Translation Settings',
        troubleshootingSection: 'Troubleshooting',        // フィールドラベル
        uiLanguageLabel: 'UI Language:',
        apiUrlLabel: 'API URL:',
        apiKeyLabel: 'API Key:',
        modelLabel: 'Model:',
        customModelLabel: 'Custom Model Name:',
        targetLanguageLabel: 'Target Language:',
        textLengthLimitLabel: 'Text Length Limit:',

        // ボタン
        translateBtn: 'Translate',
        translateInTabBtn: 'Translate in New Tab',
        testConnectionBtn: 'Test Settings',
        saveBtn: 'Save Settings',
        openaiBtn: 'OpenAI',
        claudeBtn: 'Claude',        // プレースホルダー
        inputPlaceholder: 'Enter text to translate... (Enter or button to translate)',
        customModelPlaceholder: 'Enter model name',

        // メッセージ
        translationResult: 'Translation Result:',
        rightClickMessage: 'Right-click on selected text to translate, or enter text in the area above.',
        customModelRequired: 'Please enter custom model name',
        settingsSaved: 'Settings saved successfully',
        settingsSaveFailed: 'Failed to save settings',
        translating: 'Translating...',
        apiSettingsRequired: 'API URL or API key not configured. Please set them in the settings section below.',
        translationError: 'Translation Error',        // ヘルプテキスト
        uiLanguageHelp: 'Select the display language for the extension',
        modelHelp: 'Select the LLM model to use',
        customModelHelp: 'Enter the exact model name from your API provider',
        textLengthLimitHelp: 'Text longer than this limit will be displayed in a separate tab (Default: 200 characters)',
        apiExamples: 'Common API URL examples:',

        // 言語オプション
        japanese: 'Japanese',
        english: 'English',
        chinese: 'Chinese',
        korean: 'Korean',
        french: 'French',
        german: 'German',
        spanish: 'Spanish',

        // トラブルシューティング
        contextMenuTrouble: 'If context menu doesn\'t appear:',
        contextMenuSteps: '1. Reload page (F5)<br>2. Disable and re-enable extension<br>3. Restart Chrome',
        translationTrouble: 'If translation doesn\'t work:',
        translationSteps: '1. Select text before right-clicking<br>2. Check Console in Developer Tools (F12)<br>3. Test connection with Test Settings button',

        // カスタムモデル管理
        customModelManagement: 'Custom Model Management',
        addModelBtn: 'Add Model',
        savedModels: 'Saved Models:',
        noSavedModels: 'No custom models saved',
        selectBtn: 'Select',
        deleteBtn: 'Delete',
        modelNamePlaceholder: 'Model name (e.g., claude-3-opus)',
        displayNamePlaceholder: 'Display name (e.g., Claude 3 Opus)',
        enterModelName: 'Please enter model name',
        modelAdded: 'Custom model added successfully',
        modelSelected: ' selected',
        confirmDelete: 'Are you sure you want to delete this custom model?',
        modelDeleted: 'Custom model deleted successfully',
        modelNameExists: 'Model name already exists'
    }
};

let currentLanguage = 'ja';

// 翻訳テキストを取得する関数
function getTranslatedText(key) {
    return translations[currentLanguage] && translations[currentLanguage][key]
        ? translations[currentLanguage][key]
        : translations['ja'][key] || key;
}

// UI言語を更新する関数
function updateUILanguage(lang) {
    currentLanguage = lang;
    const t = translations[lang] || translations['ja'];

    // セクションタイトル
    const translationSection = document.querySelector('#translationSection h3');
    if (translationSection) translationSection.textContent = t.translationSection;

    const settingsSection = document.querySelector('#settingsSection h3');
    if (settingsSection) settingsSection.textContent = t.settingsSection;

    const troubleshootingSection = document.querySelector('#troubleshootingSection h3');
    if (troubleshootingSection) troubleshootingSection.textContent = t.troubleshootingSection;

    // ラベル
    const uiLanguageLabel = document.querySelector('label[for="uiLanguage"]');
    if (uiLanguageLabel) uiLanguageLabel.textContent = t.uiLanguageLabel;

    const apiUrlLabel = document.querySelector('label[for="apiUrl"]');
    if (apiUrlLabel) apiUrlLabel.textContent = t.apiUrlLabel;

    const apiKeyLabel = document.querySelector('label[for="apiKey"]');
    if (apiKeyLabel) apiKeyLabel.textContent = t.apiKeyLabel;

    const modelLabel = document.querySelector('label[for="model"]');
    if (modelLabel) modelLabel.textContent = t.modelLabel;

    const customModelLabel = document.querySelector('label[for="customModel"]');
    if (customModelLabel) customModelLabel.textContent = t.customModelLabel; const targetLanguageLabel = document.querySelector('label[for="targetLanguage"]');
    if (targetLanguageLabel) targetLanguageLabel.textContent = t.targetLanguageLabel;

    const textLengthLimitLabel = document.querySelector('label[for="textLengthLimit"]');
    if (textLengthLimitLabel) textLengthLimitLabel.textContent = t.textLengthLimitLabel;

    // ボタン
    const translateBtn = document.getElementById('translateBtn');
    if (translateBtn) translateBtn.textContent = t.translateBtn;

    const translateInTabBtn = document.getElementById('translateInTabBtn');
    if (translateInTabBtn) translateInTabBtn.textContent = t.translateInTabBtn;

    const testConnectionBtn = document.getElementById('testConnection');
    if (testConnectionBtn) testConnectionBtn.textContent = t.testConnectionBtn;

    const saveBtn = document.getElementById('save');
    if (saveBtn) saveBtn.textContent = t.saveBtn;

    // プレースホルダー
    const inputText = document.getElementById('inputText');
    if (inputText) inputText.placeholder = t.inputPlaceholder;

    const customModel = document.getElementById('customModel');
    if (customModel) customModel.placeholder = t.customModelPlaceholder;

    // 翻訳結果ラベル
    const resultLabel = document.querySelector('.result-section strong');
    if (resultLabel) resultLabel.textContent = t.translationResult;
    // デフォルトメッセージ
    const translationResult = document.getElementById('translationResult');
    if (translationResult) {
        const currentText = translationResult.textContent;
        // 初期メッセージかどうかを判定
        if (currentText === translations['ja'].rightClickMessage ||
            currentText === translations['en'].rightClickMessage ||
            currentText === '右クリックでテキストを選択して翻訳するか、上のテキストエリアに入力してください。' ||
            currentText === 'Right-click on selected text to translate, or enter text in the area above.') {
            translationResult.textContent = t.rightClickMessage;
        }
    }

    // ヘルプテキスト
    updateHelpTexts(t);

    // トラブルシューティング
    updateTroubleshootingSection(t);

    // 翻訳先言語のオプションを更新
    updateTargetLanguageOptions(t);
    
    // カスタムモデル管理の翻訳を更新
    updateCustomModelManagementLabels(t);
}

function updateHelpTexts(t) {
    // UI言語のヘルプテキスト
    const uiLanguageHelp = document.querySelector('#uiLanguage').parentElement.querySelector('.help-text');
    if (uiLanguageHelp) uiLanguageHelp.textContent = t.uiLanguageHelp;

    // モデルのヘルプテキスト
    const modelHelp = document.querySelector('#model').parentElement.querySelector('.help-text');
    if (modelHelp) modelHelp.textContent = t.modelHelp;    // カスタムモデルのヘルプテキスト
    const customModelHelp = document.querySelector('#customModel').parentElement.querySelector('.help-text');
    if (customModelHelp) customModelHelp.textContent = t.customModelHelp;

    // テキスト長制限のヘルプテキスト
    const textLengthLimitHelp = document.querySelector('#textLengthLimit').parentElement.querySelector('.help-text');
    if (textLengthLimitHelp) textLengthLimitHelp.textContent = t.textLengthLimitHelp;

    // API URLのヘルプテキスト
    const apiUrlHelp = document.querySelector('#apiUrl').parentElement.querySelector('.help-text');
    if (apiUrlHelp && (apiUrlHelp.innerHTML.includes('主なAPI URL例:') || apiUrlHelp.innerHTML.includes('Common API URL examples:'))) {
        const code1 = 'https://api.openai.com/v1/chat/completions';
        const code2 = 'https://api.anthropic.com/v1/messages';
        const code3 = 'https://your-resource.openai.azure.com/openai/deployments/your-deployment/chat/completions?api-version=2023-12-01-preview';
        const code4 = 'http://localhost:11434/api/chat';

        apiUrlHelp.innerHTML = `
            <strong>${t.apiExamples}</strong><br>
            • OpenAI: <code>${code1}</code><br>
            • Anthropic Claude: <code>${code2}</code><br>
            • Azure OpenAI: <code>${code3}</code><br>
            • ${currentLanguage === 'ja' ? 'ローカルLLM (Ollama)' : 'Local LLM (Ollama)'}: <code>${code4}</code>
        `;
    }
}

function updateTargetLanguageOptions(t) {
    const targetLanguageSelect = document.getElementById('targetLanguage');
    if (!targetLanguageSelect) return;

    const currentValue = targetLanguageSelect.value;
    const options = targetLanguageSelect.querySelectorAll('option');

    options.forEach(option => {
        switch (option.value) {
            case 'ja': option.textContent = t.japanese; break;
            case 'en': option.textContent = t.english; break;
            case 'zh': option.textContent = t.chinese; break;
            case 'ko': option.textContent = t.korean; break;
            case 'fr': option.textContent = t.french; break;
            case 'de': option.textContent = t.german; break;
            case 'es': option.textContent = t.spanish; break;
        }
    });

    targetLanguageSelect.value = currentValue;
}

function updateTroubleshootingSection(t) {
    const troubleDiv = document.querySelector('#troubleshootingSection .help-text');
    if (troubleDiv) {
        troubleDiv.innerHTML = `
            <strong>${t.contextMenuTrouble}</strong><br>
            ${t.contextMenuSteps}<br><br>
            
            <strong>${t.translationTrouble}</strong><br>
            ${t.translationSteps}
        `;
    }
}

// カスタムモデル管理の翻訳を更新
function updateCustomModelManagementLabels(t) {
    // タイトル
    const managementTitle = document.querySelector('#customModelManagement h4');
    if (managementTitle) {
        managementTitle.textContent = t.customModelManagement;
    }
    
    // 追加ボタン
    const addBtn = document.getElementById('addCustomModelBtn');
    if (addBtn) {
        addBtn.textContent = t.addModelBtn;
    }
    
    // プレースホルダー
    const modelNameInput = document.getElementById('newCustomModelName');
    if (modelNameInput) {
        modelNameInput.placeholder = t.modelNamePlaceholder;
    }
    
    const displayNameInput = document.getElementById('newCustomModelDisplayName');
    if (displayNameInput) {
        displayNameInput.placeholder = t.displayNamePlaceholder;
    }
    
    // 保存済みモデル見出し
    const savedModelsLabel = document.querySelector('.saved-models-section div[style*="font-weight: bold"]');
    if (savedModelsLabel) {
        savedModelsLabel.textContent = t.savedModels;
    }
    
    // 保存済みモデル一覧を再描画（翻訳更新のため）
    refreshSavedModelsList();
}

// カスタムモデル管理の初期化
async function initializeCustomModelManagement() {
    try {
        // 保存済みモデル一覧を表示
        await refreshSavedModelsList();

        // 新規モデル追加ボタンのイベントリスナー
        const addCustomModelBtn = document.getElementById('addCustomModelBtn');
        if (addCustomModelBtn) {
            addCustomModelBtn.addEventListener('click', handleAddCustomModel);
        }
    } catch (error) {
        console.error('カスタムモデル管理の初期化エラー:', error);
        showStatus('カスタムモデル管理の初期化に失敗しました', 'error');
    }
}

// 保存済みモデル一覧を更新表示
async function refreshSavedModelsList() {
    try {
        const customModels = await getCustomModels();
        const listContainer = document.getElementById('savedCustomModelsList');

        if (!listContainer) return;

        // 一覧をクリア
        listContainer.innerHTML = '';

        if (customModels.length === 0) {
            const noModelsDiv = document.createElement('div');
            noModelsDiv.className = 'no-saved-models';
            noModelsDiv.textContent = getTranslatedText('noSavedModels');
            listContainer.appendChild(noModelsDiv);
            return;
        }

        // 各モデルのアイテムを作成
        customModels.forEach(model => {
            const modelItem = createSavedModelItem(model);
            listContainer.appendChild(modelItem);
        });
    } catch (error) {
        console.error('モデル一覧の更新エラー:', error);
        // エラーが発生しても継続（ユーザーには表示しない）
    }
}

// 保存済みモデルアイテムのHTML要素を作成
function createSavedModelItem(model) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'saved-model-item';
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'saved-model-info';
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'saved-model-name';
    nameDiv.textContent = model.name;
    
    const displayNameDiv = document.createElement('div');
    displayNameDiv.className = 'saved-model-display-name';
    displayNameDiv.textContent = model.displayName;
    
    infoDiv.appendChild(nameDiv);
    infoDiv.appendChild(displayNameDiv);
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'saved-model-actions';
    
    // 選択ボタン
    const selectBtn = document.createElement('button');
    selectBtn.className = 'saved-model-select-btn';
    selectBtn.textContent = getTranslatedText('selectBtn');
    selectBtn.type = 'button';
    selectBtn.addEventListener('click', () => selectCustomModel(model));
    
    // 削除ボタン
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'saved-model-delete-btn';
    deleteBtn.textContent = getTranslatedText('deleteBtn');
    deleteBtn.type = 'button';
    deleteBtn.addEventListener('click', () => handleDeleteCustomModel(model.id));
    
    actionsDiv.appendChild(selectBtn);
    actionsDiv.appendChild(deleteBtn);
    
    itemDiv.appendChild(infoDiv);
    itemDiv.appendChild(actionsDiv);
    
    return itemDiv;
}

// 新規カスタムモデル追加のハンドラー
async function handleAddCustomModel() {
    const nameInput = document.getElementById('newCustomModelName');
    const displayNameInput = document.getElementById('newCustomModelDisplayName');
    
    if (!nameInput || !displayNameInput) return;
    
    const modelName = nameInput.value.trim();
    const displayName = displayNameInput.value.trim();
    
    if (!modelName) {
        showStatus(getTranslatedText('enterModelName'), 'error');
        return;
    }
    
    try {
        await addCustomModel(modelName, displayName || modelName);
        
        // 入力フィールドをクリア
        nameInput.value = '';
        displayNameInput.value = '';
        
        // 一覧を更新
        await refreshSavedModelsList();
        
        showStatus(getTranslatedText('modelAdded'), 'success');
    } catch (error) {
        showStatus('エラー: ' + error.message, 'error');
    }
}

// カスタムモデル選択のハンドラー
async function selectCustomModel(model) {
    // モデル選択を「custom」に設定
    const modelSelect = document.getElementById('model');
    if (modelSelect) {
        modelSelect.value = 'custom';

        // カスタムモデル入力フィールドを表示
        const customModelGroup = document.getElementById('customModelGroup');
        if (customModelGroup) {
            customModelGroup.style.display = 'block';
        }

        // カスタムモデル名を設定
        const customModelInput = document.getElementById('customModel');
        if (customModelInput) {
            customModelInput.value = model.name;
        }
    }

    try {
        // 自動的にstorageに保存
        await chrome.storage.sync.set({
            model: 'custom',
            customModel: model.name
        });

        showStatus(`"${model.displayName}"${getTranslatedText('modelSelected')}`, 'success');
    } catch (error) {
        console.error('モデル選択の保存エラー:', error);
        showStatus('モデル選択の保存に失敗しました。「設定を保存」ボタンを押してください。', 'error');
    }
}

// カスタムモデル削除のハンドラー
async function handleDeleteCustomModel(modelId) {
    if (!confirm(getTranslatedText('confirmDelete'))) {
        return;
    }
    
    try {
        await deleteCustomModel(modelId);
        await refreshSavedModelsList();
        showStatus(getTranslatedText('modelDeleted'), 'success');
    } catch (error) {
        showStatus('エラー: ' + error.message, 'error');
    }
}
