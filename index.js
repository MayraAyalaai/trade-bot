const dotenv = require('dotenv');
const BinanceAPI = require('./src/api/binance');

// Load environment variables
dotenv.config();

console.log('Crypto Trading Bot Starting...');

// Basic bot structure
class TradingBot {
    constructor() {
        this.isRunning = false;
        this.config = {
            symbol: process.env.TRADING_SYMBOL || 'BTCUSDT',
            interval: '5m',
            stopLoss: parseFloat(process.env.STOP_LOSS_PERCENT) / 100 || 0.02,
            takeProfit: parseFloat(process.env.TAKE_PROFIT_PERCENT) / 100 || 0.03
        };
        
        // Initialize Binance API
        this.binanceAPI = new BinanceAPI(
            process.env.BINANCE_API_KEY,
            process.env.BINANCE_API_SECRET
        );
    }

    async start() {
        console.log('Bot initialized with configuration:', this.config);
        this.isRunning = true;
        
        try {
            // Test API connection
            const currentPrice = await this.binanceAPI.getPrice(this.config.symbol);
            console.log(`Current ${this.config.symbol} price: $${currentPrice}`);
            
            // Get market stats
            const stats = await this.binanceAPI.get24hrStats(this.config.symbol);
            console.log(`24h change: ${stats.priceChangePercent.toFixed(2)}%`);
            
            console.log('Bot is ready to trade!');
            
            // Start monitoring loop
            this.monitorMarket();
        } catch (error) {
            console.error('Failed to start bot:', error.message);
            this.stop();
        }
    }

    async monitorMarket() {
        if (!this.isRunning) return;
        
        try {
            const price = await this.binanceAPI.getPrice(this.config.symbol);
            console.log(`[${new Date().toISOString()}] ${this.config.symbol}: $${price}`);
        } catch (error) {
            console.error('Error monitoring market:', error.message);
        }
        
        // Check again in 30 seconds
        setTimeout(() => this.monitorMarket(), 30000);
    }

    stop() {
        this.isRunning = false;
        console.log('Bot stopped.');
    }
}

// Initialize and start the bot
const bot = new TradingBot();
bot.start();