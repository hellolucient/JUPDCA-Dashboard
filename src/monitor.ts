import { Connection, PublicKey } from '@solana/web3.js';
import { DCA } from '@jup-ag/dca-sdk';
import { config } from './config';
import { TelegramService } from './telegram';
import BN from 'bn.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import axios from 'axios';
import { WebServer } from './server';

// First cast to unknown, then to our type
type ProgramDCAAccount = {
    publicKey: PublicKey;
    account: {
        user: PublicKey;
        inputMint: PublicKey;
        outputMint: PublicKey;
        idx: BN;
        nextCycleAt: BN;
        inDeposited: BN;
        inWithdrawn: BN;
        outWithdrawn: BN;
        inUsed: BN;
        inAmountPerCycle: BN;
        cycleFrequency: BN;
        bump: number;
    };
};

// Add these interfaces near the top of the file, after the imports
interface JupiterTokenInfo {
    [key: string]: {
        symbol: string;
        decimals: number;
    };
}

interface SolscanTokenResponse {
    data: {
        symbol: string;
        decimals: string | number;
    };
}

interface TokenSummary {
    buyPositions: number;
    sellPositions: number;
    totalBuyVolume: BN;
    totalSellVolume: BN;
}

interface TokenSnapshot {
    timestamp: number;
    buyOrders: number;
    sellOrders: number;
    buyVolume: number;
    sellVolume: number;
}

export class JupiterMonitor {
    private connection: Connection;
    private telegram: TelegramService;
    private dca: DCA;
    private isRunning: boolean = false;
    private tokenNameCache: Map<string, string> = new Map();

    // Token addresses
    private readonly LOGOS = new PublicKey('HJUfqXoYjC653f2p33i84zdCC3jc4EuVnbruSe5kpump');
    private readonly CHAOS = new PublicKey('8SgNwESovnbG1oNEaPVhg6CR9mTMSK7jPvcYRe3wpump');
    
    // Common token mapping for fallback
    private readonly TOKEN_INFO: { [key: string]: { symbol: string, decimals: number } } = {
        // Stablecoins
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', decimals: 6 },
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', decimals: 6 },
        
        // Major Solana Tokens
        'So11111111111111111111111111111111111111112': { symbol: 'SOL', decimals: 9 },
        'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': { symbol: 'mSOL', decimals: 9 },
        'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol: 'BONK', decimals: 5 },
        'HJUfqXoYjC653f2p33i84zdCC3jc4EuVnbruSe5kpump': { symbol: 'LOGOS', decimals: 9 },
        '8SgNwESovnbG1oNEaPVhg6CR9mTMSK7jPvcYRe3wpump': { symbol: 'CHAOS', decimals: 6 },
        'RLBxxFkseAZ4RgJH3Sqn8jXxhmGoz9jWxDNJMh8pL7a': { symbol: 'RLBB', decimals: 2 },
        '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU': { symbol: 'SAMO', decimals: 9 },
        'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': { symbol: 'JUP', decimals: 6 },
        'RaydiumcNj6R7RQpzvp4LHvpqoVgp9GFpKCAU1jqUgb': { symbol: 'RAY', decimals: 6 },
        
        // Liquid Staking Derivatives
        'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': { symbol: 'bSOL', decimals: 9 },
        'jSoLgEP7hmg2Mz9sEK9kGHBkxXbfKqZgHhVGDpE5tE1': { symbol: 'jitoSOL', decimals: 9 },
        
        // Popular Meme Tokens
        'DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ': { symbol: 'DUST', decimals: 9 },
        'WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk': { symbol: 'WEN', decimals: 5 },
        'HAWKvTK8PtJ9mYHvEbz5AWpVBWRpQQpekJrBfBrbpBk6': { symbol: 'HAWK', decimals: 6 },
        
        // Other Notable Tokens
        'AFbX8oGjGpmVFywbVouvhQSRmiW2aR1mohfahi4Y2AdB': { symbol: 'GST', decimals: 9 },
        'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE': { symbol: 'ORCA', decimals: 6 },
        'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey': { symbol: 'MNDE', decimals: 9 },
        'HxhWkVpk5NS4Ltg5nij2G671CKXFRKM8Sk9QfF6MFeqo': { symbol: 'HXRO', decimals: 9 },
        'kinXdEcpDQeHPEuQnqmUgtYykqKGVFq6CeVX5iAHJq6': { symbol: 'KIN', decimals: 5 }
    };

