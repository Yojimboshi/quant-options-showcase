require('dotenv').config(); // Load .env for API keys
const path = require('path');
const { log } = require(path.join(__dirname, '../src/logger'));
const config = require(path.join(__dirname, '../src/config'));

const activePositions = 0;       // For long-term pressure test
const duplicateCount = 0;         // For short-term pressure test

function testTargetROI() {
    console.log('\nTesting TARGET_ROI (Long-Term) for 1 to 21 days:');
    console.log(`Day | Hours | Base ROI | Adjusted ROI (with ${activePositions} active positions)`);
    console.log('----|-------|----------|----------------------------------------');

    for (let day = 1; day <= 21; day++) {
        const hours = day * 24;
        const baseRoi = config.TARGET_ROI.calculate(day);
        const pressureMultiplier = 1 + (activePositions * 0.017);
        const adjustedRoi = baseRoi * pressureMultiplier;

        console.log(`${day.toString().padStart(3)} | ${hours.toString().padStart(5)} | ${baseRoi.toFixed(4)} | ${adjustedRoi.toFixed(4)}`);
    }
}

function testShortTermROI() {
    console.log('\nTesting SHORT_TERM_ROI (12–36h) with Duplicates:');
    console.log(`Hours | Days | Base ROI | Adjusted ROI (${duplicateCount} Duplicates)`);
    console.log('------|------|----------|-----------------------------');

    for (let hours = 12; hours <= 72; hours++) {
        const exactDays = hours / 24;
        const days = Math.round(exactDays); // Round to nearest day instead of floor
        const baseRoi = config.SHORT_TERM_ROI.calculate(days);
        const pressureMultiplier = 1 + 0.12 * duplicateCount;
        const adjustedRoi = baseRoi * pressureMultiplier;

        console.log(`${hours.toString().padStart(5)} | ${exactDays.toFixed(1).padStart(4)} | ${baseRoi.toFixed(4)} | ${adjustedRoi.toFixed(4)}`);
    }
}

function testHedgeRoi() {
    console.log('\nTesting HEDGE_SAFETY ROI Thresholds:');
    console.log('Days | Min ROI Required | Target ROI | Delta');
    console.log('-----|-----------------|------------|-------');

    for (let day = 1; day <= 21; day++) {
        const minRoi = config.HEDGE_SAFETY.getMinRoiForExpiry(day) * 100;
        const targetRoi = config.TARGET_ROI.calculate(day);
        const delta = (targetRoi - minRoi).toFixed(4);

        console.log(
            `${day.toString().padStart(4)} | ` +
            `${minRoi.toFixed(4).padStart(15)}% | ` +
            `${targetRoi.toFixed(4).padStart(10)}% | ` +
            `${delta.padStart(6)}%`
        );
    }
}

// Run all tests
// testTargetROI();
// testShortTermROI();
// testHedgeRoi();
testMinBuffer();

function testMinBuffer() {
    console.log('\nTesting MIN_BUFFER_V2 Thresholds:');
    console.log('Days | Buffer % | Details');
    console.log('-----|----------|----------');

    for (let day = 1; day <= 21; day++) {
        const buffer = config.MIN_BUFFER_V2.calc(day);
        let details = '';

        if (day <= 2) {
            details = 'Base threshold';
        } else if (buffer >= config.MIN_BUFFER_V2.max) {
            details = 'Max cap reached';
        } else {
            details = `Base + ${(day - 2) * config.MIN_BUFFER_V2.perDay}% added`;
        }

        console.log(
            `${day.toString().padStart(4)} | ` +
            `${buffer.toFixed(2).padStart(8)}% | ` +
            details
        );
    }
}
