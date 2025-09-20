// src\helpers\utils.js
const axios = require('axios');
const crypto = require('crypto');
const { log, clearProductsLog } = require('../logger');
const { TARGET_ROI } = require('../config');
const COLLATERAL_CONFIG = require('./collateral');

let lastLoggedPositions = new Map();

// Generate a signature for API requests
function generateSignature(queryString, apiSecret) {
    if (!apiSecret) throw new Error('API Secret is undefined');
    return crypto.createHmac('sha256', apiSecret)
        .update(queryString)
        .digest('hex');
}

// Fetch dual investment products from Binance
async function fetchDualInvestmentProducts(config) {
    try {
        const allProducts = [];
        const batchSize = 10; // Adjust based on rate limits

        // Clear previous products log
        clearProductsLog();

        const fetchPromises = Object.entries(config.SUPPORTED_ASSETS)
            .filter(([_, assetConfig]) => typeof assetConfig === 'object' && assetConfig.active)
            .flatMap(([pair, { put, call }]) => [
                {
                    pair,
                    type: 'BUY',
                    params: {
                        product: 'DUAL_INVESTMENT',
                        exercisedCoin: put.exercisedCoin,
                        investCoin: put.investCoin,
                        optionType: 'PUT',
                        pageSize: config.FETCH_CONFIG.pageSize,
                        pageIndex: config.FETCH_CONFIG.pageIndex,
                        timestamp: Date.now()
                    }
                },
                {
                    pair,
                    type: 'SELL',
                    params: {
                        product: 'DUAL_INVESTMENT',
                        exercisedCoin: call.exercisedCoin,
                        investCoin: call.investCoin,
                        optionType: 'CALL',
                        pageSize: config.FETCH_CONFIG.pageSize,
                        pageIndex: config.FETCH_CONFIG.pageIndex,
                        timestamp: Date.now()
                    }
                }
            ]);

        for (let i = 0; i < fetchPromises.length; i += batchSize) {
            const batch = fetchPromises.slice(i, i + batchSize);
            const results = await Promise.all(
                batch.map(({ pair, type, params }) => {
                    const queryString = new URLSearchParams(params).toString();
                    const signature = generateSignature(queryString, config.BINANCE_API_SECRET);
                    return axios.get('https://api.binance.com/sapi/v1/dci/product/list', {
                        params: { ...params, signature },
                        headers: { 'X-MBX-APIKEY': config.BINANCE_API_KEY }
                    }).catch(error => ({ error, pair, type, queryString }));
                })
            );

            results.forEach((result, index) => {
                const { pair, type } = batch[index];
                if (result.error) {
                    log(`Fetch request failed for ${pair}: ${result.error.response?.data?.msg || result.error.message}`, 'error');
                } else if (result.data?.list?.length) {
                    allProducts.push(...result.data.list);
                }
            });
        }

        if (!allProducts.length) {
            log('No products available', 'products');
            return null;
        }

        // Sort products by pair and type for better readability
        allProducts.sort((a, b) => {
            const pairA = `${a.exercisedCoin}${a.investCoin}`;
            const pairB = `${b.exercisedCoin}${b.investCoin}`;
            if (pairA !== pairB) return pairA.localeCompare(pairB);
            return a.optionType.localeCompare(b.optionType);
        });

        // Log all products with ROI calculations
        listAllProducts(allProducts, config);  // Remove this line

        return allProducts;
    } catch (error) {
        log(`Unexpected error fetching products: ${error.message}`, 'error');
        return null;
    }
}

