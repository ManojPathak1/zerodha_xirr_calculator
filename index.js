const axios = require("axios");
const xirr = require("xirr");
const lodash = require("lodash");
const credentials = require("./config");
const { HOLDINGS_ENDPOINT, CSRF_TOKEN_HEADER, TradeType } = require("./constants");

const fetchHoldings = async () => {
  const response = await axios.get(HOLDINGS_ENDPOINT, {
    headers: {
      Cookie: credentials.cookieHoldings,
      [CSRF_TOKEN_HEADER]: credentials.csrfToken,
    },
  });
  return response.data.data;
};

const getTradeURL = (year, page) =>
  `https://console.zerodha.com/api/reports/tradebook?segment=EQ&from_date=${year}-04-01&to_date=${
    year + 1
  }-03-31&page=${page}&sort_by=order_execution_time&sort_desc=false`;

const getTradesFromAPI = async (year, page) => {
  const response = await axios.get(getTradeURL(year, page), {
    headers: {
      Cookie: credentials.cookieTrades,
      [CSRF_TOKEN_HEADER]: credentials.csrfToken,
    },
  });
  return response.data.data.result;
};

const getAllTrades = async (year = 2021, page = 1) => {
  const trades = await getTradesFromAPI(year, page);

  const isTradesEmpty = trades.length === 0;

  if (page === 1 && isTradesEmpty) return trades;

  const nextYear = year + (isTradesEmpty ? 1 : 0);
  const nextPage = isTradesEmpty ? 1 : page + 1;

  const nextTrades = await getAllTrades(nextYear, nextPage);

  return [...trades, ...nextTrades];
};

const main = async () => {
  const [allTrades, stocks] = await Promise.all([
    getAllTrades(),
    fetchHoldings(),
  ]);

  console.log(`Total Trades,${allTrades.length}\n`);

  const data = allTrades.map(
    ({ trade_type, quantity, price, trade_date, tradingsymbol }) => {
      return {
        amount: (trade_type === TradeType.BUY ? -1 : 1) * (quantity * price).toFixed(2),
        when: new Date(trade_date),
        stock: tradingsymbol,
      };
    }
  );

  const groupedByStocks = lodash.groupBy(data, "stock");

  const totalAmount = stocks.reduce((acc, stock) => {
    acc += stock.last_price * stock.opening_quantity;
    return acc;
  }, 0);

  const stocksToAmountMap = stocks.reduce((acc, stock) => {
    acc[stock.tradingsymbol] = stock.last_price * stock.opening_quantity;
    return acc;
  }, {});

  lodash.forEach(stocksToAmountMap, (stockAmount, stock) => {
    groupedByStocks[stock].push({ amount: stockAmount, when: new Date() });
    console.log(`${stock},${(xirr(groupedByStocks[stock]) * 100).toFixed(2)}%`);
  });

  data.push({ amount: totalAmount, when: new Date() });
  const result = (xirr(data) * 100).toFixed(2);

  console.log(`\nOverall XIRR,${result}%`);
};

main();
