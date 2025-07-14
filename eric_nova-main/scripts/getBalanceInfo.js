const fetch = require('node-fetch');
require('dotenv').config();
const logger = require('../logger');
const WebSocket = require('ws');
const getOpenPositionList = require('./getOpenPosition.js');
const { fetchExchangeRates } = require('./getExchangeRates.js');


const CLIENT_FUNDS_URL = `https://${process.env.PLATFORM}.phillipmobile.com/MobileControlService.svc/GetClientFund`;

async function fetchClientFundsData(config) {
  const headers = {
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type': 'application/json',
    Priority: 'u=1, i',
    'Sec-CH-UA': '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': `https://${process.env.PLATFORM}.phillipmobile.com/desktop/order_history_trade.html?v5`,
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cookie': config.xSessionIv,
  };

  const requestBody = {
    Language: 'EN',
    SubAccount: null,
    Token: config.token,
  };

  const maxRetryAttempts = 10;
  let retryCount = 0;
  while (retryCount < maxRetryAttempts) {
    try {
      const response = await fetch(CLIENT_FUNDS_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(15000)
      });
      const result = (await response.json());
      return result.GetClientFundResult;
    } catch (error) {
      if (error.name === "TimeoutError") {
        logger.warn('15000 ms timeout while getting client funds');
      }
      retryCount++;
    }
  }
  return null; 
}


const CONTRACT_MULTIPLIERS = {
  'F.BMD.FCPO': 25,
};

function getRealTimePrices(topics) {
  return new Promise((resolve, reject) => {
    const wsUrl = 'wss://onenovapmpfut.phillipmobile.com/';
    const ws = new WebSocket(wsUrl);
    const prices = new Map();
    let messageBuffer = '';

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket timeout: Failed to get a price update in 20 seconds.'));
    }, 20000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 'login', name: 'test', pwd: '' }));
    });

    ws.on('error', (err) => {
      reject(err);
    });

    ws.on('message', (data) => {
      messageBuffer += data.toString();

      while (messageBuffer.includes('</script>')) {
        const endIndex = messageBuffer.indexOf('</script>') + 9;
        const completeMessage = messageBuffer.substring(0, endIndex);
        messageBuffer = messageBuffer.substring(endIndex);

        if (completeMessage.includes('l({"id":"login"')) {
          const jsonPart = completeMessage.match(/l\((.*?)\)/)[1];
          const loginResponse = JSON.parse(jsonPart);
          const { sid, cid } = loginResponse;

          const subscriptions = topics.map(topic => ({
            tpc: topic,
            param: { "fids": ["5"] },
            enable: true,
          }));
          ws.send(JSON.stringify({ id: 'data', name: 'test', sid, cid, sub: subscriptions }));
        }
        else if (completeMessage.includes('"id":"data"')) {
          try {
            const jsonPart = completeMessage.match(/\((.*)\)/)[1];
            const update = JSON.parse(jsonPart);

            if (update.val && update.val[0]?.item) {
              for (const val of update.val) {
                const topic = val.tpc;
                const lastPrice = val.item[0]?.val["5"];
                if (topic && lastPrice) {
                  prices.set(topic, parseFloat(lastPrice));
                }
              }
            }

            if (prices.size === topics.length) {
              clearTimeout(timeout);
              ws.close();
              resolve(prices);
            }
          } catch (e) {

          }
        }
      }
    });
  });
}

async function calculateUnrealizedPnL(config) {
  console.log('Fetching open positions...');
  const openPositions = await getOpenPositionList(config);

  if (!openPositions || openPositions.length === 0) {
    console.log('No open positions found.');
    return [];
  }
  console.log(`Found ${openPositions.length} open position(s).`);

  const topicsToFetch = openPositions.map(pos => {
    const topicInfo = JSON.parse(pos.Topic);
    return topicInfo.Price ? topicInfo.Price[0] : null;
  }).filter(Boolean);

  if (topicsToFetch.length === 0) {
    console.log('No valid price topics found for the open positions.');
    return [];
  }

  console.log('Fetching real-time prices based on Last Price (field "5")...');
  const currentPrices = await getRealTimePrices(topicsToFetch);
  console.log('Successfully fetched prices.');

  const results = openPositions.map(pos => {
    const topicInfo = JSON.parse(pos.Topic);
    const priceTopic = topicInfo.Price ? topicInfo.Price[0] : null;

    const entryPrice = pos.AveragePrice;
    const quantity = pos.OpenQuantity;
    const instrument = pos.InstrumentCode;
    const currentPrice = currentPrices.get(priceTopic);
    const multiplier = CONTRACT_MULTIPLIERS[instrument] || 1;

    let unrealizedPnL = 'N/A';
    if (typeof currentPrice === 'number') {
      unrealizedPnL = (currentPrice - entryPrice) * quantity * multiplier;
    }

    return {
      instrument: pos.SeriesCode,
      quantity,
      entryPrice,
      currentPrice: currentPrice || 'N/A',
      unrealizedPnL,
    };
  });

  return results;
}


async function getBalanceInfo(config) {
  const clientFunds = await fetchClientFundsData(config);
  console.log(clientFunds)
  const unrealizedPnLReport = await calculateUnrealizedPnL(config);
  const totalUnrealizedPnL = unrealizedPnLReport.reduce((acc, curr) => acc + curr.unrealizedPnL, 0);

  if (clientFunds) {
    clientFunds.AccountUPL = totalUnrealizedPnL;
    clientFunds.AccountEquity = clientFunds.LedgerBalanceMYR + totalUnrealizedPnL;

    const exchangeRates = await fetchExchangeRates(config);
    const usdToMyrRate = exchangeRates.find(rate => rate.BaseCurrencyCode === 'MYR' && rate.SettleCurrencyCode === 'USD');
    if (exchangeRates) {
      if (usdToMyrRate) {
        clientFunds.LedgerBalanceMYR = clientFunds.LedgerBalance / usdToMyrRate.ConversionRate;
      } else {
        logger.warn('USD to MYR exchange rate not found. Defaulting LedgerBalanceMYR to LedgerBalance (USD).');
        clientFunds.LedgerBalanceMYR = clientFunds.LedgerBalance; 
      }
    } else {
      logger.warn('Failed to fetch exchange rates. Defaulting LedgerBalanceMYR to LedgerBalance (USD).');
      clientFunds.LedgerBalanceMYR = clientFunds.LedgerBalance;
    }


    if (clientFunds.Margin) {
      if (exchangeRates && usdToMyrRate) {
        clientFunds.Margin = clientFunds.Margin / usdToMyrRate.ConversionRate;
      } else {
        logger.warn('Failed to fetch exchange rates or USD to MYR rate not found. Defaulting InitialMarginMYR to InitialMargin (USD).');
        clientFunds.Margin = clientFunds.Margin; 
      }
    }

 
    clientFunds.AccountEquity = clientFunds.LedgerBalanceMYR + totalUnrealizedPnL;
    clientFunds.AvailableMargin = clientFunds.AccountEquity - clientFunds.Margin;
  }

  return {
    clientFunds: clientFunds,
    unrealizedPnLReport: unrealizedPnLReport,
  };
}

module.exports = { getBalanceInfo };
