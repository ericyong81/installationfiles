const db = require('../database.js');
const logger = require('../logger');

const dbAllAsync = (sql, params) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};


const dbRunAsync = (sql, params) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};


async function backfillProfitLoss() {
  logger.info('Starting backfill of profit/loss...');

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

 
  const ordersBySymbol = allFilledOrders.reduce((acc, order) => {
    if (!acc[order.symbol]) {
      acc[order.symbol] = [];
    }
    acc[order.symbol].push(order);
    return acc;
  }, {});

  for (const symbol in ordersBySymbol) {
    const ordersForSymbol = ordersBySymbol[symbol];
    const openBuys = [];
    const openSells = []; 

    for (const currentOrder of ordersForSymbol) {
      currentOrder.remainingQuantity = currentOrder.quantity;

      if (currentOrder.side === 'BUY') {
        while (openSells.length > 0 && currentOrder.remainingQuantity > 0) {
          const oldestSell = openSells[0];
          const tradeQuantity = Math.min(currentOrder.remainingQuantity, oldestSell.remainingQuantity);

          const profitLossRaw = oldestSell.price - currentOrder.price;
          const profitLossAmount = profitLossRaw * 25 * tradeQuantity;
          const profitLossResult = profitLossAmount >= 0 ? "Profit" : "Loss";

          await dbRunAsync(
            `INSERT OR IGNORE INTO realized_trades (entryOrderId, exitOrderId, quantity, profitLossAmount, profitLossResult, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
            [oldestSell.orderId, currentOrder.orderId, tradeQuantity, profitLossAmount, profitLossResult, currentOrder.createdTime]
          );
          logger.debug(`Logged trade for ${symbol}: ${tradeQuantity} units between ${oldestSell.orderId} (SELL) and ${currentOrder.orderId} (BUY). P/L: ${profitLossAmount}`);

          currentOrder.remainingQuantity -= tradeQuantity;
          oldestSell.remainingQuantity -= tradeQuantity;

          if (oldestSell.remainingQuantity <= 0) {
            openSells.shift();
          }
        }
        if (currentOrder.remainingQuantity > 0) {
          openBuys.push(currentOrder); 
        }
      } else if (currentOrder.side === 'SELL') {

        while (openBuys.length > 0 && currentOrder.remainingQuantity > 0) {
          const oldestBuy = openBuys[0];
          const tradeQuantity = Math.min(currentOrder.remainingQuantity, oldestBuy.remainingQuantity);

          const profitLossRaw = currentOrder.price - oldestBuy.price; 
          const profitLossAmount = profitLossRaw * 25 * tradeQuantity; 
          const profitLossResult = profitLossAmount >= 0 ? "Profit" : "Loss";

          await dbRunAsync(
            `INSERT OR IGNORE INTO realized_trades (entryOrderId, exitOrderId, quantity, profitLossAmount, profitLossResult, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
            [oldestBuy.orderId, currentOrder.orderId, tradeQuantity, profitLossAmount, profitLossResult, currentOrder.createdTime]
          );
          logger.debug(`Logged trade for ${symbol}: ${tradeQuantity} units between ${oldestBuy.orderId} (BUY) and ${currentOrder.orderId} (SELL). P/L: ${profitLossAmount}`);

          currentOrder.remainingQuantity -= tradeQuantity;
          oldestBuy.remainingQuantity -= tradeQuantity;

          if (oldestBuy.remainingQuantity <= 0) {
            openBuys.shift();
          }
        }
        if (currentOrder.remainingQuantity > 0) {
          openSells.push(currentOrder); 
        }
      }
    }
  }

  logger.info('Profit/loss backfill complete.');
}


backfillProfitLoss().catch(err => {
  logger.error("An error occurred during the backfill process:", err);
});
