import * as vscode from 'vscode';
import { ScreepsTerminal } from './ScreepsTerminal';
import { ScreepsConsoleViewProvider } from './ScreepsConsoleView';

export function activate(context: vscode.ExtensionContext) {
    console.log('Screeps Console extension is now active!');

    const getOrPromptToken = async (): Promise<string | undefined> => {
        const secretStorage = context.secrets;
        let token = await secretStorage.get('screeps_token');
        if (token) {
            return token;
        }

        token = await vscode.window.showInputBox({
            prompt: 'Enter your Screeps Auth Token',
            placeHolder: 'Find it in your Account Settings -> Auth Tokens',
            ignoreFocusOut: true,
            password: true
        });

        if (!token) {
            return undefined;
        }

        await secretStorage.store('screeps_token', token);
        return token;
    };

    const openConsoleTerminal = async () => {
        const token = await getOrPromptToken();
        if (!token) {
            vscode.window.showErrorMessage('Screeps Token is required to connect.');
            return;
        }

        const pty = new ScreepsTerminal(token, {
            onToken: (nextToken) => void context.secrets.store('screeps_token', nextToken)
        });
        const terminal = vscode.window.createTerminal({
            name: 'Screeps Console',
            pty: pty
        });

        terminal.show();
    };

    const disposable = vscode.commands.registerCommand('screeps-console.open', openConsoleTerminal);

    context.subscriptions.push(disposable);

    const viewProvider = new ScreepsConsoleViewProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(ScreepsConsoleViewProvider.viewId, viewProvider, {
        webviewOptions: { retainContextWhenHidden: true }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('screeps-console.showPanel', async () => {
        await viewProvider.reveal();
    }));
    
    // Command to clear/reset token
    context.subscriptions.push(vscode.commands.registerCommand('screeps-console.resetToken', async () => {
        await context.secrets.delete('screeps_token');
        vscode.window.showInformationMessage('Screeps Token cleared.');
    }));

    context.subscriptions.push(vscode.window.registerTerminalProfileProvider('screeps-console.profile', {
        provideTerminalProfile: async () => {
            const token = await getOrPromptToken();
            if (!token) {
                return undefined;
            }

            return new vscode.TerminalProfile({
                name: 'Screeps Console',
                pty: new ScreepsTerminal(token, {
                    onToken: (nextToken) => void context.secrets.store('screeps_token', nextToken)
                })
            });
        }
    }));
}

export function deactivate() {}
