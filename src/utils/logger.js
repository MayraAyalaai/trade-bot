const fs = require('fs');
const path = require('path');

class Logger {
    constructor(logDir = 'logs') {
        this.logDir = logDir;
        this.ensureLogDir();
    }

    ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    getLogFilePath(type) {
        const date = new Date().toISOString().split('T')[0];
        return path.join(this.logDir, `${type}_${date}.log`);
    }

    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...(data && { data })
        };

        const logLine = JSON.stringify(logEntry) + '\n';
        
        // Log to console
        console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
        if (data) console.log(data);

        // Log to file
        fs.appendFileSync(this.getLogFilePath('bot'), logLine);
    }

    info(message, data) {
        this.log('info', message, data);
    }

    error(message, data) {
        this.log('error', message, data);
    }

    trade(action, data) {
        const timestamp = new Date().toISOString();
        const tradeEntry = {
            timestamp,
            action,
            ...data
        };

        const tradeLine = JSON.stringify(tradeEntry) + '\n';
        
        console.log(`[TRADE] ${action}: ${data.symbol} at $${data.price}`);
        fs.appendFileSync(this.getLogFilePath('trades'), tradeLine);
    }

    signal(signal) {
        const timestamp = new Date().toISOString();
        const signalEntry = {
            timestamp,
            ...signal
        };

        const signalLine = JSON.stringify(signalEntry) + '\n';
        
        console.log(`[SIGNAL] ${signal.action}: ${signal.reason}`);
        fs.appendFileSync(this.getLogFilePath('signals'), signalLine);
    }
}

module.exports = Logger;