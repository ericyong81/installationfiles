const fetch = require('node-fetch');
require('dotenv').config();
const logger = require('../logger');

const url = `https://${process.env.PLATFORM}.phillipmobile.com/MobileControlService.svc/PlaceFuturesOrder`;

const baseHeaders = {
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
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function buildRequestBody(config, seriesCode, orderQuantity, buySell) {
  return {
    Order: {
      AccountNo: config.token,
      OrderType: 'M',
      BuySell: buySell,            // 1 = Buy, 2 = Sell
      InstrumentCode: 'F.BMD.FCPO',
      SeriesCode: seriesCode,
      OrderQuantity: orderQuantity || 1,
      LimitPrice: 0,
      StopPrice: 0,
      ExpiryType: 'DAY',
      SenderLocation: 'MY',
      OpenOrClose: 'O',
      FreeText04: '',
    },
    SubAccount: null,
    Source: 'S_0',
    PlatformCode: 'M',
  };
}

async function marketOrder(orderType, config, seriesCode, orderQuantity) {
  const buySell = orderType === 'buy' ? 1 : 2;

  const requestBody = buildRequestBody(
    config,
    seriesCode,
    orderQuantity,
    buySell
  );

  const headers = {
    ...baseHeaders,
    Cookie: config.xSessionIv,
    Referer: `https://${process.env.PLATFORM}.phillipmobile.com/desktop/order_placement.html?v5&SeriesCode=${seriesCode}&tabID=1`,
  };

  try {
    logger.debug('[ORDER] Sending order payload to Nova:', requestBody);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();
    logger.debug('[ORDER] Nova response:', result);

    return result;
  } catch (e) {
    logger.error('[ORDER] Error placing order:', e);
    throw e;
  }
}

module.exports = marketOrder;
