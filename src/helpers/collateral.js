// src\helpers\collateral.js
const COLLATERAL_CONFIG = {
    // Available collateral assets and their settings
    assets: {
        BTC: {
            enabled: true,
            minAmount: 0.001,
            maxAmount: 10,
            ltv: 0.75, // Loan-to-Value ratio (75%)
            priority: 1 // Higher priority will be used first
        },
        FDUSD: {
            enabled: true,
            minAmount: 100,
            maxAmount: 100000,
            ltv: 0.75, // Higher LTV for stablecoins
            priority: 2
        },
        USDT: {
            enabled: true,
            minAmount: 100,
            maxAmount: 100000,
            ltv: 0.75, // Higher LTV for stablecoins
            priority: 3
        }
    },

    // Loan settings
    loan: {
        defaultTerm: 7, // Default loan term in days
        maxActiveLoans: 5, // Maximum number of active loans
        minBorrowAmount: 100, // Minimum amount to borrow in USDT
        maxBorrowAmount: 10000 // Maximum amount to borrow in USDT
    }
};

module.exports = COLLATERAL_CONFIG; 