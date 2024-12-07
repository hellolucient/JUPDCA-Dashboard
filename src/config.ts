import * as dotenv from 'dotenv';
dotenv.config();

if (!process.env.TELEGRAM_BOT_TOKEN || 
    !process.env.TELEGRAM_CHAT_ID || 
    !process.env.SOLANA_RPC_ENDPOINT) {
    throw new Error('Missing required environment variables');
}

export const config = {
    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID
    },
    solana: {
        rpcEndpoint: process.env.SOLANA_RPC_ENDPOINT
    }
};
