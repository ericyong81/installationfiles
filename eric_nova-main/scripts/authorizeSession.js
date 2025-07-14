const fs = require('fs');
const path = require('path');
const http2 = require('http2');
const zlib = require('zlib');
const url = require('url');
const crypto = require('crypto');
const logger = require('../logger');

class E2EECrypto {
    constructor(publicKeyStr, sessionIdStr, randomNumberStr) {
        if (!publicKeyStr || !sessionIdStr || !randomNumberStr) {
            throw new Error("PublicKey, SessionID, and RandomNumber are required");
        }
        const cX = publicKeyStr;
        const eL_is_SessionID = sessionIdStr;
        const cN_is_RandomNumber = randomNumberStr;

        const parts = cX.split(':');
        this.n_modulus = BigInt('0x' + parts[0]);
        this.e_exponent = BigInt('0x' + parts[1]);
        this.dU_internal_SessionID = eL_is_SessionID;
        this.cJ_internal_RandomNumber = cN_is_RandomNumber;
        let bitLength = this.n_modulus.toString(2).length;
        this.keySizeBytes = Math.ceil(bitLength / 8);
        if (this.n_modulus === 0n) this.keySizeBytes = 1;
    }

    _hexToBytes(hexStr) {
        const bytes = new Uint8Array(Math.ceil(hexStr.length / 2));
        for (let i = 0, j = 0; i < hexStr.length; i += 2, j++) {
            bytes[j] = parseInt(hexStr.substring(i, i + 2), 16);
        }
        return bytes;
    }


    _sha1Hash(data) {
        const hash = crypto.createHash('sha1');
        hash.update(data);
        return hash.digest();
    }

    _getRandomBytes(length) {
        return crypto.randomBytes(length);
    }


    _pkcs1PadType2(data, keySizeBytes) {
        const padded = new Uint8Array(keySizeBytes);
        padded[0] = 0x00;
        padded[1] = 0x02;
        const psLength = keySizeBytes - 3 - data.length;
        const ps = this._getRandomBytes(psLength);
        for (let i = 0; i < psLength; i++) {
            while (ps[i] === 0) ps[i] = this._getRandomBytes(1)[0];
            padded[i + 2] = ps[i];
        }
        padded[psLength + 2] = 0x00;
        padded.set(data, psLength + 3);
        let hex = '';
        for (const byte of padded) hex += byte.toString(16).padStart(2, '0');
        return BigInt('0x' + hex);
    }


    _modPow(base, exp, mod) {
        let res = 1n;
        base = base % mod;
        while (exp > 0n) {
            if (exp % 2n === 1n) res = (res * base) % mod;
            exp = exp / 2n;
            base = (base * base) % mod;
        }
        return res;
    }


    encryptPassword(plainTextPassword) {
        const da = 20;
        const textAsBytes = Buffer.from(plainTextPassword, 'utf-8');
        const hashedTextBytes_ed = this._sha1Hash(textAsBytes);
        const randomBytes_bY = this._getRandomBytes(da);
        const component_cJ_bytes_dP = this._hexToBytes(this.cJ_internal_RandomNumber);

        const concatenated_aY = new Uint8Array(component_cJ_bytes_dP.length + hashedTextBytes_ed.length + randomBytes_bY.length);
        concatenated_aY.set(component_cJ_bytes_dP, 0);
        concatenated_aY.set(hashedTextBytes_ed, component_cJ_bytes_dP.length);
        concatenated_aY.set(randomBytes_bY, component_cJ_bytes_dP.length + hashedTextBytes_ed.length);


        const paddedMessageBigInt_m = this._pkcs1PadType2(concatenated_aY, this.keySizeBytes);


        const encryptedBigInt_c = this._modPow(paddedMessageBigInt_m, this.e_exponent, this.n_modulus);


        let hexCiphertext_h = encryptedBigInt_c.toString(16);


        const expectedHexLength = this.keySizeBytes * 2;
        if (hexCiphertext_h.length < expectedHexLength) {
            hexCiphertext_h = '0'.repeat(expectedHexLength - hexCiphertext_h.length) + hexCiphertext_h;
        }

        return hexCiphertext_h;
    }
}


