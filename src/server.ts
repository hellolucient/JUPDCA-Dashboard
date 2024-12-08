import express from 'express';
import path from 'path';
import { TelegramService } from './telegram';
import { StorageService, TokenSnapshot } from './storage';

export class WebServer {
    private app = express();
    private port = process.env.PORT || 3000;
    private messageHistory: string[] = [];
    private latestSummary: string = '';
    private storage: StorageService;

    constructor(private telegram: TelegramService) {
        this.setupServer();
        this.storage = new StorageService();
    }

    private setupServer() {
        // Serve static files from public directory
        this.app.use(express.static(path.join(__dirname, '../public')));

        // API endpoints
        this.app.get('/api/telegram-messages', (_, res) => {
            res.json(this.messageHistory);
        });

        this.app.get('/api/summary', (_, res) => {
            res.json(this.latestSummary);
        });

        this.app.get('/api/historical', (_, res) => {
            res.json({
                LOGOS: this.storage.getHistory('LOGOS'),
                CHAOS: this.storage.getHistory('CHAOS')
            });
        });
    }

    public updateMessages(message: string) {
        this.messageHistory.unshift(message);
        // Keep only last 50 messages
        if (this.messageHistory.length > 50) {
            this.messageHistory.pop();
        }
    }

    public updateSummary(summary: string) {
        this.latestSummary = summary;
    }

    public storeSnapshot(token: 'LOGOS' | 'CHAOS', snapshot: TokenSnapshot) {
        this.storage.addSnapshot(token, snapshot);
    }

    public start() {
        this.app.listen(this.port, () => {
            console.log(`Web interface available at http://localhost:${this.port}`);
        });
    }
} 