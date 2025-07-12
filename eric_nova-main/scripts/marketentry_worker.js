const { parentPort, workerData } = require('worker_threads');
const getOpenPosition = require('./getOpenPosition.js');
const marketOrder = require('./marketOrder.js');
const sendtoDiscord = require('./sendtoDiscord.js');
const moment = require('moment-timezone');
const { CLOSING_TIMES, MARKET_TIMEZONE } = require('./marketConfig.js');
require('dotenv').config();
const logger = require('../logger');

async function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

async function logAndNotify(message) {
  logger.info(message);
  await sendtoDiscord(message);
}

async function checkOpenPositions(action, symbol, entryPrice, retryn = 3, algoName) {
  const openPositions = await getOpenPosition(require('../config.json'));
  if ((openPositions?.length !== 0 && openPositions?.length !== 1) && retryn > 0) {
    const errorMessage = `${retryn} ${process.env.PLATFORM} server timed out, rejected action ->-> ${algoName} ->-> ${action} ->-> ${symbol}@${entryPrice}`;
    await logAndNotify(errorMessage);
    await delay(5000);
    return checkOpenPositions(action, symbol, entryPrice, --retryn, algoName);
  }
  return openPositions;
}

async function processEntryCompletion(action, symbol, entryPrice, openPositions, algoName) {
  if (openPositions.length === 1) {
    const timestamp = moment().tz("Asia/Kuala_Lumpur").format('YYYY-MM-DD HH:mm:ss');
    const successMessage = `${timestamp} ->-> ${algoName} ->-> filled entry ->-> ${action} ->-> ${symbol}@${openPositions[0].AveragePrice}`;
    await logAndNotify(successMessage);
    logger.debug('Entry filled successfully!');
    return true;
  }
  return false;
}

async function executeMarketEntryAction(data) {
  sendtoDiscord(`Asking For Entry ->-> ${data?.algoName} ->-> ${data.action} ->-> ${data.symbol}@${data.entryPrice} --> LotSize ${data.lotSize}`);
  const allowedtoEnterMarket = canTrade();
  if (allowedtoEnterMarket) {
    const openPositions = await checkOpenPositions(data.action, data.symbol, data.entryPrice, undefined, data?.algoName);

    if (!openPositions) return 'Entry action failed: could not get open positions';

    if (openPositions.length === 0) {
      await marketOrder(data.action, require('../config.json'), data.seriesCode, data.lotSize);
      let refreshedOpenPositions = null;
      for (let i = 0; i < 5; i++) {
        refreshedOpenPositions = await checkOpenPositions(data.action, data.symbol, data.entryPrice, 0, data?.algoName);
        if (refreshedOpenPositions && refreshedOpenPositions.length > 0) {
          break;
        }
        await delay(3000);
      }
      if (!refreshedOpenPositions) return 'Entry action failed: could not get refreshed open positions';
      const success = await processEntryCompletion(data.action, data.symbol, data.entryPrice, refreshedOpenPositions, data?.algoName);
      return success ? 'Entry attempt completed successfully!' : 'Entry attempt failed: could not fill the order';
    }

    return 'Entry action not required: position already open';
  }
  else {
    await logAndNotify(`Entry Rejected Market Closing Soon ->-> ${data?.algoName} ->-> ${data.action} ->-> ${data.symbol}@${data.entryPrice}`);
  }
}

function canTrade() {
  const now = moment().tz(MARKET_TIMEZONE);
  const currentDay = now.isoWeekday();
  const marketDay = CLOSING_TIMES.find(day => day.day === currentDay);

  if (!marketDay) {
    return false;
  }

  for (const closingTime of marketDay.times) {
    const closingMoment = moment.tz(`${now.format('YYYY-MM-DD')} ${closingTime}`, MARKET_TIMEZONE);
    const diffMinutes = closingMoment.diff(now, 'minutes');
    if (diffMinutes >= 0 && diffMinutes <= 6) {
      return false;
    }
  }
  return true;
}

executeMarketEntryAction(workerData)
  .then((result) => parentPort.postMessage(result))
  .catch((error) => {
    parentPort.postMessage(`Error in entry action: ${error.message}`);
    process.exit(1);
  });