function makeHttp2Request(urlString, method = 'POST', payload = null, customHeaders = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new url.URL(urlString);
        const authority = `${parsedUrl.protocol}//${parsedUrl.host}`;

        const clientSession = http2.connect(authority, {});
        clientSession.on('error', (err) => reject(new Error(`HTTP/2 session error for ${authority}: ${err.message}`)));
        clientSession.on('goaway', (errorCode, lastStreamID) => logger.warn(`HTTP/2 GOAWAY received for ${authority}: code ${errorCode}, lastStreamID ${lastStreamID}`));
        clientSession.on('timeout', () => { clientSession.close(); reject(new Error(`HTTP/2 session timeout for ${authority}`)); });
        clientSession.setTimeout(30000);

        const http2Headers = {
            ':method': method.toUpperCase(),
            ':path': parsedUrl.pathname + parsedUrl.search,
            ':scheme': parsedUrl.protocol.slice(0, -1),
            ':authority': parsedUrl.host,
            'accept': customHeaders.Accept || '*/*',
            'accept-language': customHeaders['Accept-Language'] || 'en-US,en;q=0.9',
            'accept-encoding': 'gzip, deflate, br',
            'user-agent': (typeof global.navigator !== 'undefined' && global.navigator.userAgent) || 'Node.js HTTP/2 Client',
            'sec-ch-ua': customHeaders['Sec-Ch-Ua'] || '"Not.A/Brand";v="99", "Chromium";v="136"',
            'sec-ch-ua-mobile': customHeaders['Sec-Ch-Ua-Mobile'] || '?0',
            'sec-ch-ua-platform': customHeaders['Sec-Ch-Ua-Platform'] || '"Windows"',
            'sec-fetch-dest': customHeaders['Sec-Fetch-Dest'] || 'empty',
            'sec-fetch-mode': customHeaders['Sec-Fetch-Mode'] || 'cors',
            'sec-fetch-site': customHeaders['Sec-Fetch-Site'] || 'same-origin',
            'x-requested-with': customHeaders['X-Requested-With'] || 'XMLHttpRequest',
        };
        if (customHeaders.Origin || (parsedUrl.origin && parsedUrl.origin !== 'null')) {
            http2Headers['origin'] = customHeaders.Origin || parsedUrl.origin;
        }
        if (customHeaders.Priority) {
            http2Headers['priority'] = customHeaders.Priority;
        }

        let dataToSendBuffer = null;
        if (payload) {
            const dataString = JSON.stringify(payload);
            dataToSendBuffer = Buffer.from(dataString, 'utf-8');
            http2Headers['content-type'] = customHeaders['Content-Type'] || 'application/json; charset=UTF-8';
            http2Headers['content-length'] = String(dataToSendBuffer.length);
        } else if (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT') {
            http2Headers['content-length'] = '0';
        }

        const req = clientSession.request(http2Headers);
        req.setTimeout(30000);

        req.on('response', (responseHeaders) => {
            let responseBody = '';
            const contentEncoding = responseHeaders['content-encoding'];
            let responseStream = req;
            if (contentEncoding === 'gzip') responseStream = req.pipe(zlib.createGunzip());
            else if (contentEncoding === 'deflate') responseStream = req.pipe(zlib.createInflate());
            else if (contentEncoding === 'br') responseStream = req.pipe(zlib.createBrotliDecompress());

            responseStream.setEncoding('utf8');
            responseStream.on('data', (chunk) => { responseBody += chunk; });
            responseStream.on('end', () => {
                if (!clientSession.closed) clientSession.close();
                try {
                    resolve({ data: JSON.parse(responseBody), headers: responseHeaders, statusCode: responseHeaders[':status'] });
                } catch (e) {
                    logger.warn(`HTTP/2 response from ${urlString} not JSON. Status: ${responseHeaders[':status']}. Body: ${responseBody.substring(0, 200)}...`);
                    resolve({ data: responseBody, headers: responseHeaders, statusCode: responseHeaders[':status'] });
                }
            });
            responseStream.on('error', (err) => { if (!clientSession.closed) clientSession.close(); reject(new Error(`HTTP/2 response data stream error from ${urlString}: ${err.message}`)); });
        });
        req.on('error', (err) => { if (!clientSession.closed) clientSession.close(); reject(new Error(`HTTP/2 request error to ${urlString}: ${err.message}`)); });
        req.on('timeout', () => { if (!clientSession.closed) clientSession.close(); if (!req.destroyed) req.destroy(); reject(new Error(`HTTP/2 request to ${urlString} timed out.`)); });

        if (dataToSendBuffer) req.write(dataToSendBuffer);
        req.end();
    });
}

