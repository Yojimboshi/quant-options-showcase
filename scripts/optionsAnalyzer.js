// optionsAnalyzer.js
require('dotenv').config(); // Load .env for API keys
const path = require('path');
const { fetchDualInvestmentProducts, listAllProducts, fetchPositions } = require(path.join(__dirname, '../src/helpers/utils'));
const { log } = require(path.join(__dirname, '../src/logger'));
const config = require(path.join(__dirname, '../src/config'));

// Main test function
async function analyzeOptionsProducts() {
    try {
        console.log("Fetching Options products from Binance...");

        // Fetch available dual investment products
        const products = await fetchDualInvestmentProducts(config);
        if (!products) {
            log('No products fetched, exiting', 'debug');
            return;
        }

        console.log(`Fetched ${products.length} products. Listing now...\n`);

        // console.log("\nRunning Bang for Buck Analysis...");
        // analyzeBangForBuck(products);

        console.log("\nRunning Relative ROI Jump Analysis...");
        analyzeRelativeRoiJump(products);

        console.log("\nDone analyzing products.");
    } catch (err) {
        log(`Analysis failed: ${err.message}`, 'debug');
        console.error("Error:", err);
    }
}

// Calculate break-even and absolute ratio for Options products
function analyzeBangForBuck(products, spotByPair = {}, targetExpiry = null) {
    // Group products by pair (exercisedCoin+investCoin)
    const grouped = {};
    products.forEach(p => {
        let pair = `${p.exercisedCoin}${p.investCoin}`;

        // Normalize all USDT and FDUSD pairs to have the stablecoin as the second part
        if (pair.startsWith('USDT') || pair.startsWith('FDUSD')) {
            const stableCoin = pair.startsWith('USDT') ? 'USDT' : 'FDUSD';
            const coin = pair.substring(stableCoin.length); // Remove stablecoin from start
            pair = `${coin}${stableCoin}`;
        }

        if (!grouped[pair]) grouped[pair] = [];
        grouped[pair].push(p);
    });

    // Calculate spot prices first
    const spotPrices = {};
    Object.entries(grouped).forEach(([pair, arr]) => {
        const filtered = targetExpiry ?
            arr.filter(p => Math.round(p.duration) === targetExpiry) :
            arr;

        if (filtered.length === 0) return;

        let spot = spotByPair[pair];
        if (!spot) {
            const buys = filtered.filter(p => p.optionType === 'PUT');
            const sells = filtered.filter(p => p.optionType !== 'PUT');
            if (buys.length && sells.length) {
                const highestBuyStrike = Math.max(...buys.map(p => +p.strikePrice));
                const lowestSellStrike = Math.min(...sells.map(p => +p.strikePrice));
                spot = (highestBuyStrike + lowestSellStrike) / 2;
            } else if (buys.length) {
                spot = Math.max(...buys.map(p => +p.strikePrice));
            } else if (sells.length) {
                spot = Math.min(...sells.map(p => +p.strikePrice));
            } else {
                spot = filtered[0].strikePrice;
            }
        }
        spotPrices[pair] = spot;
    });

    // Now display results using calculated spot prices
    Object.entries(grouped).forEach(([pair, arr]) => {
        const filtered = targetExpiry ?
            arr.filter(p => Math.round(p.duration) === targetExpiry) :
            arr;

        if (filtered.length === 0) return;

        const spot = spotPrices[pair];

        console.log(`\n=== ${pair}  |  ${targetExpiry ? `Expiry: ${targetExpiry}h` : 'All Expiries'} | Spot: ${spot} ===`);
        console.log('Type | Strike  | ROI %  | Break-even | Buffer %  | Abs. Ratio | Hours');

        filtered
            .sort((a, b) => {
                // First sort by duration
                const durationDiff = a.duration - b.duration;
                if (durationDiff !== 0) return durationDiff;
                // Then by strike price
                return a.strikePrice - b.strikePrice;
            })
            .forEach(prod => {
                const strike = +prod.strikePrice;
                // Calculate duration and ROI exactly as in listAllProducts
                const settleTime = prod.settleDate;
                const now = Date.now();
                const hoursToExpiry = Math.round((settleTime - now) / (1000 * 60 * 60));
                const daysToExpiry = hoursToExpiry / 24;
                const roundedDays = Math.round(daysToExpiry);
                const annualApr = parseFloat(prod.apr) * 100;
                const dailyApr = annualApr / 365;
                const roi = dailyApr * roundedDays;
                const roiDecimal = roi / 100;

                // Calculate break-even price
                const breakEven = prod.optionType === 'PUT'
                    ? strike * (1 - roiDecimal)  // PUT (BUY) - break-even below strike
                    : strike * (1 + roiDecimal); // CALL (SELL) - break-even above strike

                // Calculate buffer percentage from spot
                const buffer = ((breakEven - spot) / spot * 100);

                // Calculate absolute ratio of price gap to ROI
                const absRatio = roi === 0 ? (buffer === 0 ? 'NaN' : 'Infinity') : Math.abs(buffer / roi);

                console.log(
                    `${prod.optionType === 'PUT' ? 'BUY ' : 'SELL'} |` +
                    ` ${strike.toFixed(3).padEnd(7)}|` +
                    ` ${roi.toFixed(2).padEnd(6)}|` +
                    ` ${breakEven.toFixed(5).padEnd(10)}|` +
                    ` ${buffer > 0 ? '+' : ''}${buffer.toFixed(2).padEnd(7)}|` +
                    ` ${typeof absRatio === 'number' ? absRatio.toFixed(2).padEnd(7) : absRatio.padEnd(7)}|` +
                    ` ${hoursToExpiry}h`
                );
            });
    });
}

