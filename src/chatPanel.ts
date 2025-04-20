import * as vscode from 'vscode';
import axios from 'axios';

interface FromWebviewMessage {
    command: 'sendMessage' | 'updateApiUrl';
    text: string;
    apiUrl?: string;
}

export class ChatPanel {
    public static currentPanel: ChatPanel | undefined;
    private _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _apiUrl: string;

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;
        // Get the API URL from configuration or use default
        this._apiUrl = vscode.workspace.getConfiguration('lmStudioConnect').get('apiUrl', 'http://localhost:1234');
        
        this._panel.webview.html = this._getWebviewContent(this._apiUrl);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(
            async (message: FromWebviewMessage) => {
                if (message.command === 'updateApiUrl') {
                    // Update the API URL in configuration and locally
                    this._apiUrl = message.apiUrl || 'http://localhost:1234';
                    await vscode.workspace.getConfiguration('lmStudioConnect').update('apiUrl', this._apiUrl, true);
                    vscode.window.showInformationMessage(`API URL updated to: ${this._apiUrl}`);
                    return;
                }
                
                try {
                    const response = await axios.post(`${this._apiUrl}/v1/chat/completions`, {
                        messages: [
                            {
                                role: 'user',
                                content: message.text
                            }
                        ],
                        stream: false,
                        model: 'local-model',
                        temperature: 0.7
                    }, {
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    const answer = response.data.choices[0].message.content;
                    this._panel.webview.postMessage({ 
                        command: 'addResponse', 
                        text: answer 
                    });
                } catch (error) {
                    if (axios.isAxiosError(error)) {
                        vscode.window.showErrorMessage(
                            `Ошибка подключения к LM Studio (${this._apiUrl}): ${error.message}`
                        );
                    }
                }
            },
            null,
            this._disposables
        );
    }

    public static render() {
        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'lmStudioChat',
            'LM Studio Chat',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true
            }
        );

