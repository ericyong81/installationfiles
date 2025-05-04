const { parentPort, workerData } = require('worker_threads');
const getOpenPosition = require('./getOpenPosition.js');
const marketOrder = require('./marketOrder.js');
const sendtoDiscord = require('./sendtoDiscord.js');
const moment = require('moment-timezone');
require('dotenv').config();

async function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

async function logAndNotify(message) {
  console.log(message);
  await sendtoDiscord(message);
}

async function checkOpenPositions(action, symbol, entryPrice,retryn=3) {
  const openPositions = await getOpenPosition(require('./config.json'));
  if ((openPositions?.length !== 0 && openPositions?.length !== 1) && retryn > 0) {
    const errorMessage = `${retryn} ${process.env.PLATFORM} server timed out, rejected action ->-> ${action} ->-> ${symbol}@${entryPrice}`;
    await logAndNotify(errorMessage);
    await delay(5000);
    return checkOpenPositions(action, symbol, entryPrice,--retryn);
  }
  return openPositions;
}

async function processEntryCompletion(action, symbol, entryPrice, openPositions) {
  if (openPositions.length === 1) {
    const timestamp = moment().tz("Asia/Kuala_Lumpur").format('YYYY-MM-DD HH:mm:ss');
    const successMessage = `${timestamp} ->-> filled entry ->-> ${action} ->-> ${symbol}@${openPositions[0].AveragePrice}`;
    await logAndNotify(successMessage);

    console.log('Entry filled successfully!');
    return true;
  }
  return false;
}

async function executeMarketEntryAction(data) {
  const allowedtoEnterMarket = canTrade();
  if (allowedtoEnterMarket) {
    const openPositions = await checkOpenPositions(data.action, data.symbol, data.entryPrice);

    if (!openPositions) return 'Entry action failed: could not get open positions';

    if (openPositions.length === 0) {
      await marketOrder(data.action, require('./config.json'), data.seriesCode);
      await logAndNotify(`Asking For Entry ->-> ${data.action} ->-> ${data.symbol}@${data.entryPrice}`);
      await delay(15000);

      const refreshedOpenPositions = await checkOpenPositions(data.action, data.symbol, data.entryPrice);
      if (!refreshedOpenPositions) return 'Entry action failed: could not get refreshed open positions';

      const success = await processEntryCompletion(data.action, data.symbol, data.entryPrice, refreshedOpenPositions);
      return success ? 'Entry attempt completed successfully!' : 'Entry attempt failed: could not fill the order';
    }

    return 'Entry action not required: position already open';
  }
  else{
    await logAndNotify(`Entry Rejected Market Closing Soon ->-> ${data.action} ->-> ${data.symbol}@${data.entryPrice}`);
  }
}

const closingTimes = [
  { day: 1, times: ["12:30", "18:00", "23:30"] }, // Monday
  { day: 2, times: ["12:30", "18:00", "23:30"] }, // Tuesday
  { day: 3, times: ["12:30", "18:00", "23:30"] }, // Wednesday
  { day: 4, times: ["12:30", "18:00", "23:30"] }, // Thursday
  { day: 5, times: ["12:30", "18:00"] },          // Friday (No night market)
];

function canTrade() {
  const now = moment().tz("Asia/Kuala_Lumpur");
  const currentDay = now.isoWeekday();
  const marketDay = closingTimes.find(day => day.day === currentDay);

  if (!marketDay) {
    return false;
  }

  for (const closingTime of marketDay.times) {
    const closingMoment = moment.tz(`${now.format('YYYY-MM-DD')} ${closingTime}`, "Asia/Kuala_Lumpur");
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
