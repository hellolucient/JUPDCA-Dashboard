import express from 'express';
import path from 'path';
import { TelegramService } from './telegram';

export class WebServer {
    private app = express();
    private port = process.env.PORT || 3000;
    private messageHistory: string[] = [];
    private latestSummary: string = '';

    constructor(private telegram: TelegramService) {
        this.setupServer();
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

    public start() {
        this.app.listen(this.port, () => {
            console.log(`Web interface available at http://localhost:${this.port}`);
        });
    }
} 