    // Add list of monitored tokens for summary
    private readonly MONITORED_TOKENS = [
        // Our primary tokens
        'HJUfqXoYjC653f2p33i84zdCC3jc4EuVnbruSe5kpump', // LOGOS
        '8SgNwESovnbG1oNEaPVhg6CR9mTMSK7jPvcYRe3wpump', // CHAOS
        
        // Major tokens
        'So11111111111111111111111111111111111111112',   // SOL
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
        'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
        'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
        'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', // JUP
        'WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk', // WEN
        'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1', // bSOL
        'jSoLgEP7hmg2Mz9sEK9kGHBkxXbfKqZgHhVGDpE5tE1', // jitoSOL
        '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', // SAMO
        'RaydiumcNj6R7RQpzvp4LHvpqoVgp9GFpKCAU1jqUgb', // RAY
        'DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ', // DUST
        'HAWKvTK8PtJ9mYHvEbz5AWpVBWRpQQpekJrBfBrbpBk6', // HAWK
        'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE', // ORCA
        'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey', // MNDE
        'HxhWkVpk5NS4Ltg5nij2G671CKXFRKM8Sk9QfF6MFeqo', // HXRO
        'kinXdEcpDQeHPEuQnqmUgtYykqKGVFq6CeVX5iAHJq6', // KIN
        'RLBxxFkseAZ4RgJH3Sqn8jXxhmGoz9jWxDNJMh8pL7a'  // RLBB
    ].map(addr => new PublicKey(addr));

    constructor(private readonly webServer?: WebServer) {
        this.connection = new Connection(config.solana.rpcEndpoint);
        this.telegram = new TelegramService();
        this.dca = new DCA(this.connection);

        // Forward telegram messages to web interface
        if (webServer) {
            this.telegram.onMessage((message) => {
                webServer.updateMessages(message);
            });
        }
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            console.log('Starting DCA monitor...');
            
            // Debug: Log available methods on DCA instance
            console.log('Available DCA methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(this.dca)));
            
            await this.telegram.sendAlert('Monitor starting up and watching for LOGOS & CHAOS DCA orders...');

            // Start polling for new DCA positions
            this.pollDcaPositions();
            
        } catch (error) {
            console.error('Error starting monitor:', error);
            this.isRunning = false;
        }
    }

    private async getTokenMetadata(mintAddress: PublicKey): Promise<string> {
        const address = mintAddress.toString();
        
        if (this.tokenNameCache.has(address)) {
            return this.tokenNameCache.get(address)!;
        }

        try {
            const response = await axios.get<JupiterTokenInfo>('https://token.jup.ag/strict');
            
            if (response.data[address]) {
                const symbol = response.data[address].symbol;
                this.tokenNameCache.set(address, symbol);
                return symbol;
            }

            return this.TOKEN_INFO[address]?.symbol || 
                   `Unknown (${address.slice(0, 4)}...${address.slice(-4)})`;
        } catch (error) {
            console.error(`Error fetching metadata for ${address}:`, error);
            return this.TOKEN_INFO[address]?.symbol || 
                   `Unknown (${address.slice(0, 4)}...${address.slice(-4)})`;
        }
    }

    private async getTokenInfo(mintAddress: PublicKey): Promise<{ symbol: string, decimals: number }> {
        const address = mintAddress.toString();
        
        // First check our TOKEN_INFO mapping
        if (this.TOKEN_INFO[address]) {
            return this.TOKEN_INFO[address];
        }

        // If it's not in our TOKEN_INFO, we'll ignore it
        // This way we only track our monitored tokens
        const shortAddr = `${address.slice(0, 4)}...${address.slice(-4)}`;
        return { 
            symbol: `Unknown (${shortAddr})`,
            decimals: 9
        };
    }

    private async formatTokenAmount(amount: BN, mintAddress: PublicKey): Promise<string> {
        const { decimals } = await this.getTokenInfo(mintAddress);
        
        // Create BN for the decimal factor
        const factor = new BN(10).pow(new BN(decimals));
        
        // Perform division in BN
        const wholePart = amount.div(factor);
        const fractionalPart = amount.mod(factor);
        
        // Convert to string and handle formatting
        let result = wholePart.toString();
        
        // Add commas for thousands
        result = result.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        
        // Only add fractional part if it's non-zero
        if (!fractionalPart.isZero()) {
            // Convert fractional part to string and pad with leading zeros
            let fractionalStr = fractionalPart.toString().padStart(decimals, '0');
            // Remove trailing zeros
            fractionalStr = fractionalStr.replace(/0+$/, '');
            // Only add if there's something left after removing trailing zeros
            if (fractionalStr.length > 0) {
                result += '.' + fractionalStr;
            }
        }
        
        return result;
    }

