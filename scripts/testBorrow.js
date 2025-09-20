require('dotenv').config();
const path = require('path');
const { log } = require(path.join(__dirname, '../src/logger'));
const axios = require('axios');
const crypto = require('crypto');
const config = require(path.join(__dirname, '../src/config'));
const { borrowCoins, fetchCurrentPrice } = require(path.join(__dirname, '../src/helpers/utils'));

// Helper function to generate signature for API requests
function generateSignature(queryString, apiSecret) {
    if (!apiSecret) throw new Error('API Secret is undefined');
    return crypto.createHmac('sha256', apiSecret)
        .update(queryString)
        .digest('hex');
}

// Function to get current price
async function getCurrentPrice(symbol, quoteAsset = 'USDT') {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/ticker/price', {
            params: { symbol: `${symbol}${quoteAsset}` }
        });
        return parseFloat(response.data.price);
    } catch (error) {
        log(`Error fetching price for ${symbol}: ${error.message}`, 'debug');
        return null;
    }
}

// Function to get current active loans
async function getCurrentLoans() {
    try {
        const timestamp = Date.now();
        const params = {
            timestamp,
            limit: 100  // Max loans to fetch
        };

        const queryString = new URLSearchParams(params).toString();
        const signature = generateSignature(queryString, config.BINANCE_API_SECRET);

        const response = await axios.get(
            'https://api.binance.com/sapi/v2/loan/flexible/ongoing/orders',
            {
                params: { ...params, signature },
                headers: { 'X-MBX-APIKEY': config.BINANCE_API_KEY }
            }
        );

        log('Current Active Loans:', 'debug');
        if (response.data && response.data.rows) {
            response.data.rows.forEach(loan => {
                log(`Loan Coin: ${loan.loanCoin} | Total Debt: ${loan.totalDebt} | Collateral: ${loan.collateralAmount} ${loan.collateralCoin} | Current LTV: ${loan.currentLTV}`, 'debug');
            });
        } else {
            log('No active loans found', 'debug');
        }

        return response.data;
    } catch (error) {
        log(`Error fetching current loans: ${error.response?.data?.msg || error.message}`, 'debug');
        return null;
    }
}

// Function to get loan history
async function getLoanHistory() {
    try {
        const timestamp = Date.now();
        const params = {
            timestamp,
            limit: 100  // Max history entries to fetch
        };

        const queryString = new URLSearchParams(params).toString();
        const signature = generateSignature(queryString, config.BINANCE_API_SECRET);

        const response = await axios.get(
            'https://api.binance.com/sapi/v2/loan/flexible/borrow/history',
            {
                params: { ...params, signature },
                headers: { 'X-MBX-APIKEY': config.BINANCE_API_KEY }
            }
        );

        log('Loan History:', 'debug');
        if (response.data && response.data.rows) {
            response.data.rows.forEach(loan => {
                const borrowTime = new Date(parseInt(loan.borrowTime));
                log(`Loan Coin: ${loan.loanCoin} | Amount: ${loan.initialLoanAmount} | Collateral: ${loan.initialCollateralAmount} ${loan.collateralCoin} | Status: ${loan.status} | Time: ${borrowTime.toLocaleString()}`, 'debug');
            });
        } else {
            log('No loan history found', 'debug');
        }

        return response.data;
    } catch (error) {
        log(`Error fetching loan history: ${error.response?.data?.msg || error.message}`, 'debug');
        return null;
    }
}

// Function to get loanable assets
async function getLoanableAssets() {
    try {
        const timestamp = Date.now();
        const params = {
            timestamp
        };

        const queryString = new URLSearchParams(params).toString();
        const signature = generateSignature(queryString, config.BINANCE_API_SECRET);

        const response = await axios.get(
            'https://api.binance.com/sapi/v2/loan/flexible/loanable/data',
            {
                params: { ...params, signature },
                headers: { 'X-MBX-APIKEY': config.BINANCE_API_KEY }
            }
        );

        log('Available Loan Assets:', 'debug');
        if (response.data && Array.isArray(response.data)) {
            response.data.forEach(asset => {
                log(`Asset: ${asset.coin} | Min Amount: ${asset.minAmount} | Max Amount: ${asset.maxAmount} | Interest Rate: ${asset.interestRate}%`, 'debug');
            });
        } else {
            log('No loanable assets found', 'debug');
        }

        return response.data;
    } catch (error) {
        log(`Error fetching loanable assets: ${error.response?.data?.msg || error.message}`, 'debug');
        return null;
    }
}


// Test scenarios
async function testBorrowScenarios() {
    try {
        // Test 1: Borrow stablecoin (USDT) with BTC collateral
        log('\n🔵 Test 1: Borrow USDT with BTC collateral', 'debug');
        const usdtAmount = 1000;
        // const borrowResult1 = await borrowCoins('USDT', usdtAmount, config);
        // if (borrowResult1) {
        //     log(`✅ Successfully borrowed ${usdtAmount} USDT`, 'debug');
        // }
        log(`[SAFE MODE] Would have borrowed ${usdtAmount} USDT`, 'debug');

        // Test 2: Borrow altcoin (ADA) with USDT collateral
        log('\n🔵 Test 2: Borrow ADA with USDT collateral', 'debug');
        const adaAmount = 1000; // Value in USDT
        const adaPrice = await fetchCurrentPrice('ADAUSDT', config);
        const adaCoinAmount = adaAmount / adaPrice;
        // const borrowResult2 = await borrowCoins('ADA', adaCoinAmount, config);
        // if (borrowResult2) {
        //     log(`✅ Successfully borrowed ${adaCoinAmount.toFixed(2)} ADA`, 'debug');
        // }
        log(`[SAFE MODE] Would have borrowed ${adaCoinAmount.toFixed(2)} ADA`, 'debug');

        // Test 3: Borrow BTC with USDT collateral
        log('\n🔵 Test 3: Borrow BTC with USDT collateral', 'debug');
        const btcAmount = 0.1; // BTC amount
        // const borrowResult3 = await borrowCoins('BTC', btcAmount, config);
        // if (borrowResult3) {
        //     log(`✅ Successfully borrowed ${btcAmount} BTC`, 'debug');
        // }
        log(`[SAFE MODE] Would have borrowed ${btcAmount} BTC`, 'debug');

        // Test 4: Borrow with insufficient collateral
        log('\n🔵 Test 4: Borrow with insufficient collateral', 'debug');
        const largeAmount = 1000000; // Very large amount to test failure
        // const borrowResult4 = await borrowCoins('USDT', largeAmount, config);
        // if (!borrowResult4) {
        //     log(`✅ Expected failure for large amount: ${largeAmount} USDT`, 'debug');
        // }
        log(`[SAFE MODE] Would have attempted to borrow ${largeAmount} USDT (expected to fail)`, 'debug');

        // Test 5: Borrow with invalid coin
        log('\n🔵 Test 5: Borrow with invalid coin', 'debug');
        // const borrowResult5 = await borrowCoins('INVALID', 100, config);
        // if (!borrowResult5) {
        //     log(`✅ Expected failure for invalid coin`, 'debug');
        // }
        log(`[SAFE MODE] Would have attempted to borrow INVALID coin (expected to fail)`, 'debug');

    } catch (error) {
        log(`❌ Error in borrow tests: ${error.message}`, 'debug');
    }
}

// Run tests
async function runTests() {
    log('🚀 Starting borrow tests...', 'debug');
    await testBorrowScenarios();
    await getCurrentLoans();
    log('✨ Borrow tests completed', 'debug');
}

runTests(); 