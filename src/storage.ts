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
        // Keep last 24 hours of hourly data
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        this.data[token] = [
            ...this.data[token].filter(s => s.timestamp > oneDayAgo),
            snapshot
        ];
        this.saveData();
    }

    getHistory(token: 'LOGOS' | 'CHAOS'): TokenSnapshot[] {
        return this.data[token];
    }
} 