function analyzeRelativeRoiJump(products, spotByPair = {}, targetExpiry = null) {
    // Group products by pair (exercisedCoin+investCoin)
    const grouped = {};
    products.forEach(p => {
        let pair = `${p.exercisedCoin}${p.investCoin}`;
        if (pair.startsWith('USDT') || pair.startsWith('FDUSD')) {
            const stableCoin = pair.startsWith('USDT') ? 'USDT' : 'FDUSD';
            const coin = pair.substring(stableCoin.length);
            pair = `${coin}${stableCoin}`;
        }
        if (!grouped[pair]) grouped[pair] = [];
        grouped[pair].push(p);
    });

    // Calculate spot prices first (same as before)
    const spotPrices = {};
    Object.entries(grouped).forEach(([pair, arr]) => {
        const filtered = targetExpiry ?
            arr.filter(p => Math.round(p.duration) === targetExpiry) :
            arr;
        if (filtered.length === 0) return;
        let spot = spotByPair[pair];
        if (!spot) {
            const buys = filtered.filter(p => p.optionType === 'PUT');
            const sells = filtered.filter(p => p.optionType !== 'PUT');
            if (buys.length && sells.length) {
                const highestBuyStrike = Math.max(...buys.map(p => +p.strikePrice));
                const lowestSellStrike = Math.min(...sells.map(p => +p.strikePrice));
                spot = (highestBuyStrike + lowestSellStrike) / 2;
            } else if (buys.length) {
                spot = Math.max(...buys.map(p => +p.strikePrice));
            } else if (sells.length) {
                spot = Math.min(...sells.map(p => +p.strikePrice));
            } else {
                spot = filtered[0].strikePrice;
            }
        }
        spotPrices[pair] = spot;
    });

    // Now display results using calculated spot prices
    Object.entries(grouped).forEach(([pair, arr]) => {
        const filtered = targetExpiry ?
            arr.filter(p => Math.round(p.duration) === targetExpiry) :
            arr;
        if (filtered.length === 0) return;
        const spot = spotPrices[pair];

        // Group by optionType for relativeRatio calculation
        const byType = {};
        filtered.forEach(prod => {
            if (!byType[prod.optionType]) byType[prod.optionType] = [];
            byType[prod.optionType].push(prod);
        });

        console.log(`\n=== ${pair}  |  ${targetExpiry ? `Expiry: ${targetExpiry}h` : 'All Expiries'} | Spot: ${spot} ===`);
        console.log('Type | Strike  | ROI %  | Break-even | Buffer %  | Rel. Ratio | Hours');

        Object.entries(byType).forEach(([optionType, prods]) => {
            // Group by expiry hour
            const byHour = {};
            prods.forEach(prod => {
                const settleTime = prod.settleDate;
                const now = Date.now();
                const hoursToExpiry = Math.round((settleTime - now) / (1000 * 60 * 60));
                if (!byHour[hoursToExpiry]) byHour[hoursToExpiry] = [];
                byHour[hoursToExpiry].push(prod);
            });

            // For each expiry hour, sort by strike and calculate relativeRatio
            Object.entries(byHour).sort((a, b) => a[0] - b[0]).forEach(([hoursToExpiry, hourProds]) => {
                // Sort by strike price
                hourProds.sort((a, b) => a.strikePrice - b.strikePrice);

                let prevRoi = null;
                hourProds.forEach(prod => {
                    const strike = +prod.strikePrice;
                    const settleTime = prod.settleDate;
                    const now = Date.now();
                    // hoursToExpiry already calculated above
                    const daysToExpiry = hoursToExpiry / 24;
                    const roundedDays = Math.round(daysToExpiry);
                    const annualApr = parseFloat(prod.apr) * 100;
                    const dailyApr = annualApr / 365;
                    const roi = dailyApr * roundedDays;
                    const roiDecimal = roi / 100;

                    // Calculate break-even price
                    const breakEven = prod.optionType === 'PUT'
                        ? strike * (1 - roiDecimal)
                        : strike * (1 + roiDecimal);

                    // Calculate buffer percentage from spot
                    const buffer = ((breakEven - spot) / spot * 100);

                    // Calculate relative ratio
                    let relativeRatio = '-';
                    if (prevRoi !== null && prevRoi !== 0) {
                        relativeRatio = (roi / prevRoi).toFixed(2);
                    }
                    prevRoi = roi;

                    console.log(
                        `${prod.optionType === 'PUT' ? 'BUY ' : 'SELL'} |` +
                        ` ${strike.toFixed(3).padEnd(7)}|` +
                        ` ${roi.toFixed(2).padEnd(6)}|` +
                        ` ${breakEven.toFixed(5).padEnd(10)}|` +
                        ` ${buffer > 0 ? '+' : ''}${buffer.toFixed(2).padEnd(7)}|` +
                        ` ${relativeRatio.toString().padEnd(9)}|` +
                        ` ${hoursToExpiry}h`
                    );
                });
            });
        });
    });
}

