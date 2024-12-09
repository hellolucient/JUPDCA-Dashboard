import axios from 'axios';
import { config } from './config';

interface TelegramResponse {
    ok: boolean;
    parameters?: {
        retry_after?: number;
    };
}

interface QueuedMessage {
    message: string;
    timestamp: number;
    retryAfter?: number;
}

export class TelegramService {
    private readonly baseUrl: string;
    private messageHandlers: ((message: string) => void)[] = [];
    private messageQueue: QueuedMessage[] = [];
    private isProcessingQueue = false;
    private lastMessageTime = 0;
    private readonly MIN_INTERVAL = 1000; // Minimum 1 second between messages
    
    constructor() {
        this.baseUrl = `https://api.telegram.org/bot${config.telegram.botToken}`;
    }

    onMessage(handler: (message: string) => void) {
        this.messageHandlers.push(handler);
    }

    async sendAlert(message: string): Promise<boolean> {
        // Add to queue instead of sending immediately
        this.messageQueue.push({
            message,
            timestamp: Date.now()
        });

        // Start processing queue if not already running
        if (!this.isProcessingQueue) {
            this.processQueue();
        }

        return true;
    }

    private async processQueue() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        while (this.messageQueue.length > 0) {
            const now = Date.now();
            const timeSinceLastMessage = now - this.lastMessageTime;

            // Respect minimum interval
            if (timeSinceLastMessage < this.MIN_INTERVAL) {
                await new Promise(resolve => setTimeout(resolve, this.MIN_INTERVAL - timeSinceLastMessage));
            }

            const message = this.messageQueue.shift();
            if (!message) continue;

            try {
                console.log(`📤 Sending Telegram message (Queue size: ${this.messageQueue.length})`);
                
                const response = await axios.post<TelegramResponse>(`${this.baseUrl}/sendMessage`, {
                    chat_id: config.telegram.chatId,
                    text: message.message,
                    parse_mode: 'HTML'
                });

                this.lastMessageTime = Date.now();
                
                // Notify handlers
                this.messageHandlers.forEach(handler => handler(message.message));

                // Small delay between successful messages
                await new Promise(resolve => setTimeout(resolve, this.MIN_INTERVAL));

            } catch (error: any) {
                if (error.response?.status === 429) {
                    const retryAfter = error.response.data?.parameters?.retry_after || 30;
                    console.log(`🚫 Rate limited, waiting ${retryAfter} seconds... (Queue size: ${this.messageQueue.length})`);
                    
                    // Put message back in queue
                    this.messageQueue.unshift({
                        ...message,
                        retryAfter: retryAfter
                    });

                    // Wait for retry_after period
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                } else {
                    console.error('❌ Telegram API Error:', {
                        status: error.response?.status,
                        message: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        }

        this.isProcessingQueue = false;
    }
}
