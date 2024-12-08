import axios from 'axios';
import { config } from './config';

interface TelegramResponse {
    ok: boolean;
}

export class TelegramService {
    private readonly baseUrl: string;
    private messageHandlers: ((message: string) => void)[] = [];
    
    constructor() {
        this.baseUrl = `https://api.telegram.org/bot${config.telegram.botToken}`;
    }

    onMessage(handler: (message: string) => void) {
        this.messageHandlers.push(handler);
    }

    async sendAlert(message: string): Promise<boolean> {
        try {
            const response = await axios.post<TelegramResponse>(`${this.baseUrl}/sendMessage`, {
                chat_id: config.telegram.chatId,
                text: message,
                parse_mode: 'HTML'
            });
            
            // Notify handlers of new message
            this.messageHandlers.forEach(handler => handler(message));
            
            return response.data.ok;
        } catch (error) {
            console.error('Failed to send Telegram alert:', error);
            return false;
        }
    }
}
