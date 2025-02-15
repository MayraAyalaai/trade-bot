const dotenv = require('dotenv');
const BinanceAPI = require('./src/api/binance');
const MovingAverageStrategy = require('./src/strategies/movingAverage');
const Logger = require('./src/utils/logger');
const Config = require('./src/config/config');
const ErrorHandler = require('./src/utils/errorHandler');
const PerformanceAnalyzer = require('./src/analytics/performanceAnalyzer');

// Load environment variables
dotenv.config();

console.log('Crypto Trading Bot Starting...');

// Enhanced bot structure with better configuration and error handling
class TradingBot {
    constructor(configPath) {
        this.isRunning = false;
        this.config = new Config(configPath);
        this.logger = new Logger();
        this.errorHandler = new ErrorHandler(this.logger);
        
        // Validate configuration
        const configErrors = this.config.validate();
        if (configErrors.length > 0) {
            this.logger.error('Configuration validation failed', { errors: configErrors });
            throw new Error(`Configuration errors: ${configErrors.join(', ')}`);
        }
        
        // Initialize components with config
        const apiConfig = this.config.getApiConfig();
        this.binanceAPI = new BinanceAPI(
            apiConfig.binance.apiKey,
            apiConfig.binance.apiSecret
        );
        
        const strategyConfig = this.config.getStrategyConfig();
        this.strategy = new MovingAverageStrategy(
            strategyConfig.parameters.shortPeriod,
            strategyConfig.parameters.longPeriod
        );
        
        // Analytics
        this.performanceAnalyzer = new PerformanceAnalyzer();
        
        // Trading state
        this.position = null; // null, 'LONG', 'SHORT'
        this.entryPrice = 0;
        this.dailyPnL = 0;
        this.lastResetDate = new Date().toDateString();
    }

    async start() {
        const tradingConfig = this.config.getTradingConfig();
        this.logger.info('Bot initialized with configuration', tradingConfig);
        this.isRunning = true;
        
        if (this.config.isDryRun()) {
            this.logger.info('🧪 Running in DRY RUN mode - No real trades will be executed');
        }
        
        try {
            // Test API connection with error handling
            const currentPrice = await this.binanceAPI.getPrice(tradingConfig.symbol);
            this.logger.info(`Current ${tradingConfig.symbol} price: $${currentPrice}`);
            
            const stats = await this.binanceAPI.get24hrStats(tradingConfig.symbol);
            this.logger.info(`24h change: ${stats.priceChangePercent.toFixed(2)}%`);
            
            // Initialize strategy with historical data
            await this.initializeStrategy();
            
            this.logger.info('Bot is ready to trade!');
            
            // Start monitoring loops
            this.monitorMarket();
            this.startHeartbeat();
            
        } catch (error) {
            await this.errorHandler.handleError(error, 'bot_startup');
            this.stop();
        }
    }

    async initializeStrategy() {
        const tradingConfig = this.config.getTradingConfig();
        
        const result = await this.errorHandler.handleError(
            null,
            'strategy_initialization',
            async () => {
                const klines = await this.binanceAPI.getKlines(
                    tradingConfig.symbol, 
                    tradingConfig.interval, 
                    50
                );
                
                this.logger.info(`Initializing strategy with ${klines.length} historical prices`);
                
                klines.forEach(kline => {
                    this.strategy.addPrice(kline.close);
                });
                
                const stats = this.strategy.getStats();
                this.logger.info('Strategy initialized', stats);
                
                return stats;
            }
        );
        
        if (!result.success) {
            throw new Error('Failed to initialize strategy');
        }
    }

