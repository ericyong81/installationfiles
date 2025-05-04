require('dotenv').config();
const fetch = require('node-fetch');

const url = `https://${process.env.PLATFORM}.phillipmobile.com/MobileControlService.svc/GetOpenPositionList`;

const headers = {
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Content-Type': 'application/json',
  'Priority': 'u=1, i',
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
};


async function getOpenPositionList(config) {
  headers['X-Session-IV'] = config.xSessionIv;
  requestBody.Token = config.token;
  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody),
  });
  const result = (await response.json());
  const openPositions = result.GetOpenPositionListResult;
  return openPositions;
};

(async function () {
  let authURL;
  const openPositions = await getOpenPositionList(require('./config.json'));
  if(openPositions.title === 'Unauthorized'){
    if(process.env.PLATFORM==='demo'){
      authURL = 'https://z34vshibtebtaneovwkqpe5vme0hkexs.lambda-url.eu-north-1.on.aws/'
    }
    else{
      authURL = 'https://7xsskotpbpeuyqmim4f3wl4j4i0qvtuu.lambda-url.eu-north-1.on.aws/'
    }
    const response = await fetch(authURL,{
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user:process.env.USERE,
        pass:process.env.USERP
      })
    });
    const result = await response.json();
    console.log(result);
    require('fs').writeFileSync('config.json',JSON.stringify(result))
  }
})()
