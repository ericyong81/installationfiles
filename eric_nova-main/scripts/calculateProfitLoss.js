const calculateProfitLoss = (orders, marketentryStatus, lotSize) => {
    const logger = require('../logger');
    if (orders.length < 2) {
        logger.debug("Not enough orders to calculate profit or loss.");
        return { error: "Not enough orders." };
    }

    const firstOrder = orders[0];
    const secondOrder = orders[1];

    if (firstOrder.SeriesCode !== secondOrder.SeriesCode) {
        logger.debug("Orders are not for the same instrument.");
        return { error: "Orders are not for the same instrument." };
    }

    const top = firstOrder.AveragePrice;
    const bottom = secondOrder.AveragePrice;
    const orderQuantity = parseInt(lotSize) || 0;

    if (((firstOrder.OrderStatusDesc === 'Filled') || (secondOrder.OrderStatusDesc === 'Filled')) && (firstOrder.BuySell !== secondOrder.BuySell)) {
        let profitLoss = null;
        if (marketentryStatus === 'sell') {
            profitLoss = bottom - top;
        } else {
            profitLoss = top - bottom;
        }
        const result = profitLoss >= 0 ? "Profit" : "Loss";
        return {
            result,
            amount: (Math.abs(profitLoss) * 25 * orderQuantity),
            top
        };
    }
};



module.exports = calculateProfitLoss
