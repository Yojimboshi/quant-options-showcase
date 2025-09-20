require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const config = require(path.join(__dirname, '../src/config'));

async function fetchDualInvestmentProducts(optionType = 'PUT', pageIndex = 1, pageSize = 75) {
    const coinConfig = config.COINS.BTCUSDT;
    const params = {
        product: 'DUAL_INVESTMENT',
        exercisedCoin: optionType === 'PUT' ? coinConfig.put.exercisedCoin : coinConfig.call.exercisedCoin,
        investCoin: optionType === 'PUT' ? coinConfig.put.investCoin : coinConfig.call.investCoin,
        optionType: optionType,
        pageSize: pageSize,
        pageIndex: pageIndex,
        timestamp: Date.now()
    };

    const queryString = new URLSearchParams(params).toString();
    const signature = crypto
        .createHmac('sha256', config.BINANCE_API_SECRET)
        .update(queryString)
        .digest('hex');

    try {
        const response = await axios.get('https://api.binance.com/sapi/v1/dci/product/list', {
            params: { ...params, signature },
            headers: { 'X-MBX-APIKEY': config.BINANCE_API_KEY }
        });

        return {
            products: response.data.list || [],
            total: response.data.total || 0
        };
    } catch (error) {
        console.error(`Error fetching ${optionType}:`, error.response?.data?.msg || error.message);
        return { products: [], total: 0 };
    }
}

// Execute if running directly
if (require.main === module) {
    console.log('Starting product fetch test...');

    // Just fetch first 50 products
    fetchDualInvestmentProducts('PUT', 1, 50)
        .then(result => {
            console.log(`\nTotal available: ${result.total}`);
            console.log('Fetched:', result.products.length);

            // Group products by duration
            const groupedByDuration = result.products.reduce((acc, product) => {
                const duration = product.duration;
                if (!acc[duration]) {
                    acc[duration] = [];
                }
                acc[duration].push(product);
                return acc;
            }, {});

            // Sort durations and print products
            Object.keys(groupedByDuration)
                .map(Number)
                .sort((a, b) => a - b)
                .forEach(duration => {
                    console.log(`\n=== Duration: ${duration} days ===`);
                    // Sort products within each duration by APR
                    groupedByDuration[duration]
                        .sort((a, b) => parseFloat(b.apr) - parseFloat(a.apr))
                        .forEach(p => {
                            console.log(`Strike: ${p.strikePrice}, APR: ${p.apr}%`);
                        });
                });
        })
        .catch(console.error);
}