const PerformanceAnalyzer = require('../analytics/performanceAnalyzer');

class Backtester {
    constructor(strategy, config = {}) {
        this.strategy = strategy;
        this.config = {
            initialBalance: config.initialBalance || 10000,
            commission: config.commission || 0.001, // 0.1%
            slippage: config.slippage || 0.0005, // 0.05%
            ...config
        };
        
        this.analyzer = new PerformanceAnalyzer();
        this.analyzer.startBalance = this.config.initialBalance;
        this.analyzer.currentBalance = this.config.initialBalance;
        
        this.position = null;
        this.entryPrice = 0;
        this.trades = [];
        this.currentPrice = 0;
    }

    async runBacktest(historicalData, options = {}) {
        const startTime = Date.now();
        
        console.log(`Starting backtest with ${historicalData.length} data points...`);
        
        // Reset state
        this.reset();
        
        // Initialize strategy with some historical data
        const initDataCount = Math.min(50, Math.floor(historicalData.length * 0.1));
        for (let i = 0; i < initDataCount; i++) {
            this.strategy.addPrice(historicalData[i].close);
        }
        
        // Run through historical data
        for (let i = initDataCount; i < historicalData.length; i++) {
            const dataPoint = historicalData[i];
            await this.processDataPoint(dataPoint, i);
            
            // Progress logging
            if (i % Math.floor(historicalData.length / 10) === 0) {
                const progress = ((i / historicalData.length) * 100).toFixed(1);
                console.log(`Backtest progress: ${progress}%`);
            }
        }
        
        // Close any remaining position
        if (this.position && this.currentPrice > 0) {
            this.exitPosition(this.currentPrice, 'End of backtest');
        }
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        const results = this.generateResults(duration, historicalData.length);
        console.log(`Backtest completed in ${duration}s`);
        
        return results;
    }

    async processDataPoint(dataPoint, index) {
        this.currentPrice = dataPoint.close;
        
        // Add price to strategy
        this.strategy.addPrice(dataPoint.close);
        
        // Get trading signal
        const signal = this.strategy.getSignal();
        
        // Apply trading logic
        if (signal.action === 'BUY' && !this.position) {
            this.enterPosition('LONG', dataPoint);
        } else if (signal.action === 'SELL' && this.position === 'LONG') {
            this.exitPosition(dataPoint.close, 'Strategy signal', dataPoint);
        }
        
        // Check stop loss and take profit
        if (this.position) {
            this.checkExitConditions(dataPoint);
        }
    }

    enterPosition(type, dataPoint) {
        const price = this.applySlippage(dataPoint.close, 'BUY');
        const commission = price * this.config.commission;
        
        this.position = type;
        this.entryPrice = price;
        
        const trade = {
            action: 'BUY',
            timestamp: dataPoint.openTime || Date.now(),
            symbol: 'BACKTEST',
            price: price,
            amount: this.config.initialBalance * 0.1, // Risk 10% per trade
            commission: commission,
            reason: 'Strategy signal'
        };
        
        this.trades.push(trade);
        this.analyzer.addTrade(trade);
    }

    exitPosition(exitPrice, reason, dataPoint = null) {
        if (!this.position) return;
        
        const price = this.applySlippage(exitPrice, 'SELL');
        const commission = price * this.config.commission;
        
        // Calculate PnL
        const pnlPercent = ((price - this.entryPrice) / this.entryPrice) * 100;
        const pnlAmount = (this.analyzer.currentBalance * 0.1) * (pnlPercent / 100);
        
        const trade = {
            action: 'SELL',
            timestamp: dataPoint ? (dataPoint.openTime || Date.now()) : Date.now(),
            symbol: 'BACKTEST',
            price: price,
            amount: this.config.initialBalance * 0.1,
            commission: commission,
            entryPrice: this.entryPrice,
            pnl: pnlPercent.toFixed(2) + '%',
            pnlAmount: pnlAmount,
            reason: reason
        };
        
        this.trades.push(trade);
        this.analyzer.addTrade(trade);
        
        // Reset position
        this.position = null;
        this.entryPrice = 0;
    }