async function testFetchPositionsSorted() {
    console.log('Fetching and analyzing positions...\n');

    try {
        const positions = await fetchPositions(config);
        if (!positions || positions.length === 0) {
            console.log('No positions fetched or an error occurred.');
            return;
        }

        // Sort positions by purchaseEndTime (ascending)
        const sortedPositions = positions.sort((a, b) => (a.purchaseEndTime || 0) - (b.purchaseEndTime || 0));

        console.log('Position Analysis:');
        console.log('ID         | Pair          | Type | Amount       | Strike Price | APR    | ROI    | Hours to Expiry | Status');
        console.log('-----------|---------------|------|--------------|--------------|--------|--------|-----------------|--------');

        sortedPositions.forEach(pos => {
            const currentTime = Date.now();
            const hoursToExpiry = pos.settleDate && !isNaN(pos.settleDate)
                ? Math.round((pos.settleDate - currentTime) / (1000 * 60 * 60))
                : 'N/A';

            const pair = `${pos.exercisedCoin}${pos.investCoin}`;
            const type = pos.optionType === 'PUT' ? 'BUY' : 'SELL';
            const apr = parseFloat(pos.apr) * 100;
            const roi = (apr * pos.duration / 365).toFixed(2);

            console.log(
                `${pos.id.toString().padStart(10)} | ` +
                `${pair.padEnd(13)} | ` +
                `${type.padEnd(4)} | ` +
                `${pos.subscriptionAmount.toString().padEnd(12)} | ` +
                `${pos.strikePrice.toString().padEnd(12)} | ` +
                `${apr.toFixed(2).padEnd(6)}% | ` +
                `${roi.padEnd(6)}% | ` +
                `${hoursToExpiry.toString().padStart(15)} | ` +
                `${pos.purchaseStatus}`
            );
        });

        // Additional summary information
        console.log('\nPosition Summary:');
        console.log(`Total positions: ${sortedPositions.length}`);

        // Calculate total investment
        const totalInvestment = sortedPositions.reduce((sum, pos) => sum + parseFloat(pos.subscriptionAmount), 0);
        console.log(`Total investment: ${totalInvestment.toFixed(2)} USDT`);

        // Group by coin pair
        const pairGroups = sortedPositions.reduce((groups, pos) => {
            const pair = `${pos.exercisedCoin}${pos.investCoin}`;
            if (!groups[pair]) groups[pair] = [];
            groups[pair].push(pos);
            return groups;
        }, {});

        console.log('\nPositions by Pair:');
        Object.entries(pairGroups).forEach(([pair, positions]) => {
            const pairInvestment = positions.reduce((sum, pos) => sum + parseFloat(pos.subscriptionAmount), 0);
            console.log(`${pair}: ${positions.length} positions, Total: ${pairInvestment.toFixed(2)} USDT`);
        });

        // Group by option type
        const typeGroups = sortedPositions.reduce((groups, pos) => {
            const type = pos.optionType === 'PUT' ? 'BUY' : 'SELL';
            if (!groups[type]) groups[type] = [];
            groups[type].push(pos);
            return groups;
        }, {});

        console.log('\nPositions by Type:');
        Object.entries(typeGroups).forEach(([type, positions]) => {
            const typeInvestment = positions.reduce((sum, pos) => sum + parseFloat(pos.subscriptionAmount), 0);
            console.log(`${type}: ${positions.length} positions, Total: ${typeInvestment.toFixed(2)} USDT`);
        });

    } catch (error) {
        console.error(`Error in testFetchPositionsSorted: ${error.message}`);
    }
}

// Run the analysis
analyzeOptionsProducts();

// Test positions
// testFetchPositionsSorted(); 