function listAllProducts(products, config) {
    if (!products || products.length === 0) {
        log('No products to list', 'products');
        return;
    }

    let currentPair = '';
    products.forEach(product => {
        const settleTime = product.settleDate;
        const now = Date.now();
        const hoursToExpiry = Math.round((settleTime - now) / (1000 * 60 * 60));
        const daysToExpiry = hoursToExpiry / 24;
        const displayDays = daysToExpiry.toFixed(1);

        // Round days for ROI calculation (0.5 threshold)
        const roundedDays = Math.round(daysToExpiry);

        const annualApr = parseFloat(product.apr) * 100;
        const dailyApr = annualApr / 365;
        const roi = dailyApr * roundedDays; // ROI using rounded days

        const typeLabel = product.optionType === 'CALL' ? 'SELL' : 'BUY';
        const pairName = product.optionType === 'CALL'
            ? `${product.investCoin}${product.exercisedCoin}`
            : `${product.exercisedCoin}${product.investCoin}`;

        // Add pair header if it's a new pair and has valid products
        if (pairName !== currentPair) {
            // Look ahead to see if there are any products for this pair
            const hasProductsForPair = products.some(p => {
                const nextPairName = p.optionType === 'CALL'
                    ? `${p.investCoin}${p.exercisedCoin}`
                    : `${p.exercisedCoin}${p.investCoin}`;
                return nextPairName === pairName;
            });

            if (hasProductsForPair) {
                // Add a separator line between pairs
                const prefix = currentPair ? '\n' : '';
                log(`${prefix}==================== ${pairName} Products ====================`, 'products');
                currentPair = pairName;
            }
        }

        // Determine short-term or long-term
        const isShortTerm = hoursToExpiry <= config.SHORT_TERM_EXPIRY_HOURS[1];
        const targetRoiFunc = isShortTerm
            ? config.ROI_STRATEGIES.shortTermROI.calculate.bind(config.ROI_STRATEGIES.shortTermROI)
            : config.ROI_STRATEGIES.longTermROI.calculate.bind(config.ROI_STRATEGIES.longTermROI);

        const targetRoi = targetRoiFunc(roundedDays);
        const minRoi = config.HEDGE_SAFETY.getMinRoiForExpiry(roundedDays) * 100;

        log(
            `${typeLabel} | Strike: ${product.strikePrice} | ` +
            `Expiry: ${hoursToExpiry}h (${displayDays}d → ${roundedDays}d) | ` +
            `APR: ${annualApr.toFixed(2)}% | ROI: ${roi.toFixed(2)}% | ` +
            `Target: ${targetRoi.toFixed(2)}% | Min: ${minRoi.toFixed(2)}%`,
            'products'
        );
    });
}

// Lightweight fetch for retrying a single product
async function fetchDualProductByMeta({ optionType, exercisedCoin, investCoin, config }) {
    const timestamp = Date.now();
    const params = {
        optionType,
        exercisedCoin,
        investCoin,
        pageSize: 100,
        timestamp
    };

    const queryString = new URLSearchParams(params).toString();
    const signature = generateSignature(queryString, config.BINANCE_API_SECRET);

    try {
        const response = await axios.get(
            'https://api.binance.com/sapi/v1/dci/product/list',
            {
                params: { ...params, signature },
                headers: { 'X-MBX-APIKEY': config.BINANCE_API_KEY }
            }
        );
        return response.data?.data || [];
    } catch (error) {
        log(`❌ Error fetching retry product: ${error.message}`, 'debug');
        return [];
    }
}


