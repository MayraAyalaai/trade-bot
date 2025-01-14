const axios = require('axios');

class BinanceAPI {
    constructor(apiKey, apiSecret) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.baseURL = 'https://api.binance.com/api/v3';
    }

    async getPrice(symbol) {
        try {
            const response = await axios.get(`${this.baseURL}/ticker/price`, {
                params: { symbol }
            });
            return parseFloat(response.data.price);
        } catch (error) {
            console.error(`Error fetching price for ${symbol}:`, error.message);
            throw error;
        }
    }

    async get24hrStats(symbol) {
        try {
            const response = await axios.get(`${this.baseURL}/ticker/24hr`, {
                params: { symbol }
            });
            return {
                symbol: response.data.symbol,
                priceChange: parseFloat(response.data.priceChange),
                priceChangePercent: parseFloat(response.data.priceChangePercent),
                lastPrice: parseFloat(response.data.lastPrice),
                volume: parseFloat(response.data.volume),
                high: parseFloat(response.data.highPrice),
                low: parseFloat(response.data.lowPrice)
            };
        } catch (error) {
            console.error(`Error fetching 24hr stats for ${symbol}:`, error.message);
            throw error;
        }
    }

    async getKlines(symbol, interval, limit = 100) {
        try {
            const response = await axios.get(`${this.baseURL}/klines`, {
                params: { symbol, interval, limit }
            });
            
            return response.data.map(kline => ({
                openTime: kline[0],
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5]),
                closeTime: kline[6]
            }));
        } catch (error) {
            console.error(`Error fetching klines for ${symbol}:`, error.message);
            throw error;
        }
    }
}

module.exports = BinanceAPI;