import * as vscode from 'vscode';
import { ScreepsClient } from './ScreepsClient';

export class ScreepsTerminal implements vscode.Pseudoterminal {
    private writeEmitter = new vscode.EventEmitter<string>();
    onDidWrite: vscode.Event<string> = this.writeEmitter.event;

    private closeEmitter = new vscode.EventEmitter<number>();
    onDidClose: vscode.Event<number> = this.closeEmitter.event;

    private client: ScreepsClient;
    private inputBuffer: string = '';

    constructor(token: string, opts?: { onToken?: (token: string) => void }) {
        this.client = new ScreepsClient(token, opts);
        
        // Wire up client events
        this.client.on('log', (msg) => {
            this.writeLine(`\x1b[36m[System]\x1b[0m ${msg}`);
        });

        this.client.on('error', (msg) => {
            this.writeLine(`\x1b[31m[Error]\x1b[0m ${msg}`);
        });

        this.client.on('console', (msg) => {
            // Replace newlines with \r\n for terminal
            const formatted = msg.replace(/\n/g, '\r\n');
            this.writeLine(formatted);
        });

        this.client.on('status', (evt: { state: string }) => {
            const label =
                evt.state === 'connecting' ? 'Connecting' :
                evt.state === 'connected' ? 'Connected' :
                evt.state === 'reconnecting' ? 'Reconnecting' :
                'Disconnected';
            this.writeLine(`\x1b[35m[Status]\x1b[0m ${label}`);
        });
    }

    open(initialDimensions: vscode.TerminalDimensions | undefined): void {
        this.writeLine('Welcome to Screeps Console!');
        this.client.connect().catch(() => {});
    }

    close(): void {
        this.client.disconnect();
    }

    handleInput(data: string): void {
        if (data === '\r') { // Enter
            this.writeEmitter.fire('\r\n');
            this.processInput();
        } else if (data === '\x7f') { // Backspace
            if (this.inputBuffer.length > 0) {
                this.inputBuffer = this.inputBuffer.substr(0, this.inputBuffer.length - 1);
                // Move cursor back, print space, move cursor back
                this.writeEmitter.fire('\b \b');
            }
        } else if (data === '\x03') { // Ctrl+C
            this.writeLine('^C');
            this.inputBuffer = '';
        } else {
            // Echo input
            this.inputBuffer += data;
            this.writeEmitter.fire(data);
        }
    }

    private processInput() {
        const command = this.inputBuffer.trim();
        this.inputBuffer = '';
        
        if (command) {
            this.client.sendCommand(command);
        }
    }

    private writeLine(msg: string) {
        this.writeEmitter.fire(msg + '\r\n');
    }
}