async function fetchPositions(config) {
    let allPositions = [];
    let pageIndex = 1;

    try {
        while (true) {
            const params = {
                timestamp: Date.now(),
                product: 'DUAL_INVESTMENT',
                pageSize: 100,   // Max 100 per page
                pageIndex: pageIndex, // Start from page 1
                status: 'PURCHASE_SUCCESS' // Only fetch successful purchases
            };

            const queryString = new URLSearchParams(params).toString();
            const signature = generateSignature(queryString, config.BINANCE_API_SECRET);

            const url = 'https://api.binance.com/sapi/v1/dci/product/positions';
            const headers = { 'X-MBX-APIKEY': config.BINANCE_API_KEY };

            const response = await axios.get(url, {
                params: { ...params, signature },
                headers
            });

            const fetchedPositions = response.data.list || [];

            if (fetchedPositions.length === 0) {
                break; // No more positions to fetch
            }

            // Filter only PURCHASE_SUCCESS status
            const activePositions = fetchedPositions.filter(pos => pos.purchaseStatus === 'PURCHASE_SUCCESS');

            // Add the fetched positions to the allPositions array
            allPositions = [...allPositions, ...activePositions];

            // If less than the page size, it's the last page
            if (fetchedPositions.length < 100) {
                break;
            }

            // Increment to fetch the next page
            pageIndex++;
        }

        // Build current state for comparison
        const currentPositions = new Map();
        allPositions.forEach(pos => {
            const currentTime = Date.now();
            const expiryTime = pos.settleDate;
            const hoursToExpiry = Math.round((expiryTime - currentTime) / (1000 * 60 * 60));
            const annualApr = parseFloat(pos.apr) * 100;
            const roi = (annualApr * pos.duration) / 365;

            currentPositions.set(pos.id, {
                id: pos.id,
                pair: `${pos.exercisedCoin}${pos.investCoin}`,
                type: pos.optionType === 'PUT' ? 'BUY' : 'SELL',
                amount: pos.subscriptionAmount,
                strikePrice: pos.strikePrice,
                settleDate: pos.settleDate,
                apr: pos.apr,
                duration: pos.duration,
                hoursToExpiry: hoursToExpiry,
                roi: roi
            });
        });

        // Compare current positions with the last logged state
        let hasChanges = false;
        if (lastLoggedPositions.size !== currentPositions.size) {
            hasChanges = true; // Size difference means a change
        } else {
            for (const [id, pos] of currentPositions) {
                const lastPos = lastLoggedPositions.get(id);
                if (!lastPos ||
                    lastPos.pair !== pos.pair ||
                    lastPos.type !== pos.type ||
                    lastPos.amount !== pos.amount ||
                    lastPos.settleDate !== pos.settleDate ||
                    lastPos.roi !== pos.roi) {
                    hasChanges = true;
                    break;
                }
            }
        }

        // Log only if there are changes
        if (hasChanges) {
            if (allPositions.length > 0) {
                log('Active Positions:', 'positionhistories');
                allPositions.forEach(pos => {
                    const positionData = currentPositions.get(pos.id);
                    const fullPositionData = {
                        ...pos,
                        roi: positionData.roi,
                        hoursToExpiry: positionData.hoursToExpiry,
                        hedgeStatus: positionData.hedgeStatus || 'NONE',
                        apr: parseFloat(pos.apr) * 100,  // Convert to percentage format
                        spotPrice: pos.spotPrice,
                        breakEven: pos.breakEven,
                        bufferPercent: pos.bufferPercent,
                        targetRoi: pos.targetRoi,
                        actualRoi: pos.actualRoi
                    };
                    log(JSON.stringify(fullPositionData), 'positionhistories');
                });
                log(`Total positions: ${allPositions.length}`, 'positionhistories');
            } else {
                log('No active positions found', 'positionhistories');
            }
            // Update the last logged state
            lastLoggedPositions = new Map(currentPositions);
        }

        return allPositions;

    } catch (error) {
        log(`Error fetching positions: ${error.response?.data?.msg || error.message}`, 'error');
        if (error.response) {
            log(`Error response data: ${JSON.stringify(error.response.data)}`, 'error');
        }
        return null;
    }
}

async function fetchCurrentPrice(pair, config) {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/ticker/price', {
            params: { symbol: pair }
        });
        return parseFloat(response.data.price);
    } catch (error) {
        log(`Error fetching price for ${pair}: ${error.message}`);
        return null;
    }
}

