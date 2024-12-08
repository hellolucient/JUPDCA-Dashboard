import { JupiterMonitor } from './monitor';
import { WebServer } from './server';
import { TelegramService } from './telegram';

async function main() {
    try {
        const telegram = new TelegramService();
        const webServer = new WebServer(telegram);
        const monitor = new JupiterMonitor(webServer);

        // Start both services
        webServer.start();
        await monitor.start();
        
        console.log('Jupiter DCA Monitor started successfully');
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            monitor.stop();
            process.exit(0);
        });
    } catch (error) {
        console.error('Failed to start monitor:', error);
        process.exit(1);
    }
}

main();
