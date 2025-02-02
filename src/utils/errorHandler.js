class ErrorHandler {
    constructor(logger) {
        this.logger = logger;
        this.errorCounts = new Map();
        this.lastErrors = new Map();
        this.maxRetries = 3;
        this.retryDelay = 5000; // 5 seconds
    }

    async handleError(error, context = '', retryFunction = null) {
        const errorKey = `${context}:${error.message}`;
        
        // Track error frequency
        const currentCount = this.errorCounts.get(errorKey) || 0;
        this.errorCounts.set(errorKey, currentCount + 1);
        this.lastErrors.set(errorKey, new Date());

        // Log the error with context
        this.logger.error(`Error in ${context}`, {
            error: error.message,
            stack: error.stack,
            count: currentCount + 1,
            timestamp: new Date().toISOString()
        });

        // Handle specific error types
        if (this.isNetworkError(error)) {
            return this.handleNetworkError(error, context, retryFunction);
        }

        if (this.isAPIError(error)) {
            return this.handleAPIError(error, context);
        }

        if (this.isRateLimitError(error)) {
            return this.handleRateLimitError(error, context, retryFunction);
        }

        // For other errors, attempt retry if function provided
        if (retryFunction && currentCount < this.maxRetries) {
            this.logger.info(`Retrying ${context} in ${this.retryDelay}ms (attempt ${currentCount + 1}/${this.maxRetries})`);
            
            await this.sleep(this.retryDelay);
            
            try {
                return await retryFunction();
            } catch (retryError) {
                return this.handleError(retryError, context, retryFunction);
            }
        }

        // Max retries reached or no retry function
        this.logger.error(`Failed to recover from error in ${context} after ${currentCount} attempts`);
        return { success: false, error: error.message };
    }

    isNetworkError(error) {
        const networkErrors = [
            'ECONNRESET',
            'ECONNREFUSED', 
            'ENOTFOUND',
            'ETIMEDOUT',
            'ECONNABORTED'
        ];
        
        return networkErrors.some(code => 
            error.code === code || 
            error.message.includes(code) ||
            error.message.toLowerCase().includes('network')
        );
    }

    isAPIError(error) {
        return error.response && error.response.status >= 400;
    }

    isRateLimitError(error) {
        return error.response && (
            error.response.status === 429 ||
            error.response.status === 418 || // Binance IP ban
            (error.response.data && error.response.data.msg && 
             error.response.data.msg.toLowerCase().includes('rate limit'))
        );
    }

    async handleNetworkError(error, context, retryFunction) {
        const backoffDelay = this.getBackoffDelay(context);
        
        this.logger.info(`Network error detected, waiting ${backoffDelay}ms before retry`);
        
        if (retryFunction) {
            await this.sleep(backoffDelay);
            
            try {
                return await retryFunction();
            } catch (retryError) {
                return this.handleError(retryError, context, retryFunction);
            }
        }
        
        return { success: false, error: 'Network error - no retry function provided' };
    }

    async handleAPIError(error, context) {
        const status = error.response.status;
        const data = error.response.data;
        
        this.logger.error(`API Error ${status} in ${context}`, {
            status,
            data,
            url: error.config?.url
        });

        // Handle specific API errors
        switch (status) {
            case 400:
                return { success: false, error: 'Bad Request - Check parameters' };
            case 401:
                return { success: false, error: 'Unauthorized - Check API credentials' };
            case 403:
                return { success: false, error: 'Forbidden - API key permissions issue' };
            case 404:
                return { success: false, error: 'Not Found - Invalid endpoint or symbol' };
            case 500:
                return { success: false, error: 'Server Error - Try again later' };
            default:
                return { success: false, error: `API Error ${status}` };
        }
    }

    async handleRateLimitError(error, context, retryFunction) {
        const retryAfter = this.getRetryAfterDelay(error);
        
        this.logger.info(`Rate limit hit, waiting ${retryAfter}ms before retry`);
        
        if (retryFunction) {
            await this.sleep(retryAfter);
            
            try {
                return await retryFunction();
            } catch (retryError) {
                return this.handleError(retryError, context, retryFunction);
            }
        }
        
        return { success: false, error: 'Rate limit exceeded' };
    }

    getBackoffDelay(context) {
        const baseDelay = this.retryDelay;
        const errorCount = this.errorCounts.get(context) || 0;
        
        // Exponential backoff with jitter
        const backoff = Math.min(baseDelay * Math.pow(2, errorCount), 60000); // Max 1 minute
        const jitter = Math.random() * 1000; // Add up to 1 second jitter
        
        return backoff + jitter;
    }

    getRetryAfterDelay(error) {
        // Check for Retry-After header
        if (error.response && error.response.headers['retry-after']) {
            return parseInt(error.response.headers['retry-after']) * 1000;
        }
        
        // Default rate limit delay
        return 60000; // 1 minute
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getErrorStats() {
        const stats = {
            totalErrors: 0,
            errorsByType: {},
            recentErrors: []
        };

        // Calculate total errors
        for (const count of this.errorCounts.values()) {
            stats.totalErrors += count;
        }

        // Group errors by type
        for (const [errorKey, count] of this.errorCounts.entries()) {
            const [context] = errorKey.split(':');
            stats.errorsByType[context] = (stats.errorsByType[context] || 0) + count;
        }

        // Get recent errors (last hour)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        for (const [errorKey, timestamp] of this.lastErrors.entries()) {
            if (timestamp > oneHourAgo) {
                stats.recentErrors.push({
                    error: errorKey,
                    timestamp: timestamp.toISOString(),
                    count: this.errorCounts.get(errorKey)
                });
            }
        }

        return stats;
    }

    clearErrorStats() {
        this.errorCounts.clear();
        this.lastErrors.clear();
        this.logger.info('Error statistics cleared');
    }
}

module.exports = ErrorHandler;