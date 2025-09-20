/**
 * Professional Trading Platform Configuration
 * 
 * This configuration module defines the core parameters for the cryptocurrency
 * dual investment trading platform, including risk management, ROI targets,
 * and market analysis settings.
 */

module.exports = {
    // Dynamic risk buffer calculation based on time to expiry
    RISK_BUFFER_CONFIG: {
        baseBuffer: 3.0,        // Base buffer percentage for ~2 days
        dailyIncrement: 0.25,   // Additional buffer per day beyond 2 days
        maxBuffer: 8.0,         // Maximum buffer cap

        calculateBuffer: function (daysToExpiry) {
            const buffer = this.baseBuffer + Math.max(0, daysToExpiry - 2) * this.dailyIncrement;
            return Math.min(buffer, this.maxBuffer);
        }
    },

    BINANCE_API_KEY: process.env.BINANCE_API_KEY,
    BINANCE_API_SECRET: process.env.BINANCE_API_SECRET,
    FETCH_CONFIG: {
        pageSize: 20,    // Products per request
        pageIndex: 1     // Start with first page (highest strikes)
    },
    INVESTMENT_AMOUNT: 10000,
    ALLOCATION_FRACTION: 0.1,
    MAX_POSITIONS_PER_PAIR: 10,
    MAX_SHORT_TERM_POSITIONS: 10,
    EXPIRY_HOURS: [36, 350],
    SHORT_TERM_EXPIRY_HOURS: [22, 37],
    MAX_TOTAL_POSITIONS: 30,
    PUT_CALL_BALANCE: -0.5,        // -1 For Short only | 1 for Long only | 0 for both side Yield Max Roi
    ABS_RATIO_THRESHOLD: 3,      // Main safety filter: higher = require bigger buffer from spot for a given ROI

    // Advanced hedging and risk management
    RISK_MANAGEMENT: {
        // Price breach confirmation window (minutes)
        breachConfirmationMinutes: 5,

        // Progressive hedging strategy
        progressiveHedging: {
            enabled: true,
            initialHedgePercentage: 0.5,    // First hedge: 50%
            fullHedgePercentage: 1.0,       // Second hedge: 100%
            escalationThreshold: 0.05,      // Escalate if price moves 5% further
            cooldownPeriod: 0               // Minutes between hedge steps
        },


        // Dynamic minimum ROI calculation based on time to expiry
        calculateMinimumROI: function (daysToExpiry) {
            const baseROI = 0.0075;         // 0.75% base ROI
            const increment = Math.max(0, daysToExpiry - 2) * 0.001;
            return Math.min(baseROI + increment, 0.07);  // Cap at 7%
        }
    },

    // Hedging Safety Rules (original structure)
    HEDGE_SAFETY: {
        // Breach confirmation window (in minutes) - only hedge if price stays beyond break-even for this duration
        BREACH_CONFIRMATION_MINUTES: 5,

        // Partial hedging configuration - 2 step approach
        PARTIAL_HEDGE: {
            enabled: true,
            step1Percentage: 0.5,        // First hedge: 50%
            step2Percentage: 1.0,        // Second hedge: 100%
            sizeUpThreshold: 0.05,       // Size up if price moves 5% further beyond break-even
            cooldownMinutes: 0           // Wait time between steps
        },

        // getMinRoiForExpiry: Minimum ROI by expiry, less important if ABS_RATIO_THRESHOLD is high
        getMinRoiForExpiry: function (daysToExpiry) {
            // 1% for 2 days or less, increases with expiry
            const minRoi = 0.0075;
            const increment = Math.max(0, daysToExpiry - 2) * 0.001;
            return Math.min(minRoi + increment, 0.07);
        }
    },

    // Advanced portfolio allocation algorithms
    ALLOCATION_ALGORITHMS: {
        // Dynamic PUT/CALL allocation based on market bias
        calculateAllocation: function (putCallBalance, investmentAmount) {
            const putAllocation = putCallBalance >= 0
                ? investmentAmount
                : investmentAmount * (1 + putCallBalance);

            const callScale = putCallBalance < 0 ? 1 : (1 - putCallBalance);
            const callAllocation = investmentAmount * callScale;

            return {
                putAllocation,
                callAllocation,
                totalAllocation: putAllocation + callAllocation
            };
        }
    },

    // Sophisticated ROI targeting strategies
    ROI_STRATEGIES: {
        // Long-term ROI calculation with non-linear growth
        longTermROI: {
            sqrtGrowthRate: 0.02,           // Initial non-linear growth factor
            logSustainFactor: 1.5,          // Sustained growth with diminishing returns

            calculate: function (daysToExpiry) {
                if (daysToExpiry <= 1) return 1.0;

                const sqrtComponent = this.sqrtGrowthRate * (Math.sqrt(daysToExpiry) - 1);
                const logComponent = this.logSustainFactor * Math.log(daysToExpiry);

                return 0.7 + sqrtComponent + logComponent;
            }
        },

        // Short-term ROI with exponential scaling
        shortTermROI: {
            baseROI: 0.7,                   // Minimum ROI threshold
            growthFactor: 0.01,             // Exponential growth coefficient
            exponentialRate: 0.101,         // Rate of exponential increase

            calculate: function (daysToExpiry) {
                return this.baseROI + this.growthFactor * (Math.exp(this.exponentialRate * daysToExpiry) - 1);
            }
        }
    },

    // Market volatility calendar for risk management
    MARKET_EVENTS: {
        // High-impact economic events that may cause volatility
        volatilityCalendar: [
            '2025-06-11',   // U.S. Consumer Price Index (CPI) Release
            '2025-06-18',   // Federal Open Market Committee (FOMC) Meeting
            '2025-07-15',   // U.S. Consumer Price Index (CPI) Release
            '2025-07-30',   // Federal Open Market Committee (FOMC) Meeting
            '2025-08-12',   // U.S. Consumer Price Index (CPI) Release
            '2025-09-17',   // Federal Open Market Committee (FOMC) Decision
            '2025-10-29',   // Federal Open Market Committee (FOMC) Decision
            '2025-12-10'    // Federal Open Market Committee (FOMC) Decision
        ],

        // Check if a given date conflicts with high-volatility events
        isVolatileDate: function (date) {
            const dateString = new Date(date).toISOString().split('T')[0];
            return this.volatilityCalendar.includes(dateString);
        }
    },

    // Supported cryptocurrency trading pairs with precise configuration
    SUPPORTED_ASSETS: {
        // Major cryptocurrencies - Tier 1
        BTCUSDT: {
            active: true,
            tier: 1,
            put: { exercisedCoin: 'BTC', investCoin: 'USDT' },
            call: { exercisedCoin: 'USDT', investCoin: 'BTC' },
            decimalPrecision: 5,
            minInvestment: 100
        },
        BTCFDUSD: {
            active: true,
            tier: 1,
            put: { exercisedCoin: 'BTC', investCoin: 'FDUSD' },
            call: { exercisedCoin: 'FDUSD', investCoin: 'BTC' },
            decimalPrecision: 5,
            minInvestment: 100
        },
        ETHUSDT: {
            active: true,
            tier: 1,
            put: { exercisedCoin: 'ETH', investCoin: 'USDT' },
            call: { exercisedCoin: 'USDT', investCoin: 'ETH' },
            decimalPrecision: 4,
            minInvestment: 50
        },
        ETHFDUSD: {
            active: true,
            tier: 1,
            put: { exercisedCoin: 'ETH', investCoin: 'FDUSD' },
            call: { exercisedCoin: 'FDUSD', investCoin: 'ETH' },
            decimalPrecision: 4,
            minInvestment: 50
        },

        // Alternative cryptocurrencies - Tier 2
        SOLUSDT: {
            active: true,
            tier: 2,
            put: { exercisedCoin: 'SOL', investCoin: 'USDT' },
            call: { exercisedCoin: 'USDT', investCoin: 'SOL' },
            decimalPrecision: 3,
            minInvestment: 25
        },
        ADAUSDT: {
            active: true,
            tier: 2,
            put: { exercisedCoin: 'ADA', investCoin: 'USDT' },
            call: { exercisedCoin: 'USDT', investCoin: 'ADA' },
            decimalPrecision: 0,
            minInvestment: 10
        },
        AVAXUSDT: {
            active: true,
            tier: 2,
            put: { exercisedCoin: 'AVAX', investCoin: 'USDT' },
            call: { exercisedCoin: 'USDT', investCoin: 'AVAX' },
            decimalPrecision: 2,
            minInvestment: 20
        },

        // Utility function to get active trading pairs
        getActivePairs: function () {
            return Object.entries(this)
                .filter(([key, config]) => typeof config === 'object' && config.active)
                .reduce((active, [key, config]) => {
                    active[key] = config;
                    return active;
                }, {});
        },

        // Get pairs by tier
        getPairsByTier: function (tier) {
            return Object.entries(this)
                .filter(([key, config]) => typeof config === 'object' && config.tier === tier)
                .reduce((filtered, [key, config]) => {
                    filtered[key] = config;
                    return filtered;
                }, {});
        }
    }
};