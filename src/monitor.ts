import { Connection, PublicKey } from '@solana/web3.js';
import { DCA } from '@jup-ag/dca-sdk';
import { config } from './config';
import { TelegramService } from './telegram';
import BN from 'bn.js';

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

export class JupiterMonitor {
    private connection: Connection;
    private telegram: TelegramService;
    private dca: DCA;
    private isRunning: boolean = false;

    // LOGOS token address
    private readonly LOGOS = new PublicKey('HJUfqXoYjC653f2p33i84zdCC3jc4EuVnbruSe5kpump');
    private readonly SOL = new PublicKey('So11111111111111111111111111111111111111112');

    constructor() {
        this.connection = new Connection(config.solana.rpcEndpoint);
        this.telegram = new TelegramService();
        this.dca = new DCA(this.connection);
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            console.log('Starting DCA monitor...');
            
            // Debug: Log available methods on DCA instance
            console.log('Available DCA methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(this.dca)));
            
            await this.telegram.sendAlert('Monitor starting up and watching for SOL-LOGOS DCA orders...');

            // Start polling for new DCA positions
            this.pollDcaPositions();
            
        } catch (error) {
            console.error('Error starting monitor:', error);
            this.isRunning = false;
        }
    }

    private async pollDcaPositions() {
        let lastKnownPositions = new Set<string>();

        while (this.isRunning) {
            try {
                // Get all DCA positions
                const allDcaAccounts = (await this.dca.getAll()) as ProgramDCAAccount[];
                console.log(`Found ${allDcaAccounts.length} total DCA positions`);

                // Log all positions for debugging
                allDcaAccounts.forEach(pos => {
                    console.log('DCA Position:', {
                        inputMint: pos.account.inputMint.toString(),
                        outputMint: pos.account.outputMint.toString(),
                        isSOL: pos.account.inputMint.equals(this.SOL),
                        isLOGOS: pos.account.outputMint.equals(this.LOGOS)
                    });
                });
                
                // Filter for SOL -> LOGOS positions
                const logosPositions = allDcaAccounts.filter((pos: ProgramDCAAccount) => 
                    pos.account.inputMint.equals(this.SOL) && 
                    pos.account.outputMint.equals(this.LOGOS)
                );

                console.log(`Found ${logosPositions.length} SOL -> LOGOS positions`);

                // Check for new positions
                for (const pos of logosPositions) {
                    const positionKey = pos.publicKey.toString();
                    
                    if (!lastKnownPositions.has(positionKey)) {
                        console.log('New LOGOS DCA position found:', positionKey);
                        
                        const message = [
                            '🔄 New LOGOS DCA Position Created',
                            `Total Amount: ${pos.account.inDeposited.sub(pos.account.inWithdrawn).toNumber() / 1e9} SOL`,
                            `Amount Per Cycle: ${pos.account.inAmountPerCycle.toNumber() / 1e9} SOL`,
                            `Frequency: Every ${pos.account.cycleFrequency.toNumber()} seconds`,
                            `Position: https://solscan.io/account/${positionKey}`
                        ].join('\n');

                        await this.telegram.sendAlert(message);
                        lastKnownPositions.add(positionKey);
                    }
                }

                // Update known positions
                const currentPositions = new Set<string>(
                    logosPositions.map((p: ProgramDCAAccount) => p.publicKey.toString())
                );
                lastKnownPositions = currentPositions;

            } catch (error) {
                console.error('Error polling DCA positions:', error);
            }

            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }

    public stop(): void {
        this.isRunning = false;
    }
}
 ` `