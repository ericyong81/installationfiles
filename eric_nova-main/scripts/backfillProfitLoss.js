const db = require('../database.js');
const logger = require('../logger');

// Helper to "promisify" db.all, making it compatible with async/await
const dbAllAsync = (sql, params) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Helper to "promisify" db.run
const dbRunAsync = (sql, params) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

/**
 * Calculates profit/loss for trades and logs them to the 'realized_trades' table.
 * This function is idempotent and can be run multiple times.
 * It handles partial fills and both long and short positions using FIFO matching.
 */
async function backfillProfitLoss() {
  logger.info('Starting backfill of profit/loss...');

  // Create the logging table if it doesn't already exist.
  // This makes the script safe and reliable.
  await dbRunAsync(`
    CREATE TABLE IF NOT EXISTS realized_trades (
      tradeId INTEGER PRIMARY KEY AUTOINCREMENT,
      entryOrderId TEXT NOT NULL,
      exitOrderId TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      profitLossAmount REAL NOT NULL,
      profitLossResult TEXT NOT NULL,
      createdAt TIMESTAMP,
      UNIQUE(entryOrderId, exitOrderId)
    )
  `);

  // Select all filled orders, ordered by creation time.
  const allFilledOrders = await dbAllAsync(
    `SELECT * FROM orders 
     WHERE status = ? 
     ORDER BY createdTime ASC`,
    ['Filled']
  );
  
  if (allFilledOrders.length < 2) {
    logger.info('Not enough filled orders to form any trade pairs.');
    return;
  }

  // Group orders by symbol
  const ordersBySymbol = allFilledOrders.reduce((acc, order) => {
    if (!acc[order.symbol]) {
      acc[order.symbol] = [];
    }
    acc[order.symbol].push(order);
    return acc;
  }, {});

  for (const symbol in ordersBySymbol) {
    const ordersForSymbol = ordersBySymbol[symbol];
    const openBuys = []; // FIFO queue for open buy orders
    const openSells = []; // FIFO queue for open sell orders

    for (const currentOrder of ordersForSymbol) {
      // Initialize remaining quantity for the current order
      currentOrder.remainingQuantity = currentOrder.quantity;

      if (currentOrder.side === 'BUY') {
        // Try to match current BUY order with existing open SELL orders
        while (openSells.length > 0 && currentOrder.remainingQuantity > 0) {
          const oldestSell = openSells[0];
          const tradeQuantity = Math.min(currentOrder.remainingQuantity, oldestSell.remainingQuantity);

          const profitLossRaw = oldestSell.price - currentOrder.price; // Sell price - Buy price
          const profitLossAmount = profitLossRaw * 25 * tradeQuantity; // Assuming 25 is contract multiplier
          const profitLossResult = profitLossAmount >= 0 ? "Profit" : "Loss";

          await dbRunAsync(
            `INSERT OR IGNORE INTO realized_trades (entryOrderId, exitOrderId, quantity, profitLossAmount, profitLossResult, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
            [oldestSell.orderId, currentOrder.orderId, tradeQuantity, profitLossAmount, profitLossResult, currentOrder.createdTime]
          );
          logger.debug(`Logged trade for ${symbol}: ${tradeQuantity} units between ${oldestSell.orderId} (SELL) and ${currentOrder.orderId} (BUY). P/L: ${profitLossAmount}`);

          currentOrder.remainingQuantity -= tradeQuantity;
          oldestSell.remainingQuantity -= tradeQuantity;

          if (oldestSell.remainingQuantity <= 0) {
            openSells.shift(); // Remove fully matched SELL order
          }
        }
        if (currentOrder.remainingQuantity > 0) {
          openBuys.push(currentOrder); // Add remaining BUY quantity to open buys
        }
      } else if (currentOrder.side === 'SELL') {
        // Try to match current SELL order with existing open BUY orders
        while (openBuys.length > 0 && currentOrder.remainingQuantity > 0) {
          const oldestBuy = openBuys[0];
          const tradeQuantity = Math.min(currentOrder.remainingQuantity, oldestBuy.remainingQuantity);

          const profitLossRaw = currentOrder.price - oldestBuy.price; // Sell price - Buy price
          const profitLossAmount = profitLossRaw * 25 * tradeQuantity; // Assuming 25 is contract multiplier
          const profitLossResult = profitLossAmount >= 0 ? "Profit" : "Loss";

          await dbRunAsync(
            `INSERT OR IGNORE INTO realized_trades (entryOrderId, exitOrderId, quantity, profitLossAmount, profitLossResult, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
            [oldestBuy.orderId, currentOrder.orderId, tradeQuantity, profitLossAmount, profitLossResult, currentOrder.createdTime]
          );
          logger.debug(`Logged trade for ${symbol}: ${tradeQuantity} units between ${oldestBuy.orderId} (BUY) and ${currentOrder.orderId} (SELL). P/L: ${profitLossAmount}`);

          currentOrder.remainingQuantity -= tradeQuantity;
          oldestBuy.remainingQuantity -= tradeQuantity;

          if (oldestBuy.remainingQuantity <= 0) {
            openBuys.shift(); // Remove fully matched BUY order
          }
        }
        if (currentOrder.remainingQuantity > 0) {
          openSells.push(currentOrder); // Add remaining SELL quantity to open sells
        }
      }
    }
  }

  logger.info('Profit/loss backfill complete.');
}

// Run the function and catch any potential errors.
backfillProfitLoss().catch(err => {
  logger.error("An error occurred during the backfill process:", err);
});
