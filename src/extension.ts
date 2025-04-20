import * as vscode from 'vscode';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'lm-studio-chat-view';

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) {}

    private async getFileContent(filePath: string): Promise<string> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return content;
        } catch (error) {
            console.error('Error reading file:', error);
            throw error;
        }
    }

    private async attachFile(): Promise<{name: string, content: string} | undefined> {
        const files = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'All files': ['*']
            }
        });

        if (files && files.length > 0) {
            const filePath = files[0].fsPath;
            try {
                const content = await this.getFileContent(filePath);
                return {
                    name: path.basename(filePath),
                    content: content
                };
            } catch (error) {
                vscode.window.showErrorMessage('Ошибка при чтении файла: ' + error);
            }
        }
        return undefined;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        console.log('Resolving webview view'); // Добавлено логирование

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview();

        webviewView.webview.onDidReceiveMessage(async (data) => {
            console.log('Received message:', data); // Улучшено логирование

            switch (data.command) {
                case 'attachFile': {
                    console.log('Handling attachFile command');
                    try {
                        const file = await this.attachFile();
                        if (file) {
                            console.log('File attached:', file.name);
                            webviewView.webview.postMessage({ 
                                command: 'fileAttached', 
                                file: file 
                            });
                        }
                    } catch (error) {
                        console.error('Error attaching file:', error);
                        vscode.window.showErrorMessage('Ошибка при прикреплении файла: ' + error);
                    }
                    break;
                }
                case 'sendMessage': {
                    console.log('Handling sendMessage command');
                    const messageText = data.text;
                    const attachedFile = data.file;
                    
                    let content = messageText;
                    if (attachedFile) {
                        content = `${messageText}\n\nПрикрепленный файл (${attachedFile.name}):\n\`\`\`\n${attachedFile.content}\n\`\`\``;
                    }

                    try {
                        const response = await axios.post('http://localhost:1234/v1/chat/completions', {
                            messages: [
                                {
                                    role: 'user',
                                    content: content
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

                        webviewView.webview.postMessage({ 
                            command: 'addResponse', 
                            text: response.data.choices[0].message.content 
                        });
                    } catch (error) {
                        if (axios.isAxiosError(error)) {
                            console.error('LM Studio API error:', error.message);
                            vscode.window.showErrorMessage(
                                'Ошибка подключения к LM Studio: ' + error.message
                            );
                        }
                    }
                    break;
                }
            }
        });
    }

    private _getHtmlForWebview() {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
                <style>
                    body { 
                        padding: 0; 
                        margin: 0;
                        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                    }
                    #chat-container { 
                        height: calc(100vh - 100px); 
                        overflow-y: auto; 
                        padding: 20px;
                    }
                    .message {
                        margin-bottom: 15px;
                        padding: 10px;
                        border-radius: 8px;
                        max-width: 80%;
                        word-wrap: break-word;
                    }
                    .user-message {
                        background-color: var(--vscode-editor-selectionBackground);
                        margin-left: 20%;
                    }
                    .assistant-message {
                        background-color: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-editor-selectionBackground);
                    }
                    #input-container { 
                        position: fixed; 
                        bottom: 0; 
                        left: 0; 
                        right: 0; 
                        padding: 10px 20px;
                        background: var(--vscode-editor-background);
                        border-top: 1px solid var(--vscode-editor-selectionBackground);
                    }
                    .input-row {
                        display: flex;
                        gap: 8px;
                        align-items: flex-start;
                    }
                    textarea { 
                        width: 100%; 
                        padding: 8px;
                        border: 1px solid var(--vscode-editor-selectionBackground);
                        border-radius: 4px;
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        resize: none;
                    }
                    .attach-button {
                        padding: 4px 8px;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                    }
                    .attach-button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .file-info {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 4px;
                    }
                </style>
            </head>
            <body>
                <div id="chat-container"></div>
                <div id="input-container">
                    <div class="input-row">
                        <textarea id="message-input" rows="3" placeholder="Введите сообщение..."></textarea>
                        <button class="attach-button" id="attach-button" type="button">Прикрепить</button>
                    </div>
                    <div id="file-info" class="file-info"></div>
                </div>
                <script>
                    (function() {
                        const vscode = acquireVsCodeApi();
                        const input = document.getElementById('message-input');
                        const container = document.getElementById('chat-container');
                        const attachButton = document.getElementById('attach-button');
                        const fileInfo = document.getElementById('file-info');
                        let currentFile = null;
                        
                        function sendMessage() {
                            const text = input.value.trim();
                            if (text) {
                                const displayText = currentFile 
                                    ? text + '\\n[Прикрепленный файл: ' + currentFile.name + ']'
                                    : text;
                                addMessage(displayText, true);
                                vscode.postMessage({ 
                                    command: 'sendMessage', 
                                    text: text,
                                    file: currentFile
                                });
                                input.value = '';
                                currentFile = null;
                                fileInfo.textContent = '';
                            }
                        }

                        function addMessage(text, isUser = true) {
                            const div = document.createElement('div');
                            div.className = 'message ' + (isUser ? 'user-message' : 'assistant-message');
                            div.textContent = text;
                            container.appendChild(div);
                            container.scrollTop = container.scrollHeight;
                        }

                        attachButton.addEventListener('click', (e) => {
                            e.preventDefault();
                            console.log('Attach button clicked');
                            vscode.postMessage({ command: 'attachFile' });
                        });

                        window.addEventListener('message', event => {
                            const message = event.data;
                            console.log('Received from extension:', message.command);
                            switch (message.command) {
                                case 'addResponse':
                                    addMessage(message.text, false);
                                    break;
                                case 'fileAttached':
                                    currentFile = message.file;
                                    fileInfo.textContent = 'Прикреплен файл: ' + message.file.name;
                                    break;
                            }
                        });

                        input.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage();
                            }
                        });
                    })();
                </script>
            </body>
            </html>
        `;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Активация расширения LM Studio Connect');
    const provider = new ChatViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider)
    );
}

export function deactivate() {
    console.log('Деактивация расширения LM Studio Connect');
}