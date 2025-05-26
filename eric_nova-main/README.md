**Command For Update**
```bash
curl -o update.sh https://raw.githubusercontent.com/cat903/eric_nova/refs/heads/main/update.sh
chmod +x update.sh
./update.sh

```
**Command For Installation**
```bash
curl -o setup.sh https://raw.githubusercontent.com/cat903/eric_nova/refs/heads/main/setup.sh
chmod +x setup.sh
./setup.sh
```
**Configure Your Environment Variables**
```
USERE=`Your Username`
USERP=`Your Password`
DISCORDWEBHOOK=`Your Discord Webhook Url`
PLATFORM=`Platform`  (onenovaweb || demo)
```
**TradingView Webhook Template**
```JSON
{
  "algoName": "Algo_55+EMA_15min",
  "seriesCode": "F.BMD.FCPO.Q25",
  "symbol": "{{ticker}}",
  "action": "{{strategy.order.action}}",
  "entryPrice": "{{strategy.order.price}}",
  "type": "{{strategy.position_size}}",
  "lotSize": 1
}
```