import axios from 'axios';
import * as WebSocket from 'ws';
import { EventEmitter } from 'events';

export class ScreepsClient extends EventEmitter {
    private token: string;
    private userId: string | null = null;
    private ws: WebSocket | null = null;
    private connected: boolean = false;
    private activeShard: string = 'shard3'; // Default to shard3, will auto-detect from logs

    constructor(token: string) {
        super();
        this.token = token;
    }

    public async connect() {
        try {
            // 1. Get User ID via HTTP
            this.emit('log', 'Authenticating...');
            const response = await axios.get('https://screeps.com/api/auth/me', {
                headers: {
                    'X-Token': this.token,
                    'X-Username': this.token // Sometimes needed? No, X-Token is standard.
                }
            });

            if (response.data && response.data._id) {
                this.userId = response.data._id;
                this.emit('log', `Authenticated as user ID: ${this.userId}`);
            } else {
                throw new Error('Failed to retrieve user ID');
            }

            // 2. Connect WebSocket
            this.connectWebSocket();

        } catch (error: any) {
            this.emit('error', `Connection failed: ${error.message}`);
        }
    }

    private connectWebSocket() {
        // Use raw websocket url mimicking SockJS
        // Format: /socket/<server>/<session>/websocket
        const serverId = Math.floor(Math.random() * 1000);
        const sessionId = Math.random().toString(36).substring(2, 10);
        const url = `wss://screeps.com/socket/${serverId}/${sessionId}/websocket`;

        this.emit('log', `Connecting to WebSocket: ${url}`);
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            this.emit('log', 'WebSocket connected.');
            this.connected = true;
            this.authenticateWebSocket();
        });

        this.ws.on('message', (data: WebSocket.RawData) => {
            this.handleMessage(data.toString());
        });

        this.ws.on('close', () => {
            this.emit('log', 'WebSocket disconnected.');
            this.connected = false;
        });

        this.ws.on('error', (err) => {
            this.emit('error', `WebSocket error: ${err.message}`);
        });
    }

    private authenticateWebSocket() {
        if (!this.ws) return;
        // SockJS: ["message"]
        const authMsg = `auth ${this.token}`;
        this.sendSockJS(authMsg);
    }

    private subscribeConsole() {
        if (!this.ws || !this.userId) return;
        const subMsg = `subscribe user:${this.userId}/console`;
        this.sendSockJS(subMsg);
        this.emit('log', 'Subscribed to console.');
    }

    private sendSockJS(msg: string) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Wrap in array for SockJS
            this.ws.send(JSON.stringify([msg]));
        }
    }

    private handleMessage(data: string) {
        // SockJS protocol
        // o: open (handled by on('open') usually? No, WS open is TCP open. SockJS sends 'o' frame)
        // h: heartbeat
        // a: array of messages
        // c: close

        if (data.startsWith('o')) {
            // Open frame, do nothing or re-auth if needed?
        } else if (data.startsWith('h')) {
            // Heartbeat
        } else if (data.startsWith('a')) {
            try {
                const messages = JSON.parse(data.substring(1)); // Remove 'a'
                for (const msg of messages) {
                    this.processInnerMessage(msg);
                }
            } catch (e) {
                console.error('Failed to parse SockJS message', e);
            }
        }
    }

    private processInnerMessage(msg: string) {
        // Inner messages:
        // "auth ok <token>"
        // "time <time>"
        // "protocol <ver>"
        // "package <ver>"
        // ["channel", data]

        if (msg.startsWith('auth ok')) {
            this.emit('log', 'WebSocket Authentication successful.');
            this.subscribeConsole();
        } else if (msg.startsWith('auth failed')) {
            this.emit('error', 'WebSocket Authentication failed.');
        } else if (msg.startsWith('time')) {
            // Tick update
        } else if (msg.startsWith('[')) {
            // Channel message
            try {
                const [channel, payload] = JSON.parse(msg);
                if (channel.endsWith('/console')) {
                    this.handleConsolePayload(payload);
                }
            } catch (e) {
                // Ignore
            }
        }
    }

    private handleConsolePayload(payload: any) {
        // Payload structure: { messages: { log: [], results: [] }, shard: "shard0" }
        if (payload.shard) {
            this.activeShard = payload.shard;
        }
        if (payload.messages) {
            if (payload.messages.log) {
                for (const log of payload.messages.log) {
                    this.emit('console', log);
                }
            }
            if (payload.messages.results) {
                for (const res of payload.messages.results) {
                    this.emit('console', `Result: ${res}`);
                }
            }
        } else if (payload.error) {
             this.emit('console', `Error: ${payload.error}`);
        }
    }

    public setActiveShard(shard: string) {
        this.activeShard = shard;
    }

    public async sendCommand(expression: string) {
        if (!this.userId) {
            this.emit('error', 'Cannot send command: Not authenticated.');
            return;
        }

        try {
            await axios.post('https://screeps.com/api/user/console', {
                expression: expression,
                shard: this.activeShard
            }, {
                headers: {
                    'X-Token': this.token
                }
            });
            // We don't need to log success, the result will come back via WebSocket
        } catch (error: any) {
             this.emit('error', `Command failed: ${error.message}`);
        }
    }

    public disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
