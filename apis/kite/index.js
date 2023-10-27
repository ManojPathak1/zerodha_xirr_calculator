const axios = require("axios");
const lodash = require("lodash");
const { CSRF_TOKEN_HEADER } = require("../../constants");
const credentials = require("../../config");

const HOLDINGS_ENDPOINT =
  "https://kite.zerodha.com/api/portfolio/holdings/kite";

const getTradeURL = (year, page) =>
  `https://console.zerodha.com/api/reports/tradebook?segment=EQ&from_date=${year}-01-01&to_date=${year}-12-31&page=${page}&sort_by=order_execution_time&sort_desc=false`;

const getHoldings = async () => {
  const response = await axios.get(HOLDINGS_ENDPOINT, {
    headers: {
      Cookie: credentials.cookieHoldings,
      [CSRF_TOKEN_HEADER]: credentials.csrfToken,
    },
  });
  return response.data.data;
};

const getTrades = async (year, page) => {
  const response = await axios.get(getTradeURL(year, page), {
    headers: {
      Cookie: credentials.cookieTrades,
      [CSRF_TOKEN_HEADER]: credentials.csrfToken,
    },
  });
  const { result, pagination } = response.data.data;

  if (lodash.isNull(pagination)) {
    console.log(`Please wait...${Math.floor(Math.random() * 10)}`);
    return getTrades(year, page);
  }

  const { page: currentPage, total_pages } = pagination;

  const isEmpty = result.length === 0;

  console.log(`Fetching for ${year}...`);

  if (total_pages === 0) return result;
  if (currentPage < total_pages && isEmpty) return getTrades(year, page);
  return result;
};

const getAllTrades = async (year = 2017, page = 1) => {
  const trades = await getTrades(year, page);

  const isTradesEmpty = trades.length === 0;

  if (isTradesEmpty && year === new Date().getFullYear()) return trades;

  const nextYear = year + (isTradesEmpty ? 1 : 0);
  const nextPage = isTradesEmpty ? 1 : page + 1;

  const nextTrades = await getAllTrades(nextYear, nextPage);

  return [...trades, ...nextTrades];
};

const getHoldingsAndTrades = async () => {
  try {
    const [holdingsResponse, tradesResponse] = await Promise.all([
      getHoldings(),
      getAllTrades(),
    ]);
    const holdings = holdingsResponse.map(
      ({ tradingsymbol: stock, last_price, opening_quantity }) => ({
        stock,
        currentValue: last_price * opening_quantity,
      })
    );
    const trades = tradesResponse.map(
      ({
        tradingsymbol: stock,
        trade_type: type,
        quantity,
        price,
        trade_date: date,
      }) => {
        return {
          stock,
          type: type.toUpperCase(),
          amount: quantity * price,
          quantity,
          date: new Date(date),
        };
      }
    );
    return { holdings, trades };
  } catch (error) {
    if (error.response.status === 403) {
      console.error(error.response.data.message);
    }
  }
  return { holdings: [], trades: [] };
};

module.exports = { getHoldingsAndTrades };
