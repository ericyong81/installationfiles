const fetch = require('node-fetch');
require('dotenv').config();
const logger = require('../logger');

const EXCHANGE_RATE_URL = `https://${process.env.PLATFORM}.phillipmobile.com/MobileControlService.svc/GetExchangeRateList`;

async function fetchExchangeRates(config) {
  const headers = {
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type': 'application/json',
    'Cookie': `x-session-iv=${config.xSessionIv}`,
    'Priority': 'u=1, i',
    'Sec-CH-UA': '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'X-Requested-With': 'XMLHttpRequest',
  };

  const requestBody = {
    Language: 'EN',
  };

  const maxRetryAttempts = 5;
  let retryCount = 0;
  while (retryCount < maxRetryAttempts) {
    try {
      const response = await fetch(EXCHANGE_RATE_URL, {
        method: 'GET',
        headers: headers,
        signal: AbortSignal.timeout(10000)
      });
      const result= await response.json();
      return result.GetExchangeRateListResult;
    } catch (error) {
      if (error.name === "TimeoutError") {
        logger.warn('10000 ms timeout while getting exchange rates');
      }
      logger.error(`Error fetching exchange rates (attempt ${retryCount + 1}/${maxRetryAttempts}):`, error);
      retryCount++;
    }
  }
  logger.error('Failed to fetch exchange rates after multiple retries.');
  return null;
};

// (async function(){
//   await fetchExchangeRates(require('../config.json'));
// })();
module.exports = { fetchExchangeRates };
