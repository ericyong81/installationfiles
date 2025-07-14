require('dotenv').config();
const fetch = require('node-fetch');
const authorizeSession = require('./authorizeSession.js');
const { exec } = require('child_process');
const logger = require('../logger');

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
  try {
    const openPositions = await getOpenPositionList(require('../config.json'));
    if(openPositions.title === 'Unauthorized'){
      const result = await authorizeSession(process.env.USERE,process.env.USERP,process.env.PLATFORM)
      logger.debug(result);
      require('fs').writeFileSync('config.json',JSON.stringify(result));

      exec('pm2 reload serve_api --update-env && pm2 reload force_exit --update-env', (error, stdout, stderr) => {
        if (error) {
          logger.error(`Error reloading PM2 processes: ${error.message}`);
          return;
        }
        if (stderr) {
          logger.error(`PM2 reload stderr: ${stderr}`);
          return;
        }
        logger.debug(`PM2 reload stdout: ${stdout}`);
      });
    }
  } catch (error) {
    logger.error('Error in autoupdateToken.js:', error);
  }
})()
