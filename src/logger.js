// src/logger.js
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../log');
const LOG_FILES = {
    debug: path.join(LOG_DIR, 'debug.log'),
    error: path.join(LOG_DIR, 'error.log'),
    execution: path.join(LOG_DIR, 'execution.log'),
    products: path.join(LOG_DIR, 'products.log'),
    filteredProducts: path.join(LOG_DIR, 'filteredProducts.log'),
    positionhistories: path.join(LOG_DIR, 'positionhistories.log'),
    positions: path.join(LOG_DIR, 'positions.log'),
    hedges: path.join(LOG_DIR, 'hedges.log')
};

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR);
}

// Initialize log files
Object.values(LOG_FILES).forEach(file => {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, '');
    }
});

function log(message, type = 'debug') {
    const timestamp = new Date().toISOString();
    const logFile = LOG_FILES[type] || LOG_FILES.debug;
    const logMessage = `${timestamp} - ${message}\n`;

    try {
        // Use writeFile with 'a' flag for atomic append operation
        fs.writeFileSync(logFile, logMessage, { flag: 'a', encoding: 'utf8' });
        console.log(`[${type.toUpperCase()}] ${message}`);
    } catch (err) {
        console.error(`Failed to write to log file: ${err.message}`);
    }
}

function clearProductsLog() {
    fs.writeFileSync(LOG_FILES.products, '');
}

function clearPositionsLog() {
    fs.writeFileSync(LOG_FILES.positions, '');
}

function clearFilteredProductsLog() {
    fs.writeFileSync(LOG_FILES.filteredProducts, '');
}

module.exports = {
    log,
    clearProductsLog,
    clearPositionsLog,
    clearFilteredProductsLog,
};