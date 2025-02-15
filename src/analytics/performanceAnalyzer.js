class PerformanceAnalyzer {
    constructor() {
        this.trades = [];
        this.portfolio = [];
        this.startBalance = 1000; // Default starting balance for analysis
        this.currentBalance = this.startBalance;
    }

    addTrade(trade) {
        this.trades.push({
            ...trade,
            timestamp: new Date(trade.timestamp || Date.now())
        });
        
        this.updatePortfolio(trade);
    }

    updatePortfolio(trade) {
        const portfolioEntry = {
            timestamp: trade.timestamp,
            balance: this.currentBalance,
            action: trade.action,
            price: trade.price,
            amount: trade.amount,
            pnl: trade.pnl || 0
        };

        if (trade.action === 'SELL' && trade.pnl) {
            // Update balance based on PnL
            const pnlAmount = this.currentBalance * (parseFloat(trade.pnl.replace('%', '')) / 100);
            this.currentBalance += pnlAmount;
            portfolioEntry.balance = this.currentBalance;
            portfolioEntry.pnlAmount = pnlAmount;
        }

        this.portfolio.push(portfolioEntry);
    }

    calculateMetrics() {
        if (this.trades.length === 0) {
            return this.getEmptyMetrics();
        }

        const buyTrades = this.trades.filter(t => t.action === 'BUY');
        const sellTrades = this.trades.filter(t => t.action === 'SELL');
        
        const winningTrades = sellTrades.filter(t => this.getPnLValue(t.pnl) > 0);
        const losingTrades = sellTrades.filter(t => this.getPnLValue(t.pnl) < 0);
        
        const totalPnL = sellTrades.reduce((sum, trade) => 
            sum + this.getPnLValue(trade.pnl), 0
        );
        
        const winRate = sellTrades.length > 0 ? 
            (winningTrades.length / sellTrades.length) * 100 : 0;
        
        const avgWin = winningTrades.length > 0 ? 
            winningTrades.reduce((sum, t) => sum + this.getPnLValue(t.pnl), 0) / winningTrades.length : 0;
        
        const avgLoss = losingTrades.length > 0 ? 
            Math.abs(losingTrades.reduce((sum, t) => sum + this.getPnLValue(t.pnl), 0) / losingTrades.length) : 0;
        
        const profitFactor = avgLoss > 0 ? Math.abs(avgWin / avgLoss) : 0;
        
        const maxDrawdown = this.calculateMaxDrawdown();
        const sharpeRatio = this.calculateSharpeRatio();
        
        return {
            totalTrades: sellTrades.length,
            winningTrades: winningTrades.length,
            losingTrades: losingTrades.length,
            winRate: winRate.toFixed(2) + '%',
            totalReturn: totalPnL.toFixed(2) + '%',
            avgWin: avgWin.toFixed(2) + '%',
            avgLoss: avgLoss.toFixed(2) + '%',
            profitFactor: profitFactor.toFixed(2),
            maxDrawdown: maxDrawdown.toFixed(2) + '%',
            sharpeRatio: sharpeRatio.toFixed(2),
            currentBalance: this.currentBalance.toFixed(2),
            totalReturn$: (this.currentBalance - this.startBalance).toFixed(2),
            roi: (((this.currentBalance - this.startBalance) / this.startBalance) * 100).toFixed(2) + '%'
        };
    }

    getPnLValue(pnlString) {
        if (!pnlString) return 0;
        return parseFloat(pnlString.replace('%', ''));
    }

    calculateMaxDrawdown() {
        if (this.portfolio.length < 2) return 0;
        
        let maxDrawdown = 0;
        let peak = this.portfolio[0].balance;
        
        for (const entry of this.portfolio) {
            if (entry.balance > peak) {
                peak = entry.balance;
            }
            
            const drawdown = ((peak - entry.balance) / peak) * 100;
            maxDrawdown = Math.max(maxDrawdown, drawdown);
        }
        
        return maxDrawdown;
    }

    calculateSharpeRatio() {
        if (this.portfolio.length < 2) return 0;
        
        const returns = [];
        for (let i = 1; i < this.portfolio.length; i++) {
            const prevBalance = this.portfolio[i - 1].balance;
            const currentBalance = this.portfolio[i].balance;
            const returnPct = ((currentBalance - prevBalance) / prevBalance) * 100;
            returns.push(returnPct);
        }
        
        if (returns.length === 0) return 0;
        
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        
        // Risk-free rate assumed to be 0 for simplicity
        return stdDev > 0 ? avgReturn / stdDev : 0;
    }

    getEmptyMetrics() {
        return {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            winRate: '0%',
            totalReturn: '0%',
            avgWin: '0%',
            avgLoss: '0%',
            profitFactor: '0',
            maxDrawdown: '0%',
            sharpeRatio: '0',
            currentBalance: this.currentBalance.toFixed(2),
            totalReturn$: '0.00',
            roi: '0%'
        };
    }

    getTradeHistory(limit = 50) {
        return this.trades
            .slice(-limit)
            .map(trade => ({
                timestamp: trade.timestamp.toISOString(),
                action: trade.action,
                symbol: trade.symbol,
                price: trade.price,
                amount: trade.amount,
                pnl: trade.pnl || 'N/A',
                reason: trade.reason || 'Unknown'
            }));
    }

    getPortfolioHistory() {
        return this.portfolio.map(entry => ({
            timestamp: entry.timestamp,
            balance: entry.balance.toFixed(2),
            action: entry.action,
            pnl: entry.pnlAmount ? entry.pnlAmount.toFixed(2) : null
        }));
    }

    exportAnalysis() {
        return {
            metrics: this.calculateMetrics(),
            tradeHistory: this.getTradeHistory(),
            portfolioHistory: this.getPortfolioHistory(),
            summary: {
                analysisDate: new Date().toISOString(),
                totalTradesAnalyzed: this.trades.length,
                timespan: this.getTimespan()
            }
        };
    }

    getTimespan() {
        if (this.trades.length < 2) return 'N/A';
        
        const firstTrade = this.trades[0].timestamp;
        const lastTrade = this.trades[this.trades.length - 1].timestamp;
        const diffMs = lastTrade - firstTrade;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        return `${diffDays} days`;
    }

    reset() {
        this.trades = [];
        this.portfolio = [];
        this.currentBalance = this.startBalance;
    }
}

module.exports = PerformanceAnalyzer;