import fs from 'fs';
import path from 'path';
import { TokenSnapshot, HistoricalData } from './storage';

function generateTestData(): HistoricalData {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    
    const data: HistoricalData = {
        LOGOS: [],
        CHAOS: []
    };

    // Generate hourly data for the past week
    for (let time = now - oneWeek; time <= now; time += 3600000) { // hourly intervals
        // LOGOS data (smaller volumes)
        data.LOGOS.push({
            timestamp: time,
            buyOrders: Math.floor(Math.random() * 10) + 1,
            sellOrders: Math.floor(Math.random() * 20) + 5,
            buyVolume: Math.floor(Math.random() * 50000) + 10000,
            sellVolume: Math.floor(Math.random() * 100000) + 50000
        });

        // CHAOS data (larger volumes)
        data.CHAOS.push({
            timestamp: time,
            buyOrders: Math.floor(Math.random() * 15) + 1,
            sellOrders: Math.floor(Math.random() * 30) + 5,
            buyVolume: Math.floor(Math.random() * 100000) + 20000,
            sellVolume: Math.floor(Math.random() * 80000000) + 50000000
        });
    }

    return data;
}

// Generate and save test data
const testData = generateTestData();
const dataPath = path.join(__dirname, '../data/historical.json');

// Ensure directory exists
const dir = path.dirname(dataPath);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

// Write data
fs.writeFileSync(dataPath, JSON.stringify(testData, null, 2));
console.log('Test data generated successfully!'); 