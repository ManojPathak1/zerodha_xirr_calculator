const xirr = require("xirr");
const lodash = require("lodash");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const credentials = require("../config");


const execution = (holdings, trades, reportType) => {
  const totalNumberOfTrades = trades.length;

  trades.sort((a, b) => a.date - b.date);

  const data = trades
    .filter(({ amount }) => !lodash.isUndefined(amount))
    .map(({ type, amount, date: when, stock, quantity }) => {
      return {
        amount: (type === "BUY" ? -1 : 1) * amount,
        when,
        stock,
        type,
        quantity,
      };
    });

  let buyTrades = data.filter((trade) => trade.type === "BUY");
  const soldTrades = data.filter((trade) => trade.type === "SELL");
  const buySoldTrades = [];

  soldTrades.forEach((soldTrade) => {
    const indexToDelete = [];
    let soldQuantity = soldTrade.quantity;
    const soldStock = soldTrade.stock;
    for (const [index, buyTrade] of buyTrades.entries()) {
      const buyQuantity = buyTrade.quantity;
      const buyStock = buyTrade.stock;
      if (soldStock != buyStock) continue;
      const net = buyQuantity - soldQuantity;
      if (net <= 0) {
        indexToDelete.push(index);
        if (net === 0) break;
        soldQuantity -= buyQuantity;
      } else {
        buyTrades[index].quantity = net;
        const trade = { ...buyTrade, quantity: soldQuantity };
        buySoldTrades.push(trade);
        break;
      }
    }

    const deletedTrades = buyTrades.filter((_, index) => indexToDelete.includes(index));
    buySoldTrades.push(...deletedTrades);
    buyTrades = buyTrades.filter((_, index) => !indexToDelete.includes(index));
  });

  soldTrades.push(...buySoldTrades);

  const groupedByStock = lodash.groupBy(buyTrades, "stock");
  const soldStocksGroupByStock = lodash.groupBy(soldTrades, "stock");

  const totalHoldingAmount = holdings.reduce((acc, stock) => {
    acc += stock.currentValue;
    return acc;
  }, 0);

  const stockToTotalAmountMap = holdings.reduce((acc, stock) => {
    acc[stock.stock] = stock.currentValue;
    return acc;
  }, {});

  const xirrData = lodash.reduce(
    holdings,
    (acc, holding) => {
      if (groupedByStock[holding.stock])
        acc.push(...groupedByStock[holding.stock]);
      return acc;
    },
    []
  );

  const stocksXIRR = lodash.reduce(
    stockToTotalAmountMap,
    (acc, totalAmount, stock) => {
      if (groupedByStock[stock]) {
        groupedByStock[stock].push({
          amount: totalAmount,
          when: new Date(),
        });
        try {
          const stockXIRR = (xirr(groupedByStock[stock]) * 100).toFixed(2);
          acc.push({ stock, xirr: stockXIRR });
        } catch (err) {
          console.error(`Holdings Stock - Failed to calculate XIRR for ${stock}`);
        }
      }
      return acc;
    },
    []
  );

  const soldStocksXIRR = lodash.reduce(
    soldStocksGroupByStock,
    (acc, trades, stock) => {
      try {
        const stockXIRR = (xirr(trades) * 100).toFixed(2);
        acc.push({ stock, xirr: stockXIRR });
      } catch (err) {
        console.error(`Sold Stocks - Failed to calculate XIRR for ${stock}`);
      }
      return acc;
    },
    []
  );

  stocksXIRR.sort((a, b) => b.xirr - a.xirr);
  soldStocksXIRR.sort((a, b) => b.xirr - a.xirr);

  xirrData.push({ amount: totalHoldingAmount, when: new Date() });
  const overallSoldXIRR = (xirr(soldTrades) * 100).toFixed(2);

  const overallXIRR = (xirr(xirrData) * 100).toFixed(2);

  createCSV({
    totalNumberOfTrades,
    totalNumberOfHoldingsTrades: xirrData.length,
    totalNumberOfSoldTrades: soldTrades.length,
    stocksXIRR,
    overallXIRR,
    soldStocksXIRR,
    overallSoldXIRR,
    reportType,
  });
};

const createCSV = ({
  totalNumberOfTrades,
  totalNumberOfHoldingsTrades,
  totalNumberOfSoldTrades,
  stocksXIRR,
  overallXIRR,
  soldStocksXIRR,
  overallSoldXIRR,
  reportType,
}) => {
  const csvWriter = createCsvWriter({
    path: `./outputs/${reportType}/${
      credentials.username
    }-${getCurrentDate()}.csv`,
    header: [
      { id: "stock", title: "Stock Symbol" },
      { id: "xirr", title: "XIRR" },
    ],
  });

  const csvData = [];

  csvData.push({ stock: "Total Trades", xirr: totalNumberOfTrades });
  csvData.push({
    stock: "Total Holdings Trades",
    xirr: totalNumberOfHoldingsTrades,
  });
  csvData.push(...stocksXIRR);
  csvData.push({ stock: "Holdings XIRR", xirr: overallXIRR });

  csvData.push({ stock: "------------", xirr: "-------------" });

  csvData.push({ stock: "Total Sold Trades", xirr: totalNumberOfSoldTrades });
  csvData.push(...soldStocksXIRR);
  csvData.push({ stock: "Sold XIRR", xirr: overallSoldXIRR });

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