        ChatPanel.currentPanel = new ChatPanel(panel);
    }

    private _getWebviewContent(apiUrl: string) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 0;
                        margin: 0;
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                    }
                    #chat-container {
                        flex: 1;
                        overflow-y: auto;
                        padding: 20px;
                    }
                    .message {
                        margin-bottom: 15px;
                        padding: 10px;
                        border-radius: 5px;
                    }
                    .user-message {
                        background-color: var(--vscode-editor-background);
                        margin-left: 20%;
                    }
                    .assistant-message {
                        background-color: var(--vscode-editor-selectionBackground);
                        margin-right: 20%;
                    }
                    #input-container {
                        padding: 20px;
                        background-color: var(--vscode-editor-background);
                        border-top: 1px solid var(--vscode-editor-lineHighlightBorder);
                    }
                    #message-input {
                        width: 100%;
                        padding: 8px;
                        border: 1px solid var(--vscode-input-border);
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border-radius: 4px;
                        resize: vertical;
                        min-height: 60px;
                    }
                    #settings-button {
                        position: absolute;
                        top: 10px;
                        right: 10px;
                        cursor: pointer;
                        background: none;
                        border: none;
                        font-size: 18px;
                        color: var(--vscode-editor-foreground);
                    }
                    #settings-panel {
                        display: none;
                        position: absolute;
                        top: 40px;
                        right: 10px;
                        background-color: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-editor-lineHighlightBorder);
                        padding: 15px;
                        border-radius: 5px;
                        z-index: 100;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                    }
                    .settings-group {
                        margin-bottom: 10px;
                    }
                    .settings-label {
                        display: block;
                        margin-bottom: 5px;
                        font-weight: 500;
                    }
                    .settings-input {
                        width: 100%;
                        padding: 5px;
                        border: 1px solid var(--vscode-input-border);
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border-radius: 3px;
                        margin-bottom: 10px;
                    }
                    .settings-button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 5px 10px;
                        border-radius: 3px;
                        cursor: pointer;
                        margin-right: 5px;
                    }
                    
                    /* Markdown styling */
                    .message h1 {
                        font-size: 1.8em;
                        margin-bottom: 0.5em;
                        border-bottom: 1px solid var(--vscode-editor-lineHighlightBorder);
                        padding-bottom: 0.3em;
                    }
                    .message h2 {
                        font-size: 1.5em;
                        margin-bottom: 0.5em;
                        border-bottom: 1px solid var(--vscode-editor-lineHighlightBorder);
                        padding-bottom: 0.2em;
                    }
                    .message h3 {
                        font-size: 1.3em;
                        margin-bottom: 0.5em;
                    }
                    .message h4, .message h5, .message h6 {
                        font-size: 1.1em;
                        margin-bottom: 0.5em;
                    }
                    .message p {
                        margin-bottom: 1em;
                        line-height: 1.5;
                    }
                    .message pre {
                        background-color: var(--vscode-editor-background);
                        border-radius: 3px;
                        padding: 10px;
                        overflow: auto;
                        margin: 0.5em 0;
                    }
                    .message code {
                        font-family: 'Courier New', Courier, monospace;
                        background-color: var(--vscode-editor-background);
                        padding: 2px 4px;
                        border-radius: 3px;
                    }
                    .message pre code {
                        padding: 0;
                        background-color: transparent;
                    }
                    .message blockquote {
                        border-left: 4px solid var(--vscode-editor-lineHighlightBorder);
                        padding-left: 1em;
                        margin-left: 0;
                        color: var(--vscode-descriptionForeground);
                    }
                    .message ul, .message ol {
                        padding-left: 2em;
                        margin-bottom: 1em;
                    }
                    .message li {
                        margin-bottom: 0.5em;
                    }
                    .message table {
                        border-collapse: collapse;
                        margin: 1em 0;
                    }
                    .message th, .message td {
                        border: 1px solid var(--vscode-editor-lineHighlightBorder);
                        padding: 6px 13px;
                    }
                    .message th {
                        background-color: rgba(0, 0, 0, 0.1);
                    }
                    .message a {
                        color: var(--vscode-textLink-foreground);
                        text-decoration: none;
                    }
                    .message a:hover {
                        text-decoration: underline;
                    }
                    .message img {
                        max-width: 100%;
                    }
                </style>
            </head>
            <body>
                <div id="chat-container"></div>
                <button id="settings-button">⚙️</button>
                <div id="settings-panel">
                    <div class="settings-group">
                        <label class="settings-label">API URL</label>
                        <input type="text" id="api-url-input" class="settings-input" value="${apiUrl}" placeholder="http://localhost:1234">
                    </div>
                    <button id="save-settings" class="settings-button">Сохранить</button>
                    <button id="cancel-settings" class="settings-button">Отмена</button>
                </div>
                <div id="input-container">
                    <textarea id="message-input" placeholder="Введите сообщение и нажмите Enter для отправки..."></textarea>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    const chatContainer = document.getElementById('chat-container');
                    const messageInput = document.getElementById('message-input');
                    const settingsButton = document.getElementById('settings-button');
                    const settingsPanel = document.getElementById('settings-panel');
                    const apiUrlInput = document.getElementById('api-url-input');
                    const saveSettingsButton = document.getElementById('save-settings');
                    const cancelSettingsButton = document.getElementById('cancel-settings');

                    // Settings panel toggle
                    settingsButton.addEventListener('click', () => {
                        settingsPanel.style.display = settingsPanel.style.display === 'block' ? 'none' : 'block';
                    });

                    // Save settings
                    saveSettingsButton.addEventListener('click', () => {
                        const newApiUrl = apiUrlInput.value.trim();
                        if (newApiUrl) {
                            vscode.postMessage({
                                command: 'updateApiUrl',
                                apiUrl: newApiUrl
                            });
                            settingsPanel.style.display = 'none';
                        }
                    });

                    // Cancel settings
                    cancelSettingsButton.addEventListener('click', () => {
                        settingsPanel.style.display = 'none';
                    });

                    // Simple Markdown parser
                    function parseMarkdown(markdown) {
                        if (!markdown) return '';
                        
                        // Sanitize input to prevent XSS
                        const escapeHTML = (str) => {
                            return str
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')
                                .replace(/"/g, '&quot;')
                                .replace(/'/g, '&#039;');
                        };
                        
                        let html = escapeHTML(markdown);
                        
                        // Process code blocks first
                        html = html.replace(/\`\`\`([\s\S]*?)\`\`\`/g, (match, code) => {
                            return '<pre><code>' + code + '</code></pre>';
                        });
                        
                        // Process inline code
                        html = html.replace(/\`([^\n]+?)\`/g, '<code>$1</code>');
                        
                        // Headers
                        html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
                        html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
                        html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
                        
                        // Bold and italic
                        html = html.replace(/\*\*\*([^\*]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
                        html = html.replace(/\*\*([^\*]+?)\*\*/g, '<strong>$1</strong>');
                        html = html.replace(/\*([^\*]+?)\*/g, '<em>$1</em>');
                        
                        // Lists
                        html = html.replace(/^\* (.*?)$/gm, '<ul><li>$1</li></ul>');
                        html = html.replace(/^\- (.*?)$/gm, '<ul><li>$1</li></ul>');
                        html = html.replace(/^\d+\. (.*?)$/gm, '<ol><li>$1</li></ol>');
                        
                        // Fix list tags (combine adjacent list items)
                        html = html.replace(/<\/ul><ul>/g, '');
                        html = html.replace(/<\/ol><ol>/g, '');
                        
                        // Links
                        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
                        
                        // Blockquotes
                        html = html.replace(/^> (.*?)$/gm, '<blockquote>$1</blockquote>');
                        
                        // Paragraphs - split by newlines and wrap in <p> tags
                        const paragraphs = html.split(/\n\n+/);
                        html = paragraphs.map(p => {
                            // Skip if it's already a block element
                            if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<ol') || 
                                p.startsWith('<blockquote') || p.startsWith('<pre')) {
                                return p;
                            }
                            return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
                        }).join('');
                        
                        return html;
                    }

                    function addMessage(text, isUser = true) {
                        const messageDiv = document.createElement('div');
                        messageDiv.className = \`message \${isUser ? 'user-message' : 'assistant-message'}\`;
                        
                        // Use Markdown parsing for assistant messages only (optional)
                        if (isUser) {
                            messageDiv.textContent = text;
                        } else {
                            messageDiv.innerHTML = parseMarkdown(text);
                        }
                        
                        chatContainer.appendChild(messageDiv);
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    }

                    messageInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            const text = messageInput.value.trim();
                            if (text) {
                                addMessage(text, true);
                                vscode.postMessage({
                                    command: 'sendMessage',
                                    text: text
                                });
                                messageInput.value = '';
                            }
                        }
                    });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'addResponse':
                                addMessage(message.text, false);
                                break;
                        }
                    });

                    // Close settings panel if clicking outside
                    document.addEventListener('click', (event) => {
                        if (!settingsPanel.contains(event.target) && event.target !== settingsButton) {
                            settingsPanel.style.display = 'none';
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }

    public dispose() {
        ChatPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}