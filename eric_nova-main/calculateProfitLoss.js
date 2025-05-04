const calculateProfitLoss = (orders,marketentryStatus) => {
    if (orders.length < 2) {
        console.log("Not enough orders to calculate profit or loss.");
        return { error: "Not enough orders." };
    }

    const firstOrder = orders[0];
    const secondOrder = orders[1];
    const top = firstOrder.AveragePrice;
    const bottom = secondOrder.AveragePrice;
    // Ensure first order is SELL and second order is BUY
    if (((firstOrder.OrderStatusDesc === 'Filled') || (secondOrder.OrderStatusDesc === 'Filled')) && (firstOrder.BuySell !== secondOrder.BuySell)) {
        let profitLoss = null;
        if(marketentryStatus==='sell'){
           profitLoss = bottom - top;
        }else{
           profitLoss = top - bottom;
        }
        const result = profitLoss >= 0 ? "Profit" : "Loss";
        return {
            result,
            amount: (Math.abs(profitLoss)*25),
            top
        };
    }
};



module.exports = calculateProfitLoss
