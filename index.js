const axios = require("axios");
const xirr = require("xirr");
const lodash = require("lodash");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
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
  `https://console.zerodha.com/api/reports/tradebook?segment=EQ&from_date=${year}-01-01&to_date=${year}-12-31&page=${page}&sort_by=order_execution_time&sort_desc=false`;

const getTradesFromAPI = async (year, page) => {
  const response = await axios.get(getTradeURL(year, page), {
    headers: {
      Cookie: credentials.cookieTrades,
      [CSRF_TOKEN_HEADER]: credentials.csrfToken,
    },
  });
  const { result, pagination } = response.data.data;

  if (pagination === null) return getTradesFromAPI(year, page);

  const { page: currentPage, total_pages } = pagination;

  const isEmpty = response.data.data.result.length === 0;

  console.log(`Fetching for ${year}...`);

  if (total_pages === 0) return result;
  if (currentPage < total_pages && isEmpty) return getTradesFromAPI(year, page);
  return result;
};

const getAllTrades = async (year = 2017, page = 1) => {
  const trades = await getTradesFromAPI(year, page);

  const isTradesEmpty = trades.length === 0;

  if (isTradesEmpty && year === new Date().getFullYear()) return trades;

  const nextYear = year + (isTradesEmpty ? 1 : 0);
  const nextPage = isTradesEmpty ? 1 : page + 1;

  const nextTrades = await getAllTrades(nextYear, nextPage);

  return [...trades, ...nextTrades];
};

const main = async () => {
  try {
    const [allTrades, stocks] = await Promise.all([
      getAllTrades(),
      fetchHoldings(),
    ]);

    const totalNumberOfTrades = allTrades.length;
    const xirrData = allTrades.map(
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

    const stocksGroupedXIRRData = lodash.groupBy(xirrData, "stock");

    const totalHoldingAmount = stocks.reduce((acc, stock) => {
      acc += stock.last_price * stock.opening_quantity;
      return acc;
    }, 0);

    const stockToTotalAmountMap = stocks.reduce((acc, stock) => {
      acc[stock.tradingsymbol] = stock.last_price * stock.opening_quantity;
      return acc;
    }, {});

    const stocksXIRR = lodash.reduce(
      stockToTotalAmountMap,
      (acc, totalAmount, stock) => {
        if (stocksGroupedXIRRData[stock]) {
          stocksGroupedXIRRData[stock].push({
            amount: totalAmount,
            when: new Date(),
          });
          try {
            const stockXIRR = (
              xirr(stocksGroupedXIRRData[stock]) * 100
            ).toFixed(2);
            acc.push({ stock, xirr: stockXIRR });
          } catch (err) {
            console.error(err);
            acc.push({ stock, xirr: "NA" });
          }
        }
        return acc;
      },
      []
    );

    stocksXIRR.sort((a, b) => b.xirr - a.xirr);

    xirrData.push({ amount: totalHoldingAmount, when: new Date() });
    const overallXIRR = (xirr(xirrData) * 100).toFixed(2);

    createCSV({ totalNumberOfTrades, stocksXIRR, overallXIRR });
  } catch (error) {
    if (error.response.status === 403) {
      console.error(error.response.data.message);
    }
  }
};

const createCSV = ({ totalNumberOfTrades, stocksXIRR, overallXIRR }) => {
  const csvWriter = createCsvWriter({
    path: `./outputs/${credentials.username}-${getCurrentDate()}-report.csv`,
    header: [
      { id: "stock", title: "Stock Symbol" },
      { id: "xirr", title: "XIRR" },
    ],
  });

  const csvData = [];

  csvData.push({ stock: "Total Trades", xirr: totalNumberOfTrades });
  csvData.push(...stocksXIRR);
  csvData.push({ stock: "Overall XIRR", xirr: overallXIRR });

  csvWriter
    .writeRecords(csvData)
    .then(() => {
      console.log("Report successfully generated!");
    })
    .catch((error) => {
      console.error("Error writing the CSV file:", error);
    });
};

const getCurrentDate = () => {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const currentDate = new Date();

  const day = currentDate.getDate();
  const month = months[currentDate.getMonth()];
  const year = currentDate.getFullYear();

  const formattedDate = `${day} ${month} ${year}`;

  return formattedDate;
};

main();
