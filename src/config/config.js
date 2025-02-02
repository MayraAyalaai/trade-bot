const fs = require('fs');
const path = require('path');

class Config {
    constructor(configPath = 'config.json') {
        this.configPath = configPath;
        this.config = this.loadConfig();
    }

    loadConfig() {
        // Default configuration
        const defaultConfig = {
            trading: {
                symbol: process.env.TRADING_SYMBOL || 'BTCUSDT',
                interval: '5m',
                tradeAmount: parseFloat(process.env.TRADE_AMOUNT) || 0.001,
                maxPositions: 1,
                dryRun: process.env.DRY_RUN === 'true' || true
            },
            strategy: {
                type: 'moving_average',
                parameters: {
                    shortPeriod: 10,
                    longPeriod: 20,
                    minConfidence: 0.7
                }
            },
            riskManagement: {
                stopLoss: parseFloat(process.env.STOP_LOSS_PERCENT) / 100 || 0.02,
                takeProfit: parseFloat(process.env.TAKE_PROFIT_PERCENT) / 100 || 0.03,
                maxDailyLoss: 0.05, // 5% max daily loss
                maxDrawdown: 0.10   // 10% max drawdown
            },
            api: {
                binance: {
                    apiKey: process.env.BINANCE_API_KEY,
                    apiSecret: process.env.BINANCE_API_SECRET,
                    testnet: process.env.BINANCE_TESTNET === 'true' || false
                },
                rateLimit: {
                    requestsPerMinute: 1200,
                    requestsPerSecond: 10
                }
            },
            logging: {
                level: process.env.LOG_LEVEL || 'info',
                logToFile: true,
                maxLogFiles: 30,
                maxLogSize: '10mb'
            },
            monitoring: {
                checkInterval: 60000, // 1 minute
                heartbeatInterval: 300000, // 5 minutes
                enableMetrics: true
            }
        };

        // Try to load from file if exists
        try {
            if (fs.existsSync(this.configPath)) {
                const fileConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                return this.mergeDeep(defaultConfig, fileConfig);
            }
        } catch (error) {
            console.warn(`Failed to load config file: ${error.message}`);
        }

        return defaultConfig;
    }

    mergeDeep(target, source) {
        const output = { ...target };
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                output[key] = this.mergeDeep(target[key] || {}, source[key]);
            } else {
                output[key] = source[key];
            }
        }
        return output;
    }

    get(path) {
        const keys = path.split('.');
        let current = this.config;
        
        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return undefined;
            }
        }
        
        return current;
    }

    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let current = this.config;
        
        for (const key of keys) {
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[lastKey] = value;
    }

    save() {
        try {
            const configData = JSON.stringify(this.config, null, 2);
            fs.writeFileSync(this.configPath, configData, 'utf8');
            return true;
        } catch (error) {
            console.error(`Failed to save config: ${error.message}`);
            return false;
        }
    }

    validate() {
        const errors = [];

        // Validate API credentials
        if (!this.get('api.binance.apiKey') || !this.get('api.binance.apiSecret')) {
            errors.push('Binance API credentials are required');
        }

        // Validate trading parameters
        if (this.get('trading.tradeAmount') <= 0) {
            errors.push('Trade amount must be greater than 0');
        }

        if (this.get('riskManagement.stopLoss') <= 0 || this.get('riskManagement.stopLoss') >= 1) {
            errors.push('Stop loss must be between 0 and 1');
        }

        if (this.get('riskManagement.takeProfit') <= 0) {
            errors.push('Take profit must be greater than 0');
        }

        // Validate strategy parameters
        const shortPeriod = this.get('strategy.parameters.shortPeriod');
        const longPeriod = this.get('strategy.parameters.longPeriod');
        
        if (shortPeriod >= longPeriod) {
            errors.push('Short period must be less than long period');
        }

        return errors;
    }

    isDryRun() {
        return this.get('trading.dryRun') === true;
    }

    getTradingConfig() {
        return this.get('trading');
    }

    getStrategyConfig() {
        return this.get('strategy');
    }

    getRiskConfig() {
        return this.get('riskManagement');
    }

    getApiConfig() {
        return this.get('api');
    }
}

module.exports = Config;