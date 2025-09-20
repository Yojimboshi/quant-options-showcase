/**
 * Crypto Options Trading Platform
 * Advanced dual investment trading system with automated risk management
 */

require('dotenv').config();
const cron = require('node-cron');
const { filterAndProcessProducts } = require('./helpers/algo');
const { fetchDualInvestmentProducts, fetchPositions, execute, fetchSpotBalances, fetchSpotPrices } = require('./helpers/utils');
const { log } = require('./logger');
const config = require('./config');
const { HedgeManager } = require('./hedge');
const SharedState = require('./sharedState');
const fs = require('fs').promises;
const path = require('path');

// Use the singleton instance
const sharedState = SharedState.instance;

// Set config on sharedState
sharedState.config = config;

// State tracking for logging
let previousPositionsCount = 0;
let previousProductStatus = '';

let cronLock = false;
const hedgeManager = new HedgeManager(config.HEDGE_STRATEGY || 'dynamic', sharedState);

// === Lock Mechanism ===
async function safeRun(task) {
    if (cronLock) {
        log('⏸️ Skipping overlapping cron run due to active lock', 'debug');
        return;
    }
    cronLock = true;
    try {
        await task();
    } catch (err) {
        log(`Cron task failed: ${err.message}`, 'error');
    } finally {
        cronLock = false;
    }
}

// === State Updaters ===
async function updatePositions() {
    try {
        // #1 Fetch latest positions from exchange/platform API
        const positions = await fetchPositions(config);

        // #2 Load up-to-date hedge status from positions.log
        await sharedState.loadHedgeStatus();

        // #3 Inject hedge status properties into every position (for easy downstream use)
        sharedState.positions = (positions || []).map(pos => ({
            ...pos,
            hedgeStatus: sharedState.getHedgeStatus(pos.id)
        }));
        sharedState.lastUpdated = Date.now();

        // Only log if position count has changed
        if (sharedState.positions.length !== previousPositionsCount) {
            log(`[INFO] Updated positions: ${sharedState.positions.length}`, 'info');
            previousPositionsCount = sharedState.positions.length;
        }

        // #4 Update positions.log with latest state
        const positionsMap = {};
        sharedState.positions.forEach(pos => {
            positionsMap[pos.id] = {
                ...pos,
                hedgeStatus: pos.hedgeStatus,
                createdAt: pos.createdAt || new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };
        });

        const positionsLogPath = path.join(__dirname, '../log/positions.log');
        await fs.writeFile(
            positionsLogPath,
            JSON.stringify(positionsMap, null, 2)
        );

    } catch (err) {
        log(`❌ Failed to update positions: ${err.message}`, 'error');
        log(`Stack trace: ${err.stack}`, 'error');
    }
}

async function updateSpotBalances() {
    try {
        // #5 Fetch latest spot balances from exchange/platform API
        const balances = await fetchSpotBalances(config);
        sharedState.spotBalances = balances;
        sharedState.balancesLastUpdated = Date.now();
        // Removed spot balance update log
    } catch (err) {
        log(`❌ Failed to update spot balances: ${err.message}`, 'error');
    }
}

// === Execution Logic ===
async function runExecution() {
    // #6 Core logic: evaluate and execute trade opportunities based on updated state
    const activePositions = sharedState.positions;
    if (activePositions.length >= config.MAX_TOTAL_POSITIONS) {
        const message = '⚠️ Max positions reached, skipping execution';
        if (previousProductStatus !== message) {
            log(message, 'info');
            previousProductStatus = message;
        }
        return;
    }

    // #7 Fetch spot prices first
    const spotPrices = await fetchSpotPrices(config);
    if (!spotPrices) {
        log('❌ Failed to fetch spot prices', 'error');
        return;
    }

    // #8 Fetch dual investment products from platform
    const products = await fetchDualInvestmentProducts(config);
    if (!products) {
        const message = '❌ No products available';
        if (previousProductStatus !== message) {
            log(message, 'info');
            previousProductStatus = message;
        }
        return;
    }

    // Add spot prices to products
    products.forEach(product => {
        const pair = product.optionType === 'PUT'
            ? `${product.exercisedCoin}${product.investCoin}`
            : `${product.investCoin}${product.exercisedCoin}`;
        product.spotPrice = spotPrices[pair];
    });

    // Filter out products without spot prices
    const productsWithSpot = products.filter(p => p.spotPrice);
    if (productsWithSpot.length === 0) {
        log('❌ No products with valid spot prices', 'error');
        return;
    }

    // Log available products for analysis (sanitized for showcase)
    log(`Found ${productsWithSpot.length} products with valid spot prices`, 'info');

    // #9 Filter and process products (short and long term)
    // V1 algorithm
    // const shortTermProducts = await filterAndProcessProducts(
    //     productsWithSpot,
    //     config,
    //     activePositions,
    //     true
    // );
    // const longTermProducts = await filterAndProcessProducts(
    //     productsWithSpot,
    //     config,
    //     activePositions,
    //     false
    // );

    const shortTermProducts = await filterAndProcessProducts(
        productsWithSpot,
        config,
        activePositions,
        true
    );

    const longTermProducts = await filterAndProcessProducts(
        productsWithSpot,
        config,
        activePositions,
        false
    );
    const allProcessed = [...shortTermProducts, ...longTermProducts];

    // #10 No eligible products to act on
    if (allProcessed.length === 0) {
        const message = '🟡 No eligible products found';
        // Only log if status has changed and message is clean
        if (previousProductStatus !== message && typeof message === 'string') {
            log(message.trim(), 'info');  // Ensure message is trimmed
            previousProductStatus = message.trim();
        }
        return;
    }

    // Reset product status when we have products to process
    previousProductStatus = '';

    // #10 Execute subscriptions/orders for selected products
    await execute(allProcessed, config, false, sharedState.spotBalances);
}

// === Main Sequential Loop ===
async function mainLoop() {
    await updatePositions();
    await updateSpotBalances();

    // Check if we should stop the program
    const activePositions = sharedState.positions;

    // Stop if max positions reached
    if (activePositions.length >= config.MAX_TOTAL_POSITIONS) {
        log('🛑 Max positions reached, stopping program', 'info');
        process.exit(0);
    }

    // Count hedged positions (STEP1 and FULL count as hedged)
    const hedgedCount = activePositions.filter(pos => pos.hedgeStatus !== 'NONE').length;
    const maxHedgedPositions = Math.floor(config.MAX_TOTAL_POSITIONS);

    if (hedgedCount >= maxHedgedPositions) {
        log(`🛑 Max hedged positions (${hedgedCount}/${maxHedgedPositions}) reached, stopping program`, 'info');
        process.exit(0);
    }

    // Execution and hedging disabled for showcase version
    // await runExecution();
    // await hedgeManager.monitorAndHedge();
}

// === Initialization & Master Cron ===
async function start() {
    log('🚀 Starting system...', 'info');

    // Run the full logic flow once at startup
    await mainLoop();

    // Schedule all-in-one loop for every 3 minutes
    cron.schedule('*/3 * * * *', () => safeRun(mainLoop));

    log('✅ System initialized and running', 'info');
}

start();
