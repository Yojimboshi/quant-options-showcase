// src\hedge\precisionHandling.js
function countDecimals(value) {
    if (Math.floor(value) === value) return 0;
    return value.toString().split(".")[1]?.length || 0;
}

function adjustPriceToTickSize(price, tickSize) {
    const tickSizeDecimals = countDecimals(tickSize);
    return Number(price).toFixed(tickSizeDecimals);
}

function adjustQuantityToLotSize(quantity, stepSize) {
    const stepSizeDecimals = countDecimals(stepSize);
    const factor = Math.pow(10, stepSizeDecimals);
    const floored = Math.floor(quantity * factor) / factor;
    return floored.toFixed(stepSizeDecimals);
}

module.exports = {
    adjustPriceToTickSize,
    adjustQuantityToLotSize,
    countDecimals
}; 