    checkExitConditions(dataPoint) {
        if (!this.position || this.position !== 'LONG') return;
        
        const currentPrice = dataPoint.close;
        const pnlPercent = (currentPrice - this.entryPrice) / this.entryPrice;
        
        // Stop loss check (default 2%)
        const stopLoss = this.config.stopLoss || 0.02;
        if (pnlPercent <= -stopLoss) {
            this.exitPosition(currentPrice, 'Stop loss', dataPoint);
            return;
        }
        
        // Take profit check (default 3%)
        const takeProfit = this.config.takeProfit || 0.03;
        if (pnlPercent >= takeProfit) {
            this.exitPosition(currentPrice, 'Take profit', dataPoint);
            return;
        }
    }

    applySlippage(price, side) {
        const slippageAmount = price * this.config.slippage;
        return side === 'BUY' ? price + slippageAmount : price - slippageAmount;
    }

    generateResults(duration, totalDataPoints) {
        const metrics = this.analyzer.calculateMetrics();
        const tradeHistory = this.analyzer.getTradeHistory();
        
        return {
            summary: {
                duration: duration + 's',
                dataPointsProcessed: totalDataPoints,
                totalTrades: this.trades.length,
                completedTrades: this.trades.filter(t => t.action === 'SELL').length
            },
            performance: metrics,
            trades: tradeHistory,
            strategy: {
                name: this.strategy.constructor.name,
                parameters: this.getStrategyParameters()
            },
            config: this.config
        };
    }

    getStrategyParameters() {
        // Try to extract strategy parameters
        if (this.strategy.shortPeriod && this.strategy.longPeriod) {
            return {
                shortPeriod: this.strategy.shortPeriod,
                longPeriod: this.strategy.longPeriod
            };
        }
        
        return {};
    }

    reset() {
        this.position = null;
        this.entryPrice = 0;
        this.trades = [];
        this.currentPrice = 0;
        this.analyzer.reset();
        this.analyzer.startBalance = this.config.initialBalance;
        this.analyzer.currentBalance = this.config.initialBalance;
    }

    // Run multiple backtests with different parameters
    async optimizeStrategy(historicalData, parameterRanges) {
        console.log('Starting strategy optimization...');
        
        const results = [];
        const combinations = this.generateParameterCombinations(parameterRanges);
        
        for (let i = 0; i < combinations.length; i++) {
            const params = combinations[i];
            console.log(`Testing combination ${i + 1}/${combinations.length}: ${JSON.stringify(params)}`);
            
            // Create new strategy instance with these parameters
            const StrategyClass = this.strategy.constructor;
            const testStrategy = new StrategyClass(params.shortPeriod, params.longPeriod);
            
            // Create temporary backtester
            const backtester = new Backtester(testStrategy, this.config);
            const result = await backtester.runBacktest(historicalData);
            
            results.push({
                parameters: params,
                performance: result.performance,
                sharpeRatio: parseFloat(result.performance.sharpeRatio),
                totalReturn: parseFloat(result.performance.totalReturn.replace('%', '')),
                winRate: parseFloat(result.performance.winRate.replace('%', ''))
            });
        }
        
        // Sort by Sharpe ratio (best risk-adjusted returns)
        results.sort((a, b) => b.sharpeRatio - a.sharpeRatio);
        
        console.log('Optimization completed!');
        return {
            bestParameters: results[0].parameters,
            bestPerformance: results[0].performance,
            allResults: results
        };
    }

    generateParameterCombinations(ranges) {
        const combinations = [];
        
        for (let short = ranges.shortPeriod.min; short <= ranges.shortPeriod.max; short += ranges.shortPeriod.step) {
            for (let long = ranges.longPeriod.min; long <= ranges.longPeriod.max; long += ranges.longPeriod.step) {
                if (short < long) { // Ensure short period is always less than long period
                    combinations.push({ shortPeriod: short, longPeriod: long });
                }
            }
        }
        
        return combinations;
    }
}

module.exports = Backtester;