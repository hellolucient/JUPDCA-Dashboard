import express from 'express';
import path from 'path';
import { TelegramService } from './telegram';
import { StorageService, TokenSnapshot } from './storage';

interface StoredPosition {
    token: 'LOGOS' | 'CHAOS';
    type: 'BUY' | 'SELL';
    publicKey: string;
    inputToken: string;
    outputToken: string;
    totalAmount: string;
    amountPerCycle: string;
    frequency: number;
    lastUpdate: number;
    message: string;  // Original message for display
}

export class WebServer {
    private app = express();
    private port = process.env.PORT || 3000;
    private messageHistory: string[] = [];  // Keep last 50 alerts
    private positions: StoredPosition[] = [];  // Store all positions
    private latestSummary: string = '';
    private storage: StorageService;
    private isInitialized: boolean = false;

    constructor(private telegram: TelegramService) {
        this.setupServer();
        this.storage = new StorageService();
    }

    private setupServer() {
        // Serve static files from public directory FIRST
        this.app.use(express.static(path.join(__dirname, '../public')));

        // Then add API middleware that checks initialization
        this.app.use('/api', (req, res, next) => {
            if (!this.isInitialized) {
                res.status(503).json({ message: 'Server initializing, please wait...' });
                return;
            }
            next();
        });

        // API endpoints
        this.app.get('/api/messages', (_, res) => {
            const response = {
                messages: this.messageHistory,
                summary: this.latestSummary
            };
            res.json(response);
        });

        this.app.get('/api/historical', (req, res) => {
            const period = (req.query.period as string) || 'daily';
            const data = {
                LOGOS: this.storage.getHistory('LOGOS', period as 'daily' | 'weekly'),
                CHAOS: this.storage.getHistory('CHAOS', period as 'daily' | 'weekly')
            };
            console.log('Historical data requested:', {
                period,
                dataLength: {
                    LOGOS: data.LOGOS.length,
                    CHAOS: data.CHAOS.length
                }
            });
            res.json(data);
        });

        // Add new endpoint for positions
        this.app.get('/api/positions/:token', (req, res) => {
            const token = req.params.token.toUpperCase() as 'LOGOS' | 'CHAOS';
            const positions = this.positions.filter(p => p.token === token);
            res.json(positions);
        });
    }

    public updateMessages(message: string) {
        // If it's a position message, store it in positions array
        if (message.includes('DCA Position')) {
            const position = this.parsePositionMessage(message);
            if (position) {
                this.updatePosition(position);
            }
        }

        // Keep recent messages for alerts
        console.log('💬 Storing message:', {
            messagePreview: message.slice(0, 50) + '...',
            currentHistorySize: this.messageHistory.length
        });
        this.messageHistory.unshift(message);
        if (this.messageHistory.length > 50) {
            this.messageHistory.pop();
        }
        this.isInitialized = true;
    }

    private parsePositionMessage(message: string): StoredPosition | null {
        // Parse the message into a position object
        const isChaos = message.includes('CHAOS DCA Position');
        const isLogos = message.includes('LOGOS DCA Position');
        if (!isChaos && !isLogos) return null;

        const token = isChaos ? 'CHAOS' : 'LOGOS';
        const type = message.includes('(Buying') ? 'BUY' : 'SELL';
        
        // Extract other details using regex
        const publicKey = message.match(/Position: https:\/\/solscan\.io\/account\/([a-zA-Z0-9]+)/)?.[1];
        if (!publicKey) return null;

        return {
            token,
            type,
            publicKey,
            inputToken: message.match(/Input Token: ([^\n]+)/)?.[1] || '',
            outputToken: message.match(/Output Token: ([^\n]+)/)?.[1] || '',
            totalAmount: message.match(/Total Amount: ([^\n]+)/)?.[1] || '',
            amountPerCycle: message.match(/Amount Per Cycle: ([^\n]+)/)?.[1] || '',
            frequency: parseInt(message.match(/Every (\d+) seconds/)?.[1] || '0'),
            lastUpdate: Date.now(),
            message
        };
    }

    private updatePosition(position: StoredPosition) {
        const index = this.positions.findIndex(p => p.publicKey === position.publicKey);
        if (index >= 0) {
            this.positions[index] = position;
        } else {
            this.positions.push(position);
        }
        console.log(`📊 Position ${position.publicKey} ${index >= 0 ? 'updated' : 'added'} for ${position.token}`);
    }

    public updateSummary(summary: string) {
        console.log('Updating summary:', summary);
        this.latestSummary = summary;
        this.isInitialized = true;  // Mark as initialized when we get first summary
    }

    public storeSnapshot(token: 'LOGOS' | 'CHAOS', snapshot: TokenSnapshot) {
        console.log(`Storing snapshot for ${token}:`, snapshot);
        this.storage.addSnapshot(token, snapshot);
    }

    public start() {
        this.app.listen(this.port, () => {
            console.log(`Web interface available at http://localhost:${this.port}`);
        });
    }
} 