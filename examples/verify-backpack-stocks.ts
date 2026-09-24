import { BackpackStockClient } from "../src/execution/backpack-stock-client.js";

const client = new BackpackStockClient();

const markets = await client.listStockMarkets();
const securities = await client.listSecurities();

const securityByAsset = new Map(securities.map((security) => [security.asset, security]));

const verified = markets.map((market) => ({
  market,
  security:
    securityByAsset.get(market.baseSymbol ?? "") ??
    securityByAsset.get(market.baseSymbol?.split(".")[0] ?? ""),
}));

console.log(JSON.stringify({
  stockMarketCount: markets.length,
  verifiedStockMarkets: verified.slice(0, 25),
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

console.log(JSON.stringify({
  liveTradingEnabled: process.env.BACKPACK_LIVE_TRADING === "true",
  note: "This example is read-only. It does not submit or accept RFQs.",
}, null, 2));
