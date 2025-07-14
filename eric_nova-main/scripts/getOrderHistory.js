const fetch = require('node-fetch');
require('dotenv').config();
const logger = require('../logger');

const url = `https://${process.env.PLATFORM}.phillipmobile.com/MobileControlService.svc/GetOrderHistory`;

async function fetchWithRetry(url, headers, requestBody) {
  const maxRetryAttempts = 10;
  let retryCount = 0;
  while (retryCount < maxRetryAttempts) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(15000)
      });
      const result = (await response.json());
      const orderHistory = result.GetOrderHistoryResult;
      return orderHistory;
    } catch (error) {
      if (error.name === "TimeoutError") {
        logger.warn('15000 ms timeout while getting order history');
      }
      retryCount++;
    }
  }
  return null; // Return null if all retries fail
}

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
};

const requestBody = {
  Language: 'EN',
  SubAccount: null,
  ViewType: 'desktop'
};

async function getOrderHistory(config) {
  requestBody.Token = config.token;
  headers['Cookie'] = config.xSessionIv;
  const response = await fetchWithRetry(url, headers, requestBody);
  return response
};

// (async function(){
//    const orderHistory = await getOrderHistory(require('../config.json'));
//    console.log(orderHistory)
// })();

module.exports = getOrderHistory

