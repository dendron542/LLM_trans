// 翻訳API共通ユーティリティ関数

// API プロバイダー別の設定と処理
class ApiProvider {
    constructor(apiUrl) {
        this.apiUrl = apiUrl;
        this.provider = this.detectProvider(apiUrl);
    }

    detectProvider(url) {
        if (url.includes('api.openai.com')) return 'openai';
        if (url.includes('api.anthropic.com')) return 'claude';
        if (url.includes('openrouter.ai')) return 'openrouter';
        if (url.includes('azure.com')) return 'azure';
        if (url.includes('localhost') || url.includes('127.0.0.1')) return 'local';
        return 'generic'; // デフォルトはOpenAI互換
    }

    buildRequest(model, messages, options = {}) {
        const baseRequest = {
            model: model,
            temperature: options.temperature || 0.3,
            max_tokens: options.max_tokens || (model.includes('gpt-4') ? 2000 : 1000)
        };

        switch (this.provider) {
            case 'claude':
                return {
                    model: model,
                    messages: messages,
                    max_tokens: baseRequest.max_tokens,
                    temperature: baseRequest.temperature
                };
                
            case 'openai':
            case 'openrouter':
            case 'azure':
            case 'local':
            case 'generic':
            default:
                return {
                    ...baseRequest,
                    messages: messages
                };
        }
    }

    buildHeaders(apiKey) {
        const baseHeaders = {
            'Content-Type': 'application/json'
        };

        switch (this.provider) {
            case 'claude':
                return {
                    ...baseHeaders,
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                };
                
            case 'openai':
            case 'openrouter':
            case 'azure':
            case 'local':
            case 'generic':
            default:
                return {
                    ...baseHeaders,
                    'Authorization': `Bearer ${apiKey}`
                };
        }
    }

    extractResponse(data) {
        switch (this.provider) {
            case 'claude':
                if (data.content && data.content[0] && data.content[0].text) {
                    return data.content[0].text.trim();
                }
                throw new Error('Claude APIレスポンスの形式が正しくありません');
                
            case 'openai':
            case 'openrouter':
            case 'azure':
            case 'local':
            case 'generic':
            default:
                if (data.choices && data.choices[0] && data.choices[0].message) {
                    return data.choices[0].message.content.trim();
                }
                throw new Error('APIレスポンスの形式が正しくありません');
        }
    }

    validateResponse(data) {
        switch (this.provider) {
            case 'claude':
                return data.content && data.content[0] && data.content[0].text;
                
            case 'openai':
            case 'openrouter':
            case 'azure':
            case 'local':
            case 'generic':
            default:
                return data.choices && data.choices[0] && data.choices[0].message;
        }
    }
}

/**
 * 統一された翻訳関数（APIプロバイダー自動対応）
 */