    private async pollDcaPositions() {
        let lastKnownPositions = new Map<string, ProgramDCAAccount>();
        let lastSummaryTime = 0;
        const SUMMARY_INTERVAL = 60000; // Generate summary every minute

        while (this.isRunning) {
            try {
                console.log('📊 Fetching DCA positions...');
                const startTime = Date.now();
                
                const allDcaAccounts = (await this.dca.getAll()) as ProgramDCAAccount[];
                
                console.log(`✅ Found ${allDcaAccounts.length} total DCA positions in ${Date.now() - startTime}ms`);

                // First filter for all monitored tokens for summary
                const monitoredPositions = allDcaAccounts.filter(pos => 
                    this.MONITORED_TOKENS.some(token => 
                        pos.account.inputMint.equals(token) || 
                        pos.account.outputMint.equals(token)
                    )
                );

                console.log(`Found ${monitoredPositions.length} positions for monitored tokens`);

                // Generate summary on startup and every minute
                const currentTime = Date.now();
                if (lastSummaryTime === 0 || currentTime - lastSummaryTime >= SUMMARY_INTERVAL) {
                    console.log('Generating new summary...');
                    const summaryMessage = await this.generateDcaSummary(monitoredPositions);
                    await this.telegram.sendAlert(summaryMessage);
                    lastSummaryTime = currentTime;
                }

                // Filter for just LOGOS and CHAOS positions for detailed monitoring
                const logosAndChaosPositions = monitoredPositions.filter(pos => 
                    pos.account.inputMint.equals(this.LOGOS) || 
                    pos.account.outputMint.equals(this.LOGOS) ||
                    pos.account.inputMint.equals(this.CHAOS) || 
                    pos.account.outputMint.equals(this.CHAOS)
                );

                // Create a map of current LOGOS/CHAOS positions
                const currentPositions = new Map(
                    logosAndChaosPositions.map(pos => [pos.publicKey.toString(), pos])
                );

                // Check for closed positions (LOGOS and CHAOS only)
                for (const [positionKey, oldPosition] of lastKnownPositions) {
                    if (!currentPositions.has(positionKey)) {
                        const isLogosPosition = oldPosition.account.inputMint.equals(this.LOGOS) || 
                                              oldPosition.account.outputMint.equals(this.LOGOS);
                        const tokenName = isLogosPosition ? 'LOGOS' : 'CHAOS';
                        const wasBuyingToken = oldPosition.account.outputMint.equals(isLogosPosition ? this.LOGOS : this.CHAOS);
                        
                        const inputTokenInfo = await this.getTokenInfo(oldPosition.account.inputMint);
                        const outputTokenInfo = await this.getTokenInfo(oldPosition.account.outputMint);
                        
                        const directionArrow = '🟠 🗑';
                        
                        const message = [
                            `${directionArrow} ${tokenName} DCA Position Closed`,
                            `Direction: ${wasBuyingToken ? `${inputTokenInfo.symbol} ➜ ${tokenName}` : `${tokenName} ➜ ${outputTokenInfo.symbol}`}`,
                            `Position: https://solscan.io/account/${positionKey}`
                        ].join('\n');

                        await this.telegram.sendAlert(message);
                    }
                }

                // Check for new positions (LOGOS and CHAOS only)
                for (const [positionKey, pos] of currentPositions) {
                    if (!lastKnownPositions.has(positionKey)) {
                        const isLogosPosition = pos.account.inputMint.equals(this.LOGOS) || 
                                              pos.account.outputMint.equals(this.LOGOS);
                        const tokenName = isLogosPosition ? 'LOGOS' : 'CHAOS';
                        const isBuyingToken = pos.account.outputMint.equals(isLogosPosition ? this.LOGOS : this.CHAOS);
                        
                        const inputMint = pos.account.inputMint;
                        const inputTokenInfo = await this.getTokenInfo(inputMint);
                        const outputTokenInfo = await this.getTokenInfo(pos.account.outputMint);

                        const tokenAmount = await this.formatTokenAmount(
                            pos.account.inDeposited.sub(pos.account.inWithdrawn),
                            inputMint
                        );
                        const amountPerCycle = await this.formatTokenAmount(
                            pos.account.inAmountPerCycle,
                            inputMint
                        );
                        
                        const directionArrow = isBuyingToken ? '🟢 ⬆️' : '🔴 ⬇️';
                        
                        const message = [
                            `${directionArrow} ${tokenName} DCA Position (${isBuyingToken ? 'Buying' : 'Selling'} ${tokenName})`,
                            `Input Token: ${inputTokenInfo.symbol}`,
                            `Output Token: ${outputTokenInfo.symbol}`,
                            `Total Amount: ${tokenAmount} ${isBuyingToken ? inputTokenInfo.symbol : tokenName}`,
                            `Amount Per Cycle: ${amountPerCycle} ${isBuyingToken ? inputTokenInfo.symbol : tokenName}`,
                            `Frequency: Every ${pos.account.cycleFrequency.toNumber()} seconds`,
                            `Position: https://solscan.io/account/${positionKey}`
                        ].join('\n');

                        await this.telegram.sendAlert(message);
                    }
                }

                // Update last known positions for next iteration
                lastKnownPositions = currentPositions;

            } catch (error) {
                console.error('Error in DCA monitor:', error);
                
                // Log detailed error information
                if (error instanceof Error) {
                    console.error({
                        message: error.message,
                        stack: error.stack,
                        timestamp: new Date().toISOString()
                    });
                } else {
                    console.error({
                        message: String(error),
                        timestamp: new Date().toISOString()
                    });
                }
            }

            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }

    public stop(): void {
        this.isRunning = false;
    }

    private async generateDcaSummary(positions: ProgramDCAAccount[]): Promise<string> {
        console.log('Generating summary for', positions.length, 'positions');
        
        // Create a dynamic summary object initialized with our monitored tokens
        const summary: { [key: string]: TokenSummary } = {};
        
        // Initialize summary for all monitored tokens
        for (const token of this.MONITORED_TOKENS) {
            const tokenInfo = await this.getTokenInfo(token);
            summary[tokenInfo.symbol] = {
                buyPositions: 0,
                sellPositions: 0,
                totalBuyVolume: new BN(0),
                totalSellVolume: new BN(0)
            };
        }

        // Process each position
        for (const pos of positions) {
            // Find which monitored token this position is for
            const monitoredToken = this.MONITORED_TOKENS.find(token => 
                pos.account.inputMint.equals(token) || pos.account.outputMint.equals(token)
            );

            if (!monitoredToken) continue;

            const tokenInfo = await this.getTokenInfo(monitoredToken);
            const tokenSymbol = tokenInfo.symbol;
            
            const isBuyingToken = pos.account.outputMint.equals(monitoredToken);
            const volume = pos.account.inDeposited.sub(pos.account.inWithdrawn);

            if (isBuyingToken) {
                summary[tokenSymbol].buyPositions++;
                summary[tokenSymbol].totalBuyVolume = summary[tokenSymbol].totalBuyVolume.add(volume);
            } else {
                summary[tokenSymbol].sellPositions++;
                summary[tokenSymbol].totalSellVolume = summary[tokenSymbol].totalSellVolume.add(volume);
            }
        }

        // Generate message
        const summaryLines = ['📊 DCA Position Summary:'];
        
        for (const [symbol, data] of Object.entries(summary)) {
            if (data.buyPositions > 0 || data.sellPositions > 0) {
                const buyVolume = await this.formatTokenAmount(data.totalBuyVolume, new PublicKey(this.MONITORED_TOKENS.find(token => 
                    this.TOKEN_INFO[token.toString()]?.symbol === symbol
                )!));
                const sellVolume = await this.formatTokenAmount(data.totalSellVolume, new PublicKey(this.MONITORED_TOKENS.find(token => 
                    this.TOKEN_INFO[token.toString()]?.symbol === symbol
                )!));

                summaryLines.push(`\n${symbol}:`);
                summaryLines.push(`🟢 Buy Orders: ${data.buyPositions}`);
                summaryLines.push(`💰 Buy Volume: ${buyVolume}`);
                summaryLines.push(`🔴 Sell Orders: ${data.sellPositions}`);
                summaryLines.push(`💰 Sell Volume: ${sellVolume}`);
            }
        }

        const summaryText = summaryLines.join('\n');
        
        // Send summary to web server
        if (this.webServer) {
            this.webServer.updateSummary(summaryText);
        }

        return summaryText;
    }

    // Add helper method for calculating expected output
    private calculateExpectedOutput(inputAmount: BN, inputDecimals: number, outputDecimals: number): BN {
        // This is a simplified calculation - in reality we'd need price data
        // For now, let's adjust for decimal differences
        const decimalDiff = outputDecimals - inputDecimals;
        if (decimalDiff > 0) {
            return inputAmount.mul(new BN(10).pow(new BN(decimalDiff)));
        } else if (decimalDiff < 0) {
            return inputAmount.div(new BN(10).pow(new BN(-decimalDiff)));
        }
        return inputAmount;
    }
}
 ` `