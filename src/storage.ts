import fs from 'fs';
import path from 'path';

export interface TokenSnapshot {
    timestamp: number;
    buyOrders: number;
    sellOrders: number;
    buyVolume: number;
    sellVolume: number;
}

export interface HistoricalData {
    LOGOS: TokenSnapshot[];
    CHAOS: TokenSnapshot[];
}

export class StorageService {
    private readonly dataPath: string;
    private data: HistoricalData;

    constructor() {
        this.dataPath = path.join(__dirname, '../data/historical.json');
        this.ensureDataFile();
        this.data = this.loadData();
    }

    private ensureDataFile() {
        const dir = path.dirname(this.dataPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.dataPath)) {
            fs.writeFileSync(this.dataPath, JSON.stringify({ LOGOS: [], CHAOS: [] }));
        }
    }

    private loadData(): HistoricalData {
        const content = fs.readFileSync(this.dataPath, 'utf-8');
        return JSON.parse(content);
    }

    private saveData() {
        fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
    }

    addSnapshot(token: 'LOGOS' | 'CHAOS', snapshot: TokenSnapshot) {
        console.log(`📊 Adding ${token} snapshot:`, {
            timestamp: new Date(snapshot.timestamp).toISOString(),
            buyOrders: snapshot.buyOrders,
            sellOrders: snapshot.sellOrders,
            buyVolume: snapshot.buyVolume.toLocaleString(),
            sellVolume: snapshot.sellVolume.toLocaleString(),
            historicalDataPoints: this.data[token].length
        });

        // Keep last 7 days of hourly data
        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        this.data[token] = [
            ...this.data[token].filter(s => s.timestamp > oneWeekAgo),
            snapshot
        ];

        console.log(`📈 Historical data for ${token}:`, {
            totalDataPoints: this.data[token].length,
            oldestPoint: new Date(this.data[token][0].timestamp).toISOString(),
            newestPoint: new Date(this.data[token][this.data[token].length - 1].timestamp).toISOString()
        });

        this.saveData();
    }

    getHistory(token: 'LOGOS' | 'CHAOS', period: 'daily' | 'weekly' = 'daily'): TokenSnapshot[] {
        const data = this.data[token];
        const now = Date.now();

        if (period === 'daily') {
            // Last 24 hours of data
            const oneDayAgo = now - (24 * 60 * 60 * 1000);
            return data.filter(s => s.timestamp > oneDayAgo);
        } else {
            // Last 7 days of data
            const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
            return data.filter(s => s.timestamp > oneWeekAgo);
        }
    }
} 