async function translateWithApiProvider(text, apiUrl, apiKey, targetLanguage, model, maxRetries = 3) {
    const provider = new ApiProvider(apiUrl);
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const messages = [
                {
                    role: "system",
                    content: `あなたは優秀な翻訳者です。与えられたテキストを${targetLanguage === 'ja' ? '日本語' : targetLanguage}に翻訳してください。翻訳結果のみを返してください。`
                },
                {
                    role: "user",
                    content: text
                }
            ];

            const requestBody = provider.buildRequest(model, messages);
            const headers = provider.buildHeaders(apiKey);

            console.log(`[${provider.provider}] API リクエスト:`, {
                url: apiUrl,
                headers: Object.keys(headers),
                bodyKeys: Object.keys(requestBody)
            });

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });

            // レート制限エラーの場合はリトライ
            if (response.status === 429) {
                const errorText = await response.text();
                const rateLimitInfo = extractRateLimitInfo(response, errorText);

                // 詳細なレート制限情報をログ出力
                console.group(`⚠️ レート制限エラー (試行 ${attempt + 1}/${maxRetries})`);
                console.log('プロバイダー:', provider.provider);
                console.log('制限の種類:', rateLimitInfo.limitType || '不明');
                console.log('エラーメッセージ:', rateLimitInfo.message);

                if (rateLimitInfo.details.requestLimit !== null) {
                    console.log('リクエスト制限:', {
                        上限: rateLimitInfo.details.requestLimit,
                        残り: rateLimitInfo.details.requestRemaining,
                        リセット時刻: rateLimitInfo.details.requestResetTime
                            ? new Date(rateLimitInfo.details.requestResetTime * 1000).toLocaleString('ja-JP')
                            : '不明'
                    });
                }

                if (rateLimitInfo.details.tokenLimit !== null) {
                    console.log('トークン制限:', {
                        上限: rateLimitInfo.details.tokenLimit,
                        残り: rateLimitInfo.details.tokenRemaining,
                        リセット時刻: rateLimitInfo.details.tokenResetTime
                            ? new Date(rateLimitInfo.details.tokenResetTime * 1000).toLocaleString('ja-JP')
                            : '不明'
                    });
                }

                console.log('待機時間:', rateLimitInfo.suggestedDelay
                    ? `${Math.round(rateLimitInfo.suggestedDelay/1000)}秒`
                    : '計算できません（指数バックオフを使用）');
                console.log('リセット情報:', rateLimitInfo.resetInfo || 'なし');

                // エラーレスポンスボディをログ出力（デバッグ用）
                if (errorText) {
                    try {
                        const errorJson = JSON.parse(errorText);
                        console.log('エラーレスポンス:', errorJson);
                    } catch (e) {
                        console.log('エラーレスポンス（テキスト）:', errorText.substring(0, 200));
                    }
                }
                console.groupEnd();

                lastError = new Error(`レート制限エラー (試行 ${attempt + 1}/${maxRetries}): ${rateLimitInfo.message}`);

                if (attempt < maxRetries - 1) {
                    const delay = rateLimitInfo.suggestedDelay || (Math.pow(2, attempt) * 2000 + Math.random() * 1000);
                    console.log(`🔄 ${Math.round(delay/1000)}秒待機後、リトライします...`);

                    // ユーザーに進捗を表示（可能な場合）
                    notifyRateLimitWait(Math.round(delay/1000), attempt + 1, maxRetries, rateLimitInfo);

                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // 最終的なエラーを投げる
                const finalError = new RateLimitError(
                    `レート制限により翻訳に失敗しました。${rateLimitInfo.resetInfo}`,
                    lastError
                );
                finalError.rateLimitInfo = rateLimitInfo; // 詳細情報を保存
                throw finalError;
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[${provider.provider}] API エラー ${response.status}:`, errorText);
                throw new Error(`API Error ${response.status}: ${errorText}`);
            }

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const responseText = await response.text();
                throw new Error(`APIが正しいJSON形式で応答していません。レスポンス: ${responseText.substring(0, 200)}...`);
            }

            const data = await response.json();
            console.log(`[${provider.provider}] API レスポンス:`, data);

            if (!provider.validateResponse(data)) {
                console.error(`[${provider.provider}] レスポンス検証失敗:`, data);
                throw new Error(`${provider.provider} APIレスポンスの形式が正しくありません`);
            }

            return provider.extractResponse(data);

        } catch (error) {
            lastError = error;
            
            // ネットワークエラーや429以外のエラーの場合はすぐに終了
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                throw new Error('ネットワークエラー: API URLが正しいか確認してください');
            }
            
            if (!error.message.includes('レート制限エラー') && !error.message.includes('429')) {
                throw error;
            }
            
            // 最後の試行でもレート制限エラーの場合
            if (attempt === maxRetries - 1) {
                throw new RateLimitError(
                    'レート制限により翻訳に失敗しました。しばらく待ってから再試行するか、別のAPIプロバイダーを試してください。',
                    lastError
                );
            }
        }
    }
    
    throw lastError;
}

/**
 * 指数バックオフでリトライする翻訳関数（従来版・後方互換性）
 */
async function translateWithRetry(text, apiUrl, apiKey, targetLanguage, model, maxRetries = 3) {
    // 新しい統一関数を使用
    return translateWithApiProvider(text, apiUrl, apiKey, targetLanguage, model, maxRetries);
}

/**
 * レート制限エラー専用クラス
 */
class RateLimitError extends Error {
    constructor(message, originalError) {
        super(message);
        this.name = 'RateLimitError';
        this.originalError = originalError;
        this.isRateLimit = true;
    }
}

/**
 * レート制限情報を抽出する（OpenRouter対応強化版）
 */
function extractRateLimitInfo(response, errorText) {
    const info = {
        message: 'APIリクエスト制限に達しました',
        suggestedDelay: null,
        resetInfo: '',
        limitType: null, // 'requests' or 'tokens'
        details: {
            requestLimit: null,
            requestRemaining: null,
            requestResetTime: null,
            tokenLimit: null,
            tokenRemaining: null,
            tokenResetTime: null
        }
    };

    // OpenRouter特有のヘッダーを取得（小文字も対応）
    const getHeader = (name) => {
        return response.headers.get(name) ||
               response.headers.get(name.toLowerCase()) ||
               response.headers.get(name.replace(/-/g, ''));
    };

    // リクエスト制限情報
    const requestLimit = getHeader('x-ratelimit-limit-requests');
    const requestRemaining = getHeader('x-ratelimit-remaining-requests');
    const requestReset = getHeader('x-ratelimit-reset-requests');

    // トークン制限情報
    const tokenLimit = getHeader('x-ratelimit-limit-tokens');
    const tokenRemaining = getHeader('x-ratelimit-remaining-tokens');
    const tokenReset = getHeader('x-ratelimit-reset-tokens');

    // 標準ヘッダー
    const retryAfter = getHeader('Retry-After');
    const genericReset = getHeader('X-RateLimit-Reset');
    const genericRemaining = getHeader('X-RateLimit-Remaining');

    // 詳細情報を保存
    if (requestLimit) info.details.requestLimit = parseInt(requestLimit);
    if (requestRemaining) info.details.requestRemaining = parseInt(requestRemaining);
    if (requestReset) info.details.requestResetTime = parseInt(requestReset);
    if (tokenLimit) info.details.tokenLimit = parseInt(tokenLimit);
    if (tokenRemaining) info.details.tokenRemaining = parseInt(tokenRemaining);
    if (tokenReset) info.details.tokenResetTime = parseInt(tokenReset);

    // 制限の種類を判定
    if (requestRemaining !== null && parseInt(requestRemaining) === 0) {
        info.limitType = 'requests';
        info.message = 'リクエスト数制限に達しました';
    } else if (tokenRemaining !== null && parseInt(tokenRemaining) === 0) {
        info.limitType = 'tokens';
        info.message = 'トークン数制限に達しました';
    }

    // 待機時間を計算
    if (retryAfter) {
        const delay = parseInt(retryAfter) * 1000; // 秒をミリ秒に変換
        info.suggestedDelay = delay;
        info.resetInfo = `${Math.round(delay/1000)}秒後に再試行可能です`;
    } else if (requestReset && info.limitType === 'requests') {
        const resetDate = new Date(parseInt(requestReset) * 1000);
        const now = new Date();
        const waitTime = Math.max(0, resetDate.getTime() - now.getTime());
        if (waitTime > 0) {
            info.suggestedDelay = waitTime;
            info.resetInfo = `リクエスト制限は${Math.round(waitTime/1000)}秒後にリセットされます`;
        }
    } else if (tokenReset && info.limitType === 'tokens') {
        const resetDate = new Date(parseInt(tokenReset) * 1000);
        const now = new Date();
        const waitTime = Math.max(0, resetDate.getTime() - now.getTime());
        if (waitTime > 0) {
            info.suggestedDelay = waitTime;
            info.resetInfo = `トークン制限は${Math.round(waitTime/1000)}秒後にリセットされます`;
        }
    } else if (genericReset) {
        const resetDate = new Date(parseInt(genericReset) * 1000);
        const now = new Date();
        const waitTime = Math.max(0, resetDate.getTime() - now.getTime());
        if (waitTime > 0) {
            info.suggestedDelay = waitTime;
            info.resetInfo = `${Math.round(waitTime/1000)}秒後にリセットされます`;
        }
    }

    // エラーメッセージからより詳細な情報を抽出
    if (errorText.includes('quota') || errorText.includes('limit')) {
        if (!info.limitType) {
            info.message = 'APIクォータまたはレート制限に達しました';
        }
    } else if (errorText.includes('billing') || errorText.includes('credit')) {
        info.message = 'アカウントの支払い状況またはクレジットを確認してください';
    }

    return info;
}

/**
 * レート制限待機をユーザーに通知
 */
function notifyRateLimitWait(waitSeconds, attempt, maxRetries, rateLimitInfo = null) {
    // 詳細メッセージの構築
    let detailMessage = '';
    if (rateLimitInfo) {
        if (rateLimitInfo.limitType === 'requests') {
            detailMessage = ' (リクエスト数制限)';
        } else if (rateLimitInfo.limitType === 'tokens') {
            detailMessage = ' (トークン数制限)';
        }
    }

    // コンソールログ
    console.log(`⏳ レート制限${detailMessage}: ${waitSeconds}秒待機中... (${attempt}/${maxRetries})`);

    // DOM要素が存在する場合は画面にも表示
    try {
        const statusElements = [
            document.getElementById('translationResult'),
            document.getElementById('translatedText'),
            document.querySelector('.text-content.translated-text')
        ];

        const message = `⏳ レート制限${detailMessage}のため${waitSeconds}秒待機中... (試行 ${attempt}/${maxRetries})`;

        for (const element of statusElements) {
            if (element && !element.textContent.includes('エラー')) {
                const originalContent = element.textContent;
                element.textContent = message;

                // 待機後に元のメッセージに戻す（翻訳中メッセージなど）
                setTimeout(() => {
                    if (element.textContent === message) {
                        element.textContent = originalContent.includes('翻訳中') ? '翻訳中...' : '翻訳を再試行中...';
                    }
                }, waitSeconds * 1000);
                break;
            }
        }
    } catch (e) {
        // DOM操作が失敗した場合は無視
    }
}

/**
 * エラーメッセージをユーザーフレンドリーに変換
 */
function formatErrorMessage(error) {
    if (error.isRateLimit) {
        const rateLimitInfo = error.rateLimitInfo;
        let message = error.message;

        // レート制限の詳細情報を追加
        if (rateLimitInfo) {
            if (rateLimitInfo.limitType === 'requests') {
                message += '\n\n制限の種類: リクエスト数制限';
                if (rateLimitInfo.details.requestLimit !== null) {
                    message += `\n上限: ${rateLimitInfo.details.requestLimit}リクエスト`;
                }
                if (rateLimitInfo.details.requestRemaining !== null) {
                    message += `\n残り: ${rateLimitInfo.details.requestRemaining}リクエスト`;
                }
            } else if (rateLimitInfo.limitType === 'tokens') {
                message += '\n\n制限の種類: トークン数制限';
                if (rateLimitInfo.details.tokenLimit !== null) {
                    message += `\n上限: ${rateLimitInfo.details.tokenLimit}トークン`;
                }
                if (rateLimitInfo.details.tokenRemaining !== null) {
                    message += `\n残り: ${rateLimitInfo.details.tokenRemaining}トークン`;
                }
            }

            // リセット時刻を人間が読める形式で表示
            if (rateLimitInfo.details.requestResetTime && rateLimitInfo.limitType === 'requests') {
                const resetDate = new Date(rateLimitInfo.details.requestResetTime * 1000);
                message += `\nリセット時刻: ${resetDate.toLocaleString('ja-JP')}`;
            } else if (rateLimitInfo.details.tokenResetTime && rateLimitInfo.limitType === 'tokens') {
                const resetDate = new Date(rateLimitInfo.details.tokenResetTime * 1000);
                message += `\nリセット時刻: ${resetDate.toLocaleString('ja-JP')}`;
            }
        }

        return {
            message: message,
            suggestions: [
                'しばらく待ってから再試行してください（自動リトライは既に実行されました）',
                'OpenRouter.aiやOpenAIで独自のAPIキーを設定してください',
                '他のAPIプロバイダー（OpenAI、Anthropic Claude、Gemini）を使用してください',
                'APIキーのクォータや支払い状況を確認してください',
                rateLimitInfo && rateLimitInfo.resetInfo ? `リセット情報: ${rateLimitInfo.resetInfo}` : null
            ].filter(Boolean), // null を除外
            type: 'rate-limit'
        };
    }

    if (error.message.includes('Failed to fetch')) {
        return {
            message: 'ネットワークエラー: API URLが正しいか確認してください',
            suggestions: [
                'インターネット接続を確認してください',
                'API URLが正しく設定されているか確認してください',
                'ファイアウォールがAPIアクセスをブロックしていないか確認してください'
            ],
            type: 'network'
        };
    }

    if (error.message.includes('401')) {
        return {
            message: 'APIキーが無効です',
            suggestions: [
                'APIキーが正しく設定されているか確認してください',
                'APIキーの有効期限が切れていないか確認してください'
            ],
            type: 'auth'
        };
    }

    if (error.message.includes('403')) {
        return {
            message: 'APIへのアクセスが拒否されました',
            suggestions: [
                'APIキーの権限を確認してください',
                'アカウントの制限や支払い状況を確認してください'
            ],
            type: 'permission'
        };
    }

    return {
        message: error.message || '不明なエラーが発生しました',
        suggestions: [
            '設定を確認してください',
            'しばらく待ってから再試行してください'
        ],
        type: 'unknown'
    };
}

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    // Node.js環境（現在は使用していないが、将来のため保持）
    module.exports = {
        ApiProvider,
        translateWithApiProvider,
        translateWithRetry,
        RateLimitError,
        formatErrorMessage,
        extractRateLimitInfo,
        notifyRateLimitWait
    };
} else if (typeof window !== 'undefined') {
    // ブラウザ環境（translation_view.html等から使用）
    window.ApiProvider = ApiProvider;
    window.translateWithApiProvider = translateWithApiProvider;
    window.translateWithRetry = translateWithRetry;
    window.RateLimitError = RateLimitError;
    window.formatErrorMessage = formatErrorMessage;
    window.extractRateLimitInfo = extractRateLimitInfo;
    window.notifyRateLimitWait = notifyRateLimitWait;
} else if (typeof self !== 'undefined') {
    // Service Worker環境（background.jsから使用）
    self.ApiProvider = ApiProvider;
    self.translateWithApiProvider = translateWithApiProvider;
    self.translateWithRetry = translateWithRetry;
    self.RateLimitError = RateLimitError;
    self.formatErrorMessage = formatErrorMessage;
    self.extractRateLimitInfo = extractRateLimitInfo;
    self.notifyRateLimitWait = notifyRateLimitWait;
}