// src\hedge\index.js
const { log } = require('../logger');
const { DynamicHedgeStrategy } = require('./strategiesV2');
const SharedState = require('../sharedState');

class HedgeManager {
    constructor(strategy = 'dynamic', sharedState) {
        this.sharedState = sharedState;
        this.strategy = new DynamicHedgeStrategy(sharedState);
    }

    async monitorAndHedge() {
        try {
            // Exit if no positions
            if (!this.sharedState.positions?.length) {
                return;
            }

            // Check if positions data is stale (older than 5 minutes)
            if (Date.now() - this.sharedState.lastUpdated > 5 * 60 * 1000) {
                log('Positions data is stale, skipping hedge monitoring', 'warn');
                return;
            }

            // Log position monitoring status (sanitized for showcase)
            log(`Monitoring ${this.sharedState.positions.length} positions for hedge opportunities`, 'debug');

            // Monitor and hedge positions using our strategy
            await this.strategy.monitorPositions(this.sharedState.positions);

        } catch (err) {
            log(`Hedge monitoring failed: ${err.message}`, 'error');
        }
    }
}

module.exports = { HedgeManager }; 