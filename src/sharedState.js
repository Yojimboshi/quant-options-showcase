const fs = require('fs').promises;
const path = require('path');
const { log } = require('./logger');

// Import the hedge status enum
const { HEDGE_STATUS } = require('./hedge/strategiesV2');

class SharedState {
    constructor() {
        this.positions = new Map();
        this.lastUpdated = null;
        this.spotBalances = {};
        this.balancesLastUpdated = null;
        this.hedgeStatuses = new Map(); // Track hedge status for each position
        this.positionsFile = path.join(__dirname, '../log/positions.log');
        this.config = null;
        this.isLocked = false;
        this.lockTimeout = null;
    }

    async loadHedgeStatus() {
        // Load hedge info from the much smaller positions.log
        try {
            const content = await fs.readFile(this.positionsFile, 'utf8');
            const positions = content ? JSON.parse(content) : {};
            this.hedgeStatuses.clear();
            for (const posId in positions) {
                const position = positions[posId];
                // Use hedgeStatus if available, otherwise default to NONE
                this.hedgeStatuses.set(posId, position.hedgeStatus || HEDGE_STATUS.NONE);
            }
        } catch (err) {
            log('No existing position state found', 'debug');
        }
    }

    async updatePosition(position, hedgeStatus = HEDGE_STATUS.NONE) {
        this.hedgeStatuses.set(position.id, hedgeStatus);

        // Update the small, efficient JSON state file
        let positions = {};
        try {
            const content = await fs.readFile(this.positionsFile, 'utf8');
            positions = content ? JSON.parse(content) : {};
        } catch { /* ignore */ }

        positions[position.id] = {
            id: position.id,
            symbol: position.symbol || (position.exercisedCoin + position.investCoin),
            optionType: position.optionType,
            strikePrice: position.strikePrice,
            amount: position.subscriptionAmount || position.amount,
            roi: position.roi,
            timeToSettle: position.hoursToExpiry || position.timeToSettle,
            hedgeStatus: hedgeStatus,
            createdAt: position.createdAt || new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };

        try {
            await fs.writeFile(this.positionsFile, JSON.stringify(positions, null, 2));
        } catch (err) {
            log(`Failed to update positions.log: ${err.message}`, 'error');
        }
    }

    getHedgeStatus(positionId) {
        return this.hedgeStatuses.get(positionId) || HEDGE_STATUS.NONE;
    }

    isFullyHedged(positionId) {
        return this.getHedgeStatus(positionId) === HEDGE_STATUS.FULL;
    }

    isPartiallyHedged(positionId) {
        const status = this.getHedgeStatus(positionId);
        return status === HEDGE_STATUS.STEP1 || status === HEDGE_STATUS.FULL;
    }

    isHedged(positionId) {
        // For any hedge status (STEP1 or FULL)
        return this.isPartiallyHedged(positionId);
    }
}

// Create singleton instance
const sharedStateInstance = new SharedState();

// Export both the class (for F12 tracing) and the singleton instance
// This hybrid approach gives us:
// 1. F12-friendly: SharedState class can be traced back to this file
// 2. Singleton pattern: SharedState.instance is the same instance everywhere
// 3. No reinitialization: Only one instance exists across the entire app
module.exports = SharedState;
module.exports.instance = sharedStateInstance; 
