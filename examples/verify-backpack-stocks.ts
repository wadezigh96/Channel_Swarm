import { BackpackStockClient } from "../src/execution/backpack-stock-client.js";

const client = new BackpackStockClient();

const markets = await client.listStockMarkets();
console.log(JSON.stringify({
  stockMarketCount: markets.length,
  stockMarkets: markets.slice(0, 25),
}, null, 2));

const securities = await client.listSecurities();
const stockAssets = securities.filter((security) =>
  /AAPL|MSFT|NVDA|TSLA/i.test(security.asset)
);

console.log(JSON.stringify({
  matchingSecurities: stockAssets,
}, null, 2));

for (const market of markets.slice(0, 10)) {
  try {
    const ticker = await client.getTicker(market.symbol, true);
    console.log(JSON.stringify({
      symbol: market.symbol,
      externalTicker: ticker,
    }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      symbol: market.symbol,
      externalTickerError: error instanceof Error ? error.message : String(error),
    }, null, 2));
  }
}
