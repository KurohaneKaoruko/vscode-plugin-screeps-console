import * as vscode from 'vscode';
import { ScreepsClient } from './ScreepsClient';

type IncomingMessage =
    | { type: 'ready' }
    | { type: 'sendCommand'; command: string }
    | { type: 'connect' }
    | { type: 'disconnect' }
    | { type: 'resetToken' }
    | { type: 'setShard'; shard: string };

type OutgoingMessage =
    | { type: 'appendLog'; text: string; kind: 'log' | 'error' | 'system' }
    | { type: 'setStatus'; text: string };

export class ScreepsConsoleViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'screeps-console.view';

    private view: vscode.WebviewView | undefined;
    private client: ScreepsClient | undefined;
    private lastToken: string | undefined;

    constructor(private readonly context: vscode.ExtensionContext) {}

    public resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true
        };

        webviewView.webview.html = this.getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (raw: IncomingMessage) => {
            switch (raw.type) {
                case 'ready':
                    this.post({ type: 'setStatus', text: 'Ready' });
                    break;
                case 'connect':
                    await this.connect();
                    break;
                case 'disconnect':
                    this.disconnect();
                    break;
                case 'sendCommand':
                    await this.client?.sendCommand(raw.command);
                    break;
                case 'resetToken':
                    await this.context.secrets.delete('screeps_token');
                    this.lastToken = undefined;
                    this.disconnect();
                    this.post({ type: 'appendLog', text: 'Token cleared.', kind: 'system' });
                    break;
                case 'setShard':
                    if (this.client) {
                        this.client.setActiveShard(raw.shard);
                        this.post({ type: 'appendLog', text: `Shard switched to: ${raw.shard}`, kind: 'system' });
                    }
                    break;
            }
        });

        webviewView.onDidDispose(() => {
            this.view = undefined;
            this.disconnect();
        });
    }

    public async reveal(): Promise<void> {
        await vscode.commands.executeCommand('workbench.view.extension.screeps-console.panel');
        this.view?.show?.(true);
    }

    private async connect(): Promise<void> {
        const token = await this.getOrPromptToken();
        if (!token) {
            this.post({ type: 'appendLog', text: 'Token is required.', kind: 'error' });
            return;
        }

        if (this.client && this.lastToken === token) {
            this.post({ type: 'setStatus', text: 'Connecting…' });
            await this.client.connect();
            return;
        }

        this.disconnect();

        this.lastToken = token;
        this.client = new ScreepsClient(token);
        this.client.on('log', (msg: string) => this.post({ type: 'appendLog', text: msg, kind: 'system' }));
        this.client.on('error', (msg: string) => this.post({ type: 'appendLog', text: msg, kind: 'error' }));
        this.client.on('console', (msg: string) => this.post({ type: 'appendLog', text: msg, kind: 'log' }));

        this.post({ type: 'setStatus', text: 'Connecting…' });
        await this.client.connect();
        this.post({ type: 'setStatus', text: 'Connected' });
    }

    private disconnect(): void {
        this.client?.disconnect();
        this.client = undefined;
        this.post({ type: 'setStatus', text: 'Disconnected' });
    }

    private async getOrPromptToken(): Promise<string | undefined> {
        let token = await this.context.secrets.get('screeps_token');
        if (token) {
            return token;
        }

        token = await vscode.window.showInputBox({
            prompt: 'Enter your Screeps Auth Token',
            placeHolder: 'Account Settings -> Auth Tokens',
            ignoreFocusOut: true,
            password: true
        });

        if (!token) {
            return undefined;
        }

        await this.context.secrets.store('screeps_token', token);
        return token;
    }

    private post(msg: OutgoingMessage): void {
        this.view?.webview.postMessage(msg);
    }

    private getHtml(webview: vscode.Webview): string {
        const nonce = this.getNonce();
        const csp = [
            `default-src 'none'`,
            `img-src ${webview.cspSource} https:`,
            `style-src ${webview.cspSource} 'unsafe-inline'`,
            `script-src 'nonce-${nonce}'`
        ].join('; ');

        return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Screeps Console</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        padding: 0;
        margin: 0;
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        height: 100vh;
        display: grid;
        grid-template-rows: auto 1fr auto;
      }
      .toolbar {
        display: flex;
        gap: 8px;
        align-items: center;
        padding: 8px;
        border-bottom: 1px solid var(--vscode-panel-border);
      }
      .toolbar button {
        border: 1px solid var(--vscode-button-border, transparent);
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        padding: 4px 10px;
        border-radius: 4px;
        cursor: pointer;
      }
      .toolbar button.secondary, .toolbar select.secondary {
        background: transparent;
        color: var(--vscode-foreground);
        border-color: var(--vscode-panel-border);
      }
      .toolbar select {
        background: var(--vscode-dropdown-background);
        color: var(--vscode-dropdown-foreground);
        border: 1px solid var(--vscode-dropdown-border);
        padding: 3px;
        border-radius: 4px;
      }
      .status {
        margin-left: auto;
        opacity: 0.8;
        font-size: 12px;
      }
      #log {
        padding: 8px;
        overflow: auto;
        font-family: var(--vscode-editor-font-family);
        font-size: var(--vscode-editor-font-size);
        line-height: 1.4;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .line {
        padding: 2px 0;
      }
      .line.system {
        color: var(--vscode-terminal-ansiCyan, #00aaaa);
      }
      .line.error {
        color: var(--vscode-terminal-ansiRed, #ff0000);
      }
      .inputbar {
        border-top: 1px solid var(--vscode-panel-border);
        padding: 8px;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
      }
      #cmd {
        width: 100%;
        padding: 6px 8px;
        border-radius: 4px;
        border: 1px solid var(--vscode-input-border);
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        outline: none;
      }
      #send {
        padding: 6px 12px;
        border-radius: 4px;
        border: 1px solid var(--vscode-button-border, transparent);
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button id="connect">Connect</button>
      <button id="disconnect" class="secondary">Disconnect</button>
      <button id="clear" class="secondary">Clear</button>
      <button id="resetToken" class="secondary">Reset Token</button>
      <select id="shardSelect" class="secondary">
        <option value="shard3" selected>shard3</option>
        <option value="shard0">shard0</option>
        <option value="shard1">shard1</option>
        <option value="shard2">shard2</option>
      </select>
      <div class="status" id="status">Disconnected</div>
    </div>
    <div id="log" role="log" aria-live="polite"></div>
    <div class="inputbar">
      <input id="cmd" type="text" placeholder="输入命令，例如 Game.time" />
      <button id="send">Send</button>
    </div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const logEl = document.getElementById('log');
      const statusEl = document.getElementById('status');
      const cmdEl = document.getElementById('cmd');
      const connectBtn = document.getElementById('connect');
      const disconnectBtn = document.getElementById('disconnect');
      const clearBtn = document.getElementById('clear');
      const resetTokenBtn = document.getElementById('resetToken');
      const shardSelect = document.getElementById('shardSelect');
      const sendBtn = document.getElementById('send');

      const appendLine = (text, kind) => {
        const div = document.createElement('div');
        div.className = 'line ' + kind;
        if (kind === 'log' || kind === 'error') {
            // Allow HTML for logs and errors
            div.innerHTML = text;
        } else {
            div.textContent = text;
        }
        logEl.appendChild(div);
        logEl.scrollTop = logEl.scrollHeight;
      };

      const sendCommand = () => {
        const cmd = (cmdEl.value || '').trim();
        if (!cmd) return;
        appendLine('> ' + cmd.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"), 'log'); // Echo command safe
        vscode.postMessage({ type: 'sendCommand', command: cmd });
        cmdEl.value = '';
        cmdEl.focus();
      };

      connectBtn.addEventListener('click', () => vscode.postMessage({ type: 'connect' }));
      disconnectBtn.addEventListener('click', () => vscode.postMessage({ type: 'disconnect' }));
      clearBtn.addEventListener('click', () => (logEl.innerHTML = ''));
      resetTokenBtn.addEventListener('click', () => vscode.postMessage({ type: 'resetToken' }));
      shardSelect.addEventListener('change', () => {
        vscode.postMessage({ type: 'setShard', shard: shardSelect.value });
      });
      sendBtn.addEventListener('click', sendCommand);
      cmdEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendCommand();
        }
      });

      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || !msg.type) return;
        if (msg.type === 'appendLog') appendLine(msg.text, msg.kind);
        if (msg.type === 'setStatus') statusEl.textContent = msg.text;
      });

      vscode.postMessage({ type: 'ready' });
      cmdEl.focus();
    </script>
  </body>
</html>`;
    }

    private getNonce(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 32; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}

