import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { mapTradebookRows } from "./map-executions";
import { parseTradebookCsv, parseTradebookXlsx } from "./parse-file";

describe("parseTradebookCsv", () => {
  it("splits headers and rows, skipping empty lines", () => {
    const { headers, rows } = parseTradebookCsv("a,b,c\n1,2,3\n\n4,5,6\n");
    expect(headers).toEqual(["a", "b", "c"]);
    expect(rows).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });
});

describe("parseTradebookXlsx", () => {
  it("round-trips a workbook incl. date cells into mappable rows", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("tradebook");
    sheet.addRow([
      "symbol", "trade_date", "exchange", "segment", "trade_type",
      "quantity", "price", "trade_id", "order_id", "order_execution_time",
    ]);
    sheet.addRow([
      "RELIANCE", new Date(Date.UTC(2025, 6, 3)), "NSE", "EQ", "buy",
      10, 1450.75, "T001", "O001", "2025-07-03T09:15:32",
    ]);
    const buffer = await workbook.xlsx.writeBuffer();

    const { headers, rows } = await parseTradebookXlsx(buffer);
    expect(headers[0]).toBe("symbol");
    expect(rows).toHaveLength(1);

    const result = mapTradebookRows(headers, rows);
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]).toMatchObject({
      symbol: "RELIANCE",
      pricePaise: 145075,
      quantity: 10,
      executedAt: "2025-07-03T03:45:32.000Z",
    });
    expect(result.warnings).toEqual([]);
  });

  it("returns empty for an empty workbook", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("empty");
    const buffer = await workbook.xlsx.writeBuffer();
    const { headers, rows } = await parseTradebookXlsx(buffer);
    expect(headers).toEqual([]);
    expect(rows).toEqual([]);
  });
});