    async monitorMarket() {
        if (!this.isRunning) return;
        
        const tradingConfig = this.config.getTradingConfig();
        
        const result = await this.errorHandler.handleError(
            null,
            'market_monitoring',
            async () => {
                const price = await this.binanceAPI.getPrice(tradingConfig.symbol);
                
                // Reset daily PnL if new day
                this.checkDailyReset();
                
                // Check risk limits
                if (this.checkRiskLimits()) {
                    this.logger.info('Risk limits reached, skipping trading signals');
                    return { price, skipTrading: true };
                }
                
                // Add price to strategy and get signal
                this.strategy.addPrice(price);
                const signal = this.strategy.getSignal();
                
                this.logger.signal(signal);
                
                // Execute trades based on signal
                if (!skipTrading) {
                    await this.processSignal(signal, price);
                }
                
                // Check stop loss and take profit
                if (this.position) {
                    await this.checkExitConditions(price);
                }
                
                return { price, signal };
            }
        );
        
        // Continue monitoring regardless of errors
        const monitoringConfig = this.config.get('monitoring');
        setTimeout(() => this.monitorMarket(), monitoringConfig.checkInterval);
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
        
        const tradingConfig = this.config.getTradingConfig();
        const trade = {
            symbol: tradingConfig.symbol,
            price: price,
            amount: tradingConfig.tradeAmount,
            reason: 'Moving Average Signal'
        };
        
        this.logger.trade('BUY', trade);
        this.performanceAnalyzer.addTrade({
            action: 'BUY',
            ...trade,
            timestamp: Date.now()
        });
        
        this.logger.info(`Entered LONG position at $${price}`);
    }

    async exitPosition(price, reason) {
        if (!this.position) return;
        
        const pnl = ((price - this.entryPrice) / this.entryPrice) * 100;
        const tradingConfig = this.config.getTradingConfig();
        
        const trade = {
            symbol: tradingConfig.symbol,
            price: price,
            amount: tradingConfig.tradeAmount,
            entryPrice: this.entryPrice,
            pnl: pnl.toFixed(2) + '%',
            reason: reason
        };
        
        this.logger.trade('SELL', trade);
        this.performanceAnalyzer.addTrade({
            action: 'SELL',
            ...trade,
            timestamp: Date.now()
        });
        
        // Update daily PnL
        this.dailyPnL += pnl;
        
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

    checkDailyReset() {
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            this.logger.info(`New day started, resetting daily PnL. Previous: ${this.dailyPnL.toFixed(4)}`);
            this.dailyPnL = 0;
            this.lastResetDate = today;
        }
    }
    
    checkRiskLimits() {
        const riskConfig = this.config.getRiskConfig();
        
        // Check daily loss limit
        if (this.dailyPnL <= -riskConfig.maxDailyLoss) {
            this.logger.error(`Daily loss limit reached: ${this.dailyPnL.toFixed(4)}`);
            return true;
        }
        
        // Check max drawdown
        if (this.stats.totalPnL <= -riskConfig.maxDrawdown) {
            this.logger.error(`Max drawdown reached: ${this.stats.totalPnL.toFixed(4)}`);
            return true;
        }
        
        return false;
    }
    
    startHeartbeat() {
        const monitoringConfig = this.config.get('monitoring');
        
        setInterval(() => {
            if (this.isRunning) {
                const errorStats = this.errorHandler.getErrorStats();
                const performanceMetrics = this.performanceAnalyzer.calculateMetrics();
                const uptime = Date.now() - Date.now(); // Will be set properly in actual implementation
                
                this.logger.info('Bot heartbeat', {
                    uptime: Math.round(uptime / 1000 / 60) + ' minutes',
                    position: this.position,
                    dailyPnL: this.dailyPnL.toFixed(4),
                    performance: {
                        totalTrades: performanceMetrics.totalTrades,
                        winRate: performanceMetrics.winRate,
                        totalReturn: performanceMetrics.totalReturn,
                        sharpeRatio: performanceMetrics.sharpeRatio
                    },
                    errorStats
                });
            }
        }, monitoringConfig.heartbeatInterval);
    }
    
    stop() {
        this.isRunning = false;
        
        // Generate final performance report
        const performanceMetrics = this.performanceAnalyzer.calculateMetrics();
        const finalStats = {
            dailyPnL: this.dailyPnL,
            performance: performanceMetrics,
            errorStats: this.errorHandler.getErrorStats(),
            tradeHistory: this.performanceAnalyzer.getTradeHistory(10)
        };
        
        this.logger.info('Bot stopped - Final Performance Report', finalStats);
        
        // Export full analysis if there are trades
        if (parseInt(performanceMetrics.totalTrades) > 0) {
            const fullAnalysis = this.performanceAnalyzer.exportAnalysis();
            this.logger.info('Full performance analysis available', {
                totalTrades: fullAnalysis.summary.totalTradesAnalyzed,
                timespan: fullAnalysis.summary.timespan
            });
        }
    }
}

// Initialize and start the bot
const bot = new TradingBot();

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    bot.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    bot.stop();
    process.exit(0);
});

bot.start();