const moment = require('moment-timezone');
const fs = require('fs');
require('dotenv').config();
const CONTROL_FILE = './autoshutoff.control';
const getOpenPosition = require('./getOpenPosition.js');
const marketOrder = require('./marketOrder.js');
const getOrderHistory = require('./getOrderHistory.js');
const calculateProfitLoss = require('./calculateProfitLoss.js');
const sendtoDiscord = require('./sendtoDiscord.js');
const { CLOSING_TIMES, MARKET_TIMEZONE } = require('./marketConfig.js');
const logger = require('../logger');


async function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

async function logAndNotify(message) {
  logger.info(message);
  await sendtoDiscord(message);
}

async function getConfirmedOrderHistoryWithRetry(config, expectedAction, seriesCode, maxRetries = 6, retryDelayMs = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const orderHistory = await getOrderHistory(config);
      if (orderHistory && orderHistory.length > 0) {
        const relevantOrder = orderHistory.find(order => order.SeriesCode === seriesCode && (order.BuySell === (expectedAction === 'buy' ? 1 : 2)) && order.OrderStatusDesc === 'Filled');
        if (relevantOrder) {
          if (orderHistory.length >= 2) {
            return orderHistory;
          }
        }
      }
    } catch (error) {
      await logAndNotify(`Error fetching order history on attempt ${attempt}: ${error.message}`);
    }
    if (attempt < maxRetries) {
      await delay(retryDelayMs);
    }
  }
  return null;
}

async function checkOpenPositions(retryn = 3) {
  const openPositions = await getOpenPosition(require('../config.json'));
  if ((openPositions?.length !== 0 && openPositions?.length !== 1) && retryn > 0) {
    const errorMessage = `${retryn} ${process.env.PLATFORM} server timed out, rejected force exit`;
    await logAndNotify(errorMessage);
    await delay(10000);
    return checkOpenPositions(--retryn);
  }
  return openPositions;
}


async function processExitCompletion(action, symbol, status, openPositions, seriesCode) {
  if (!openPositions?.length) {
    const timestamp = moment().tz("Asia/Kuala_Lumpur").format('YYYY-MM-DD HH:mm:ss');
    const confirmedOrderHistory = await getConfirmedOrderHistoryWithRetry(require('../config.json'), action, seriesCode);
    if (!confirmedOrderHistory) {
      const failureMessage = `${timestamp} ->-> Exit for ${symbol} appears complete (no open positions), but FAILED TO CONFIRM in order history. P/L calculation SKIPPED.`;
      await logAndNotify(failureMessage);
      return true;
    }
    const profitLoss = calculateProfitLoss(confirmedOrderHistory, status);
    const successMessage = `${timestamp} ->-> filled force exit ->-> ${action} ->-> ${symbol}@${profitLoss.top}`;
    await logAndNotify(successMessage);
    const profitLossMessage = `${profitLoss?.result} -> RM ${profitLoss?.amount}`;
    await logAndNotify(profitLossMessage);
    logger.debug('Exit action completed successfully');
    return true;
  } else {
    const failureMessage = `Could not fill force exit order, rejected exit ->-> ${action} ->-> ${symbol}`;
    await logAndNotify(failureMessage);
    logger.debug('Force Exit action failed, market order failed');
    return false;
  }
}

async function executeForceMarketExitAction(openPositions) {
  if (!openPositions) { logger.debug('forceexit:checkifsessioninvalid', openPositions); logger.debug('forceexit:sessionexpired in nova platform') };
  if (openPositions.length === 0) { logger.debug(`forceexit:no open order in ${process.env.PLATFORM} platform`) }
  if (!(openPositions[0]?.OpenQuantity)) { logger.debug('forceexit:nova changed something', openPositions) }; //remove later
  const tradeInfo = openPositions[0]
  const action = (tradeInfo?.OpenQuantity < 0) ? 'buy' : 'sell';
  const status = (tradeInfo?.OpenQuantity < 0) ? 'sell' : 'buy';
  logger.debug(`openStatus:${status},forceExitStatus:${action},positionOpen:${openPositions.length === 1}, proccedingForceExit:${((openPositions.length === 1) && (action !== status))}`);
  if (openPositions.length === 1) {
    await marketOrder(action, require('../config.json'), tradeInfo.SeriesCode);
    await logAndNotify(`Asking For Force Exit ->-> ${action} ->-> ${tradeInfo.SeriesTradeCode}`);
    await delay(15000);

    const refreshedOpenPositions = await checkOpenPositions();
    await processExitCompletion(action, tradeInfo.SeriesTradeCode, status, refreshedOpenPositions, tradeInfo.SeriesCode);
  }
}



const closingTimes = CLOSING_TIMES;

async function checkMarketClosing() {
  const now = moment().tz(MARKET_TIMEZONE);
  const currentDay = now.isoWeekday();

  const marketDay = CLOSING_TIMES.find(day => day.day === currentDay);
  if (!marketDay) return;
  if (!fs.existsSync(CONTROL_FILE)) {
    logger.info('Auto-shutoff DISABLED - skipping market closing check');
    return;
  }

  let shouldExecuteForceExit = false;
  let relevantClosingTimes = [];

  marketDay.times.forEach(closingTime => {
    const closingMoment = moment.tz(`${now.format('YYYY-MM-DD')} ${closingTime}`, MARKET_TIMEZONE);
    const diffMinutes = closingMoment.diff(now, 'minutes');

    if (diffMinutes >= 0 && diffMinutes <= 5) {
      shouldExecuteForceExit = true;
      relevantClosingTimes.push(closingTime);
    }
  });

  if (shouldExecuteForceExit) {
    const openPositions = await checkOpenPositions();

    if (openPositions) {
      relevantClosingTimes.forEach(closingTime => {
        logger.debug(`Market closing soon (${closingTime}), calling close()...`);
        executeForceMarketExitAction(openPositions);
      });
    } else {
      logger.info('Could not fetch open positions, skipping force exit action.');
    }
  }
}


checkMarketClosing();
