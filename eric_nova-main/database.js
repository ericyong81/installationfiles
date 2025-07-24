
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./orders.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderId TEXT UNIQUE,
    clientOrderId TEXT,
    symbol TEXT,
    side TEXT,
    orderType TEXT,
    quantity REAL,
    price REAL,
    stopPrice REAL,
    timeInForce TEXT,
    status TEXT,
    icebergQuantity REAL,
    time TEXT,
    updateTime TEXT,
    isWorking BOOLEAN,
    accountId TEXT,
    lastExecutedQuantity REAL,
    lastExecutedPrice REAL,
    averageFillPrice REAL,
    commission REAL,
    commissionAsset TEXT,
    net REAL,
    netAsset TEXT,
    rebate REAL,
    rebateAsset TEXT,
    realizedPnl REAL,
    unrealizedPnl REAL,
    pnlAsset TEXT,
    goodTillDate INTEGER,
    source TEXT,
    triggerPrice REAL,
    stopLossPrice REAL,
    takeProfitPrice REAL,
    workingType TEXT,
    closePosition BOOLEAN,
    trailingStopPercent REAL,
    trailingStopActivationPrice REAL,
    reduceOnly BOOLEAN,
    positionSide TEXT,
    activatePrice REAL,
    priceRate REAL,
    selfTradePreventionMode TEXT,
    lastQuoteAssetTransacted REAL,
    createdTime TEXT,
    tradeId TEXT,
    profitLossAmount REAL,
    profitLossResult TEXT
  )`);
});

module.exports = db;
