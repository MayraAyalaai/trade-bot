class MovingAverageStrategy {
    constructor(shortPeriod = 10, longPeriod = 20) {
        this.shortPeriod = shortPeriod;
        this.longPeriod = longPeriod;
        this.prices = [];
        this.signals = [];
    }

    addPrice(price) {
        this.prices.push(price);
        
        // Keep only the data we need for calculations
        if (this.prices.length > this.longPeriod * 2) {
            this.prices = this.prices.slice(-this.longPeriod * 2);
        }
    }

    calculateSMA(period) {
        if (this.prices.length < period) return null;
        
        const recentPrices = this.prices.slice(-period);
        const sum = recentPrices.reduce((acc, price) => acc + price, 0);
        return sum / period;
    }

    getSignal() {
        if (this.prices.length < this.longPeriod) {
            return { action: 'HOLD', reason: 'Insufficient data' };
        }

        const shortMA = this.calculateSMA(this.shortPeriod);
        const longMA = this.calculateSMA(this.longPeriod);
        
        if (!shortMA || !longMA) {
            return { action: 'HOLD', reason: 'Cannot calculate moving averages' };
        }

        // Get previous MAs for trend detection
        const prevPrices = this.prices.slice(0, -1);
        let prevShortMA = null;
        let prevLongMA = null;
        
        if (prevPrices.length >= this.longPeriod) {
            const shortSum = prevPrices.slice(-this.shortPeriod).reduce((acc, price) => acc + price, 0);
            const longSum = prevPrices.slice(-this.longPeriod).reduce((acc, price) => acc + price, 0);
            prevShortMA = shortSum / this.shortPeriod;
            prevLongMA = longSum / this.longPeriod;
        }

        const signal = {
            shortMA,
            longMA,
            currentPrice: this.prices[this.prices.length - 1],
            timestamp: new Date().toISOString()
        };

        // Golden Cross: Short MA crosses above Long MA (BUY signal)
        if (prevShortMA && prevLongMA && 
            prevShortMA <= prevLongMA && shortMA > longMA) {
            signal.action = 'BUY';
            signal.reason = 'Golden cross detected';
        }
        // Death Cross: Short MA crosses below Long MA (SELL signal)  
        else if (prevShortMA && prevLongMA && 
                 prevShortMA >= prevLongMA && shortMA < longMA) {
            signal.action = 'SELL';
            signal.reason = 'Death cross detected';
        }
        // Hold position
        else {
            signal.action = 'HOLD';
            signal.reason = shortMA > longMA ? 'Short MA above Long MA' : 'Short MA below Long MA';
        }

        this.signals.push(signal);
        return signal;
    }

    getStats() {
        return {
            totalSignals: this.signals.length,
            buySignals: this.signals.filter(s => s.action === 'BUY').length,
            sellSignals: this.signals.filter(s => s.action === 'SELL').length,
            currentShortMA: this.calculateSMA(this.shortPeriod),
            currentLongMA: this.calculateSMA(this.longPeriod),
            pricesCount: this.prices.length
        };
    }
}

module.exports = MovingAverageStrategy;