const fetch = require('node-fetch');
require('dotenv').config();
const logger = require('../logger');

const url = `https://${process.env.PLATFORM}.phillipmobile.com/MobileControlService.svc/PlaceFuturesOrder`;

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
  'Referer': `https://${process.env.PLATFORM}.phillipmobile.com/desktop/order_placement.html?v5&SeriesCode=F.BMD.FCPO.H25&tabID=1`,
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const requestBody = {
  Order: {
    OrderType: 'M',
    InstrumentCode: 'F.BMD.FCPO',
    LimitPrice: 0,
    StopPrice: 0,
    ExpiryType: 'DAY',
    SenderLocation: 'MY',
    OpenOrClose: 'O',
    FreeText04: '',
  },
  SubAccount: null,
  Source: 'S_0',
  PlatformCode: 'D',
};

async function marketOrder(orderType,config,seriesCode,orderQuantity) {
  requestBody.Order.AccountNo = config.token;
  requestBody.Order.SeriesCode = seriesCode;
  requestBody.Order.OrderQuantity = orderQuantity || 1;
  headers['Cookie'] = config.xSessionIv;
  const action = orderType==='buy'? 1 : 2;
  requestBody.Order.BuySell = action;
  try{
    const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody),
  });
  const result = (await response.json());
  return result;
  }catch(e){
    logger.error(e);
  }
};

module.exports = marketOrder