// --- Function to call GeneratePresession ---
async function callGeneratePresession(presessionUrl, headers) {
    const response = await makeHttp2Request(presessionUrl, 'POST', {}, headers);
    if (response.statusCode === 200 && response.data && response.data.GeneratePresessionResult) {
        logger.info("GeneratePresession successful.");
        return response.data.GeneratePresessionResult;
    } else {
        throw new Error(`GeneratePresession failed. Status: ${response.statusCode}, Response: ${JSON.stringify(response.data)}`);
    }
}

// --- Function to prepare Login payload ---
function prepareLoginPayloadEmbedded(username, plainTextPassword, presessionResult, pageUrl,MY_TFA_OTP="") {
    const { PublicKey, SessionID, RandomNumber } = presessionResult;

    const e2eeEncryptor = new E2EECrypto(PublicKey, SessionID, RandomNumber);

    const encryptedPasswordHex = e2eeEncryptor.encryptPassword(plainTextPassword);

    return {
        Username: username,
        Password: encryptedPasswordHex,
        RandomKey: RandomNumber,
        TfaOtp: MY_TFA_OTP || "",
        PageUrl: pageUrl
    };
}

// --- Function to call Login service ---
async function callLogin(loginUrl, loginPayload, headers) {
    const response = await makeHttp2Request(loginUrl, 'POST', loginPayload, headers);
    if (response.statusCode === 200 && response.data && response.data.LoginResult) {
        return { success: true, result: response.data.LoginResult, headers: response.headers };
    } else {
        logger.error("Login failed or unexpected response structure.");
        return { success: false, result: response.data, statusCode: response.statusCode, headers: response.headers };
    }
}

// --- Main Execution Async Function ---
async function runFullLoginProcess(username, password, platform) {
    try {
        const MY_USERNAME = username;
        const MY_PLAIN_TEXT_PASSWORD = password;
        const MY_PAGE_URL = "/desktop/index.html";
        const MY_TFA_OTP = "";

        const SERVICE_BASE_URL = `https://${platform}.phillipmobile.com`;
        const PRESESSION_ENDPOINT = `${SERVICE_BASE_URL}/MobileControlService.svc/GeneratePresession`;
        const LOGIN_ENDPOINT = `${SERVICE_BASE_URL}/MobileControlService.svc/Login`;



        if (typeof global.navigator === 'undefined') {
            global.navigator = {
                appName: 'Netscape',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
            };
        }


        const baseHeadersFromUser = {
            'sec-ch-ua-platform': '"Windows"',
            'accept-language': 'en-US,en;q=0.9',
            'sec-ch-ua': '"Not.A/Brand";v="99", "Chromium";v="136"',
            'sec-ch-ua-mobile': '?0',
            'x-requested-with': 'XMLHttpRequest',
            'accept': '*/*',
            'origin': SERVICE_BASE_URL,
            'sec-fetch-site': 'same-origin',
            'sec-fetch-mode': 'cors',
            'sec-fetch-dest': 'empty',
            'accept-encoding': 'gzip, deflate, br',
        };
        const presessionHeaders = { ...baseHeadersFromUser, 'priority': 'u=1, i' };
        const loginHeaders = { ...baseHeadersFromUser, 'priority': 'u=4, i' };

        const presessionResult = await callGeneratePresession(PRESESSION_ENDPOINT, presessionHeaders);
        const loginPayload = prepareLoginPayloadEmbedded(MY_USERNAME, MY_PLAIN_TEXT_PASSWORD, presessionResult, MY_PAGE_URL);
        if (MY_TFA_OTP) loginPayload.TfaOtp = MY_TFA_OTP;
        const loginAttemptResult = await callLogin(LOGIN_ENDPOINT, loginPayload, loginHeaders);
        if (loginAttemptResult.success) {
            if (loginAttemptResult.headers && loginAttemptResult.headers.session_t) {
                const xSessionIv = loginAttemptResult.headers['set-cookie'][0]
                const token = loginAttemptResult.headers.session_t
                logger.debug("Received X-Session-Iv:", xSessionIv)
                logger.debug("Received session_t token:", token);
                return { xSessionIv, token }
            }
        } else {
            console.error("Login call failed or returned unexpected data.");
            logger.error("Status Code:", loginAttemptResult.statusCode);
        }
    } catch (error) {
        logger.error("Message:", error.message);
        if (error.stack) logger.error("Stack:", error.stack);
    }
}

module.exports = runFullLoginProcess