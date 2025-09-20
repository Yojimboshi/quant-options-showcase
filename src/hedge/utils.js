// src\hedge\utils.js
const { log } = require('../logger');
const axios = require('axios');
const { generateSignature } = require('../helpers/utils');
const { adjustQuantityToLotSize } = require('./precisionHandling');

async function getSymbolInfo(symbol) {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/exchangeInfo');
        const symbolInfo = response.data.symbols.find(s => s.symbol === symbol);
        if (!symbolInfo) {
            throw new Error(`Symbol ${symbol} not found`);
        }
        return symbolInfo;
    } catch (error) {
        log(`Error fetching symbol info: ${error.message}`, 'error');
        return null;
    }
}

async function openCrossMarginPosition(symbol, side, amount, sharedState) {
    if (!sharedState.config || !sharedState.config.BINANCE_API_SECRET || !sharedState.config.BINANCE_API_KEY) {
        log('Missing API credentials in config', 'error');
        return null;
    }

    try {
        // Get symbol info to find LOT_SIZE filter
        const symbolInfo = await getSymbolInfo(symbol);
        if (!symbolInfo) {
            return null;
        }

        // Find LOT_SIZE filter
        const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
        if (!lotSizeFilter) {
            log(`No LOT_SIZE filter found for ${symbol}`, 'error');
            return null;
        }

        // Adjust quantity to lot size
        const adjustedQuantity = adjustQuantityToLotSize(amount, parseFloat(lotSizeFilter.stepSize));
        log(`Original quantity: ${amount}, Adjusted to lot size: ${adjustedQuantity}`, 'debug');

        const timestamp = Date.now();
        const params = {
            symbol,
            side,
            type: 'MARKET',
            quantity: adjustedQuantity.toString(),
            isIsolated: 'FALSE', // Cross margin
            sideEffectType: 'AUTO_BORROW_REPAY', // Auto borrow and auto repay
            timestamp
        };

        // Debug log the parameters
        log(`Margin order params: ${JSON.stringify(params)}`, 'debug');

        const queryString = new URLSearchParams(params).toString();
        const signature = generateSignature(queryString, sharedState.config.BINANCE_API_SECRET);

        const response = await axios.post(
            'https://api.binance.com/sapi/v1/margin/order',
            null,
            {
                params: { ...params, signature },
                headers: { 'X-MBX-APIKEY': sharedState.config.BINANCE_API_KEY }
            }
        );

        log(`Opened ${side} cross margin position for ${adjustedQuantity} ${symbol}`, 'info');
        return response.data;
    } catch (error) {
        log(`Failed to open cross margin position: ${error.response?.data?.msg || error.message}`, 'error');
        return null;
    }
}

module.exports = { openCrossMarginPosition }; 