// Function to get current active loans
async function getCurrentLoans(config) {
    try {
        const timestamp = Date.now();
        const params = {
            timestamp,
            limit: 100
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

        if (response.data && response.data.rows) {
            return response.data.rows;
        }
        return [];
    } catch (error) {
        log(`Error fetching current loans: ${error.response?.data?.msg || error.message}`, 'debug');
        return [];
    }
}

// Function to borrow coins
async function borrowCoins(coin, amount, config) {
    try {
        const timestamp = Date.now();

        // Get enabled collateral assets and sort based on priority logic
        let collateralAssets = Object.entries(COLLATERAL_CONFIG.assets)
            .filter(([_, config]) => config.enabled);

        // If borrowing BTC, move BTC to lowest priority
        if (coin === 'BTC') {
            collateralAssets.sort(([a, aConfig], [b, bConfig]) => {
                if (a === 'BTC') return 1; // Move BTC to end
                if (b === 'BTC') return -1;
                return aConfig.priority - bConfig.priority;
            });
        } else {
            // For all other coins, keep BTC as highest priority
            collateralAssets.sort(([a, aConfig], [b, bConfig]) => {
                if (a === 'BTC') return -1; // Keep BTC first
                if (b === 'BTC') return 1;
                return aConfig.priority - bConfig.priority;
            });
        }

        // Try each collateral asset in priority order
        for (const [collateralCoin, collateralConfig] of collateralAssets) {
            // Calculate required collateral based on LTV
            const isCollateralStable = collateralCoin === 'USDT' || collateralCoin === 'FDUSD';
            const isCoinStable = coin === 'USDT' || coin === 'FDUSD';

            // Handle price fetching based on whether coins are stablecoins
            let currentPrice, collateralPrice;
            if (isCollateralStable) {
                // If collateral is stablecoin, use direct price for the coin
                currentPrice = await fetchCurrentPrice(`${coin}${collateralCoin}`, config);
                collateralPrice = 1; // Stablecoin price is always 1
            } else if (isCoinStable) {
                // If coin is stablecoin, use inverse price for collateral
                currentPrice = 1; // Stablecoin price is always 1
                collateralPrice = await fetchCurrentPrice(`${collateralCoin}${coin}`, config);
            } else {
                // Both are non-stablecoins, fetch both prices in USDT
                currentPrice = await fetchCurrentPrice(`${coin}USDT`, config);
                collateralPrice = await fetchCurrentPrice(`${collateralCoin}USDT`, config);
            }

            if (!currentPrice || !collateralPrice) {
                log(`Failed to fetch prices for ${coin} or ${collateralCoin}`, 'debug');
                continue; // Try next collateral
            }

            const borrowValue = amount * currentPrice;
            const collateralValue = borrowValue / collateralConfig.ltv;
            const collateralAmount = collateralValue / collateralPrice;

            const params = {
                loanCoin: coin,
                loanAmount: amount,
                collateralCoin: collateralCoin,
                collateralAmount: collateralAmount.toFixed(8),
                timestamp
            };

            const queryString = new URLSearchParams(params).toString();
            const signature = generateSignature(queryString, config.BINANCE_API_SECRET);

            try {
                const response = await axios.post(
                    'https://api.binance.com/sapi/v2/loan/flexible/borrow',
                    null,
                    {
                        params: { ...params, signature },
                        headers: { 'X-MBX-APIKEY': config.BINANCE_API_KEY }
                    }
                );

                log(`Successfully borrowed ${amount} ${coin} using ${collateralAmount.toFixed(8)} ${collateralCoin} as collateral`, 'debug');
                return response.data;
            } catch (error) {
                log(`Failed to borrow with ${collateralCoin}: ${error.response?.data?.msg || error.message}`, 'debug');
                continue; // Try next collateral
            }
        }

        log(`Failed to borrow ${amount} ${coin} with any collateral`, 'debug');
        return null;
    } catch (error) {
        log(`Error in borrowCoins: ${error.message}`, 'debug');
        return null;
    }
}

// Function to fetch spot balances
async function fetchSpotBalances(config) {
    try {
        const timestamp = Date.now();
        const params = { timestamp };

        const queryString = new URLSearchParams(params).toString();
        const signature = generateSignature(queryString, config.BINANCE_API_SECRET);

        const response = await axios.get(
            'https://api.binance.com/api/v3/account',
            {
                params: { ...params, signature },
                headers: { 'X-MBX-APIKEY': config.BINANCE_API_KEY }
            }
        );

        // Convert balances array to a map of coin -> free amount
        const balances = {};
        response.data.balances.forEach(balance => {
            const free = parseFloat(balance.free);
            if (free > 0) {
                balances[balance.asset] = free;
            }
        });

        return balances;
    } catch (error) {
        log(`Error fetching spot balances: ${error.response?.data?.msg || error.message}`, 'debug');
        return {};
    }
}

async function execute(processedProducts, config, mock = false, spotBalances = {}) {
    let balances = {
        USDT: config.INVESTMENT_AMOUNT,
        FDUSD: config.INVESTMENT_AMOUNT
    };

    if (!processedProducts) {
        log(`No products to execute`, 'execution');
        return { balances };
    }

    const totalStablecoinAmount = config.INVESTMENT_AMOUNT * config.ALLOCATION_FRACTION;

    for (const product of processedProducts) {
        // Determine if investCoin is a stablecoin (USDT or FDUSD)
        const isInvestCoinStable = product.investCoin === 'USDT' || product.investCoin === 'FDUSD';
        // Construct the pair key for config lookup and price fetch (always base/quote format)
        const coinConfigKey = isInvestCoinStable
            ? `${product.exercisedCoin}${product.investCoin}` // e.g., DOGEUSDT
            : `${product.investCoin}${product.exercisedCoin}`; // e.g., SOLFDUSD
        // Pair format for subscription and logging
        const pairKey = `${product.investCoin}${product.exercisedCoin}`; // e.g., USDTDOGE, SOLFDUSD

        // Get the coin config for this pair
        const coinConfig = config.SUPPORTED_ASSETS[coinConfigKey];
        if (!coinConfig || !coinConfig.active) {
            log(`Skipping ${pairKey} - No active coin config found for ${coinConfigKey}`, 'execution');
            continue;
        }

        const putCallBalance = config.PUT_CALL_BALANCE;
        const { putAllocation: putAmount, callAllocation: callAmount } = config.ALLOCATION_ALGORITHMS.calculateAllocation(putCallBalance, totalStablecoinAmount);

        // Handle PUT option (direct subscription with stablecoin amount)
        if (product.optionType === 'PUT' && putAmount >= 1) {
            const currentBalance = spotBalances[product.investCoin] || 0;
            if (currentBalance < putAmount) {
                log(`Insufficient balance for PUT option. Current: ${currentBalance} ${product.investCoin}, Need: ${putAmount} ${product.investCoin}`, 'execution');
                // Implement borrow logic using collateral priority
                const borrowResult = await borrowCoins(product.investCoin, putAmount, config);
                if (!borrowResult) {
                    log(`Failed to borrow ${putAmount} ${product.investCoin} with any collateral`, 'execution');
                    continue;
                }
            } else {
                log(`Sufficient balance for PUT option. Current: ${currentBalance} ${product.investCoin}, Need: ${putAmount} ${product.investCoin}`, 'execution');
            }

            if (!mock) {
                const success = await subscribeToProduct(product, putAmount, config);
                if (success) {
                    balances[isInvestCoinStable ? product.investCoin : product.exercisedCoin] -= putAmount;
                }
            } else {
                log(`Mock: BUY Subscribed ${putAmount.toFixed(2)} ${product.investCoin} to ${pairKey} - ${product.id}/${product.orderId}`, 'execution');
            }
        }

        // Handle CALL option (price fetch needed)
        if (product.optionType === 'CALL' && callAmount >= 1) {
            const currentPrice = await fetchCurrentPrice(coinConfigKey, config); // Fetch price for base/quote pair
            if (!currentPrice) {
                log(`Skipping ${pairKey} due to price fetch failure`, 'execution');
                continue;
            }

            const precision = coinConfig.decimalPrecision;
            const coinAmount = Number((callAmount / currentPrice).toFixed(precision)); // Calculate coin amount

            const currentBalance = spotBalances[isInvestCoinStable ? product.exercisedCoin : product.investCoin] || 0;
            if (currentBalance < coinAmount) {
                log(`Insufficient balance for CALL option. Current: ${currentBalance} ${product.investCoin}, Need: ${coinAmount} ${product.investCoin}`, 'execution');
                // Implement borrow logic using collateral priority
                const borrowResult = await borrowCoins(product.investCoin, coinAmount, config);
                if (!borrowResult) {
                    log(`Failed to borrow ${coinAmount} ${product.investCoin} with any collateral`, 'execution');
                    continue;
                }
            } else {
                log(`Sufficient balance for CALL option. Current: ${currentBalance} ${product.investCoin}, Need: ${coinAmount} ${product.investCoin}`, 'execution');
            }

            if (!mock) {
                const success = await subscribeToProduct(product, coinAmount, config);
                if (success) {
                    balances[isInvestCoinStable ? product.exercisedCoin : product.investCoin] -= coinAmount;
                }
            } else {
                log(`Mock: SELL Subscribed ${coinAmount} ${product.investCoin} to ${pairKey} - ${product.id}/${product.orderId}`, 'execution');
            }
        }
    }
    return { balances };
}

// Subscribe to a product on Binance
async function subscribeToProduct(product, amount, config) {
    try {
        const timestamp = Date.now();
        const params = {
            id: product.id,
            orderId: product.orderId,
            depositAmount: amount,
            autoCompoundPlan: 'NONE',
            timestamp
        };
        const queryString = new URLSearchParams(params).toString();
        const signature = generateSignature(queryString, config.BINANCE_API_SECRET);

        const response = await axios.post(
            'https://api.binance.com/sapi/v1/dci/product/subscribe',
            null,
            {
                params: { ...params, signature },
                headers: { 'X-MBX-APIKEY': config.BINANCE_API_KEY }
            }
        );

        const pair = `${product.investCoin}${product.exercisedCoin}`;
        const coin = product.optionType === 'PUT' ? product.investCoin : product.exercisedCoin;
        const displayAmount = product.optionType === 'PUT' ? amount : (amount * parseFloat(product.strikePrice)).toFixed(4);

        const expiryDateStr = new Date(product.settleDate).toISOString().split('T')[0];
        const aprDisplay = product.apr ? ` | APR: ${(parseFloat(product.apr) * 100).toFixed(2)}%` : '';
        const strikeDisplay = product.strikePrice ? ` | Strike: ${product.strikePrice}` : '';
        const spotDisplay = product.spotPrice ? ` | Spot: ${product.spotPrice}` : '';
        const bufferDisplay = product.bufferPercent ? ` | Buffer: ${product.bufferPercent > 0 ? '+' : ''}${product.bufferPercent.toFixed(2)}%` : '';
        const roiComparison = product.targetRoi ? ` | ROI: ${product.actualRoi.toFixed(2)}% > ${product.targetRoi.toFixed(2)}%` : '';
        log(
            `✅ Subscribed ${pair} | ${displayAmount} ${coin} | ${product.optionType === 'PUT' ? 'BUY' : 'SELL'} | ID: ${product.id}/${product.orderId} | Expiry: ${expiryDateStr}${aprDisplay}${strikeDisplay}${spotDisplay}${bufferDisplay}${roiComparison}`,
            'execution'
        );

        return true;
    } catch (error) {
        const code = error?.response?.data?.code || 'N/A';
        const msg = error?.response?.data?.msg || error.message;
        const status = error?.response?.status || 'NoStatus';

        log(
            `❌ Failed to subscribe ${product.id}/${product.orderId} | Status: ${status} | Code: ${code} | Msg: ${msg}`,
            'debug'
        );

        // 🔁 Retry logic for -9000 APY update
        if (
            code === -9000 &&
            typeof msg === 'string' &&
            msg.includes('APY') &&
            !retriedProducts.has(product.id)
        ) {
            retriedProducts.add(product.id);
            log(`🔁 Retrying due to APY update for ${product.id}/${product.orderId}`, 'debug');

            const updatedProducts = await fetchDualProductByMeta({
                optionType: product.optionType,
                exercisedCoin: product.exercisedCoin,
                investCoin: product.investCoin,
                config
            });

            const matched = updatedProducts.find(p =>
                p.underlying === product.underlying &&
                p.optionType === product.optionType &&
                p.settleCoin === product.settleCoin &&
                p.settleDate === product.settleDate &&
                parseFloat(p.apr) >= parseFloat(product.apr)
            );

            if (!matched) {
                log(`⚠️ Retry skipped — no product matched with APY ≥ ${(parseFloat(product.apr) * 100).toFixed(2)}%`, 'debug');
            }

            if (matched) {
                return await subscribeToProduct(matched, amount, config);
            } else {
                log(`⚠️ Retry failed — could not find updated product for ${product.id}`, 'debug');
            }
        }
        return false;
    }

}

async function fetchSpotPrices(config) {
    try {
        const spotPrices = {};

        // Get all active trading pairs from SUPPORTED_ASSETS
        const activePairs = config.SUPPORTED_ASSETS.getActivePairs();

        // Fetch all prices in parallel
        const promises = Object.entries(activePairs).map(async ([pair, pairConfig]) => {
            try {
                const response = await axios.get('https://api.binance.com/api/v3/ticker/price', {
                    params: { symbol: pair }
                });
                spotPrices[pair] = parseFloat(response.data.price);
            } catch (err) {
                log(`Failed to fetch spot price for ${pair}: ${err.message}`, 'error');
            }
        });

        await Promise.all(promises);
        return spotPrices;
    } catch (err) {
        log(`Failed to fetch spot prices: ${err.message}`, 'error');
        return null;
    }
}

module.exports = {
    generateSignature,
    listAllProducts,
    fetchDualInvestmentProducts,
    fetchDualProductByMeta,
    subscribeToProduct,
    fetchPositions,
    execute,
    getCurrentLoans,
    borrowCoins,
    fetchSpotBalances, fetchCurrentPrice, fetchSpotPrices
};