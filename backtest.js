const BinanceAPI = require('./src/api/binance');
const MovingAverageStrategy = require('./src/strategies/movingAverage');
const Backtester = require('./src/backtesting/backtester');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

class BacktestRunner {
    constructor() {
        this.binanceAPI = new BinanceAPI(
            process.env.BINANCE_API_KEY,
            process.env.BINANCE_API_SECRET
        );
    }

    async runSingleBacktest() {
        console.log('🔄 Fetching historical data...');
        
        try {
            // Get 1000 5-minute candles (about 3.5 days of data)
            const historicalData = await this.binanceAPI.getKlines('BTCUSDT', '5m', 1000);
            
            console.log(`📊 Retrieved ${historicalData.length} data points`);
            console.log(`📅 Data range: ${new Date(historicalData[0].openTime).toISOString()} to ${new Date(historicalData[historicalData.length - 1].openTime).toISOString()}`);
            
            // Create strategy and backtester
            const strategy = new MovingAverageStrategy(10, 20);
            const backtester = new Backtester(strategy, {
                initialBalance: 10000,
                commission: 0.001, // 0.1% Binance fee
                slippage: 0.0005,
                stopLoss: 0.02, // 2%
                takeProfit: 0.03 // 3%
            });
            
            // Run backtest
            const results = await backtester.runBacktest(historicalData);
            
            // Display results
            this.displayResults(results);
            
            // Save results to file
            this.saveResults(results, 'single_backtest');
            
            return results;
            
        } catch (error) {
            console.error('❌ Backtest failed:', error.message);
            throw error;
        }
    }

    async runOptimization() {
        console.log('🎯 Starting strategy optimization...');
        
        try {
            // Get more data for optimization
            const historicalData = await this.binanceAPI.getKlines('BTCUSDT', '5m', 2000);
            
            console.log(`📊 Retrieved ${historicalData.length} data points for optimization`);
            
            const strategy = new MovingAverageStrategy(10, 20);
            const backtester = new Backtester(strategy, {
                initialBalance: 10000,
                commission: 0.001,
                slippage: 0.0005,
                stopLoss: 0.02,
                takeProfit: 0.03
            });
            
            // Define parameter ranges to test
            const parameterRanges = {
                shortPeriod: { min: 5, max: 20, step: 5 },
                longPeriod: { min: 20, max: 50, step: 10 }
            };
            
            const optimizationResults = await backtester.optimizeStrategy(historicalData, parameterRanges);
            
            // Display optimization results
            this.displayOptimizationResults(optimizationResults);
            
            // Save results
            this.saveResults(optimizationResults, 'optimization');
            
            return optimizationResults;
            
        } catch (error) {
            console.error('❌ Optimization failed:', error.message);
            throw error;
        }
    }

    displayResults(results) {
        console.log('\n📈 BACKTEST RESULTS');
        console.log('==================');
        console.log(`📊 Total Trades: ${results.performance.totalTrades}`);
        console.log(`🎯 Win Rate: ${results.performance.winRate}`);
        console.log(`💰 Total Return: ${results.performance.totalReturn}`);
        console.log(`📈 ROI: ${results.performance.roi}`);
        console.log(`💸 Max Drawdown: ${results.performance.maxDrawdown}`);
        console.log(`⚡ Sharpe Ratio: ${results.performance.sharpeRatio}`);
        console.log(`💵 Final Balance: $${results.performance.currentBalance}`);
        console.log(`🔄 Profit Factor: ${results.performance.profitFactor}`);
        
        if (results.trades && results.trades.length > 0) {
            console.log('\n📋 Recent Trades:');
            results.trades.slice(-5).forEach(trade => {
                const date = new Date(trade.timestamp).toLocaleDateString();
                console.log(`  ${date} | ${trade.action} | $${trade.price} | PnL: ${trade.pnl || 'N/A'} | ${trade.reason}`);
            });
        }
    }

    displayOptimizationResults(results) {
        console.log('\n🎯 OPTIMIZATION RESULTS');
        console.log('=====================');
        console.log(`🏆 Best Parameters: Short=${results.bestParameters.shortPeriod}, Long=${results.bestParameters.longPeriod}`);
        console.log(`📊 Best Sharpe Ratio: ${results.bestPerformance.sharpeRatio}`);
        console.log(`💰 Best Total Return: ${results.bestPerformance.totalReturn}`);
        console.log(`🎯 Best Win Rate: ${results.bestPerformance.winRate}`);
        
        console.log('\n📈 Top 5 Parameter Combinations:');
        results.allResults.slice(0, 5).forEach((result, index) => {
            console.log(`  ${index + 1}. Short=${result.parameters.shortPeriod}, Long=${result.parameters.longPeriod} | Sharpe: ${result.sharpeRatio.toFixed(2)} | Return: ${result.totalReturn.toFixed(2)}% | Win Rate: ${result.winRate.toFixed(1)}%`);
        });
    }

    saveResults(results, filename) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filepath = `./backtest_results_${filename}_${timestamp}.json`;
        
        try {
            fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
            console.log(`💾 Results saved to: ${filepath}`);
        } catch (error) {
            console.error('❌ Failed to save results:', error.message);
        }
    }
}

// Main execution
async function main() {
    const runner = new BacktestRunner();
    
    const args = process.argv.slice(2);
    const command = args[0] || 'single';
    
    try {
        if (command === 'optimize') {
            await runner.runOptimization();
        } else {
            await runner.runSingleBacktest();
        }
    } catch (error) {
        console.error('❌ Script failed:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    console.log('🤖 Crypto Trading Bot - Backtesting Tool');
    console.log('=========================================');
    main();
}

module.exports = BacktestRunner;