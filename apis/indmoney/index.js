const axios = require("axios");
const credentials = require("../../config");

const PAGE_LIMIT = 30;

const HOLDINGS_ENDPOINT = `https://apixt-fz.indmoney.com/us-stocks-ext/api/v1/stocks/dw/user/account/holdings/?page=1&limit=${PAGE_LIMIT}`;
const TRADES_ENDPOINT = `https://apixt-fz.indmoney.com/us-stocks-ext/api/v3/getTransactionsPageWidget/?identifier=CT&page=1&limit=1000`;

const getHoldings = async () => {
  const response = await axios.get(HOLDINGS_ENDPOINT, {
    headers: {
      platform: "web",
      Authorization: `Bearer ${credentials.authtoken}`,
    },
  });
  return response.data.data;
};

const getTrades = async () => {
  const response = await axios.get(TRADES_ENDPOINT, {
    headers: {
      platform: "web",
      Authorization: `Bearer ${credentials.authtoken}`,
    },
  });
  return response.data.data.widget_properties.list;
};

const getHoldingsAndTrades = async () => {
  const [holdingsResponse, tradesResponse] = await Promise.all([
    getHoldings(),
    getTrades(),
  ]);
  const holdings = holdingsResponse.map(
    ({ ticker: stock, current_value: currentValue }) => ({
      stock,
      currentValue,
    })
  );
  const trades = tradesResponse.map(
    ({ stockId: stock, type, amount, sectionStart: { subtitle: date } }) => ({
      stock,
      type: type.toUpperCase(),
      amount,
      date,
    })
  );
  return { holdings, trades };
};

module.exports = { getHoldingsAndTrades };
