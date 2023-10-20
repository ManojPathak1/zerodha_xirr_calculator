const axios = require("axios");
const xirr = require("xirr");
const lodash = require("lodash");
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const credentials = require("./config");
const {
  HOLDINGS_ENDPOINT,
  CSRF_TOKEN_HEADER,
  TradeType,
} = require("./constants");

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

const getTradesFromAPI = async (year, page, retry = 1) => {
  const response = await axios.get(getTradeURL(year, page), {
    headers: {
      Cookie: credentials.cookieTrades,
      [CSRF_TOKEN_HEADER]: credentials.csrfToken,
    },
  });
  const isEmpty = response.data.data.result.length === 0;
  if (retry === 3) return response.data.data.result;
  return isEmpty
    ? getTradesFromAPI(year, page, retry + 1)
    : response.data.data.result;
};

const getAllTrades = async (year = credentials.startYear, page = 1) => {
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

  const csvData = [];

  csvData.push({ stock: "Total Trades", xirr: allTrades.length });

  const data = allTrades.map(
    ({ trade_type, quantity, price, trade_date, tradingsymbol }) => {
      return {
        amount:
          (trade_type === TradeType.BUY ? -1 : 1) *
          (quantity * price).toFixed(2),
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
    if (groupedByStocks[stock]) {
      groupedByStocks[stock].push({ amount: stockAmount, when: new Date() });
      try {
        const stockXIRR = (xirr(groupedByStocks[stock]) * 100).toFixed(2);
        csvData.push({ stock, xirr: `${stockXIRR}%` });
      } catch (err) {
        csvData.push({ stock, xirr: 'NA' });
      }
    }
  });

  data.push({ amount: totalAmount, when: new Date() });
  const result = (xirr(data) * 100).toFixed(2);

  csvData.push({ stock: "Overall XIRR", xirr: `${result}%` });

  createCSV(csvData);
};

const createCSV = (data) => {
  const csvWriter = createCsvWriter({
    path: `${credentials.username}-report.csv`,
    header: [
      { id: 'stock', title: 'Stock Symbol' },
      { id: 'xirr', title: 'XIRR' },
    ],
  });

  csvWriter.writeRecords(data)
  .then(() => {
    console.log('CSV file has been written successfully');
  })
  .catch((error) => {
    console.error('Error writing the CSV file:', error);
  });
};

main();
