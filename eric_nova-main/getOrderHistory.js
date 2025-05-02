const fetch = require('node-fetch');
const fetch = require('node-fetch');

const url = `https://${process.env.PLATFORM}.phillipmobile.com/MobileControlService.svc/GetOrderHistory`;


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
  headers['X-Session-IV'] = config.xSessionIv;
  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody),
  });
  const result = (await response.json());
  const orderHistory = result.GetOrderHistoryResult;
  return orderHistory
};

// (async function(){
//    const orderHistory = await getOrderHistory();
//    console.log(orderHistory)
// })();

module.exports = getOrderHistory