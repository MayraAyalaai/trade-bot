const dotenv = require('dotenv');
const BinanceAPI = require('./src/api/binance');
const MovingAverageStrategy = require('./src/strategies/movingAverage');
const Logger = require('./src/utils/logger');

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
            takeProfit: parseFloat(process.env.TAKE_PROFIT_PERCENT) / 100 || 0.03,
            tradeAmount: parseFloat(process.env.TRADE_AMOUNT) || 0.001
        };
        
        // Initialize components
        this.binanceAPI = new BinanceAPI(
            process.env.BINANCE_API_KEY,
            process.env.BINANCE_API_SECRET
        );
        this.strategy = new MovingAverageStrategy(10, 20);
        this.logger = new Logger();
        this.position = null; // null, 'LONG', 'SHORT'
        this.entryPrice = 0;
    }

    async start() {
        this.logger.info('Bot initialized with configuration', this.config);
        this.isRunning = true;
        
        try {
            // Test API connection
            const currentPrice = await this.binanceAPI.getPrice(this.config.symbol);
            this.logger.info(`Current ${this.config.symbol} price: $${currentPrice}`);
            
            // Get market stats
            const stats = await this.binanceAPI.get24hrStats(this.config.symbol);
            this.logger.info(`24h change: ${stats.priceChangePercent.toFixed(2)}%`);
            
            // Initialize strategy with historical data
            await this.initializeStrategy();
            
            this.logger.info('Bot is ready to trade!');
            
            // Start monitoring loop
            this.monitorMarket();
        } catch (error) {
            this.logger.error('Failed to start bot', { error: error.message });
            this.stop();
        }
    }

    async initializeStrategy() {
        try {
            // Get historical data to initialize moving averages
            const klines = await this.binanceAPI.getKlines(this.config.symbol, this.config.interval, 50);
            
            this.logger.info(`Initializing strategy with ${klines.length} historical prices`);
            
            // Add historical prices to strategy
            klines.forEach(kline => {
                this.strategy.addPrice(kline.close);
            });
            
            const stats = this.strategy.getStats();
            this.logger.info('Strategy initialized', stats);
        } catch (error) {
            this.logger.error('Failed to initialize strategy', { error: error.message });
        }
    }

    async monitorMarket() {
        if (!this.isRunning) return;
        
        try {
            const price = await this.binanceAPI.getPrice(this.config.symbol);
            
            // Add price to strategy and get signal
            this.strategy.addPrice(price);
            const signal = this.strategy.getSignal();
            
            this.logger.signal(signal);
            
            // Execute trades based on signal
            await this.processSignal(signal, price);
            
            // Check stop loss and take profit
            if (this.position) {
                await this.checkExitConditions(price);
            }
            
        } catch (error) {
            this.logger.error('Error monitoring market', { error: error.message });
        }
        
        // Check again in 1 minute
        setTimeout(() => this.monitorMarket(), 60000);
    }

    async processSignal(signal, currentPrice) {
        if (signal.action === 'BUY' && !this.position) {
            await this.enterLongPosition(currentPrice);
        } else if (signal.action === 'SELL' && this.position === 'LONG') {
            await this.exitPosition(currentPrice, 'Signal');
        }
    }

    async enterLongPosition(price) {
        this.position = 'LONG';
        this.entryPrice = price;
        
        this.logger.trade('BUY', {
            symbol: this.config.symbol,
            price: price,
            amount: this.config.tradeAmount,
            reason: 'Moving Average Signal'
        });
        
        this.logger.info(`Entered LONG position at $${price}`);
    }

    async exitPosition(price, reason) {
        if (!this.position) return;
        
        const pnl = ((price - this.entryPrice) / this.entryPrice) * 100;
        
        this.logger.trade('SELL', {
            symbol: this.config.symbol,
            price: price,
            amount: this.config.tradeAmount,
            entryPrice: this.entryPrice,
            pnl: pnl.toFixed(2) + '%',
            reason: reason
        });
        
        this.logger.info(`Exited ${this.position} position at $${price}, PnL: ${pnl.toFixed(2)}%`);
        
        this.position = null;
        this.entryPrice = 0;
    }

    async checkExitConditions(currentPrice) {
        if (!this.position || this.position !== 'LONG') return;
        
        const pnlPercent = (currentPrice - this.entryPrice) / this.entryPrice;
        
        // Stop loss check
        if (pnlPercent <= -this.config.stopLoss) {
            await this.exitPosition(currentPrice, 'Stop Loss');
        }
        // Take profit check
        else if (pnlPercent >= this.config.takeProfit) {
            await this.exitPosition(currentPrice, 'Take Profit');
        }
    }

    stop() {
        this.isRunning = false;
        console.log('Bot stopped.');
    }
}

// Initialize and start the bot
const bot = new TradingBot();
bot.start();