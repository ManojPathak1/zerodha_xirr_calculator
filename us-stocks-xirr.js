const apis = require("./apis/indmoney/index");
const { execution } = require("./utils/execution");

const main = async () => {
  const { holdings, trades } = await apis.getHoldingsAndTrades();
  if (holdings.length > 0 && trades.length > 0) execution(holdings, trades, "us-stocks");
};

main();
