const xirr = require("xirr");
const lodash = require("lodash");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const credentials = require("../config");

const execution = (holdings, trades, reportType) => {
  const totalNumberOfTrades = trades.length;

  const xirrData = trades
    .filter(({ amount }) => !lodash.isUndefined(amount))
    .map(({ type, amount, date, stock }) => {
      return {
        amount: (type === "BUY" ? -1 : 1) * amount,
        when: new Date(date),
        stock,
      };
    });

  const stocksGroupedXIRRData = lodash.groupBy(xirrData, "stock");

  const totalHoldingAmount = holdings.reduce((acc, stock) => {
    acc += stock.currentValue;
    return acc;
  }, 0);

  const stockToTotalAmountMap = holdings.reduce((acc, stock) => {
    acc[stock.stock] = stock.currentValue;
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
          const stockXIRR = (xirr(stocksGroupedXIRRData[stock]) * 100).toFixed(
            2
          );
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

  createCSV({ totalNumberOfTrades, stocksXIRR, overallXIRR, reportType });
};

const createCSV = ({
  totalNumberOfTrades,
  stocksXIRR,
  overallXIRR,
  reportType,
}) => {
  const csvWriter = createCsvWriter({
    path: `./outputs/${
      credentials.username
    }-${getCurrentDate()}-${reportType}-report.csv`,
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

module.exports = { execution };
