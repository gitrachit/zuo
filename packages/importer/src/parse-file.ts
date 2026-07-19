// File → headers + cell rows. CSV via papaparse, XLSX via exceljs.
// Pure transforms (bytes in, rows out); no filesystem or network access.

import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { Cell } from "./map-executions";

export interface TabularFile {
  headers: string[];
  rows: Cell[][];
}

export function parseTradebookCsv(text: string): TabularFile {
  const result = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  const [headers = [], ...rows] = result.data;
  return { headers, rows };
}

function cellValue(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === "string" || typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if ("result" in value) return cellValue(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text;
  }
  return String(value);
}

export async function parseTradebookXlsx(data: ArrayBuffer | Buffer): Promise<TabularFile> {
  const workbook = new ExcelJS.Workbook();
  // exceljs ships pre-Node-22 Buffer typings; runtime accepts both fine
  await workbook.xlsx.load(data as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const allRows: Cell[][] = [];
  sheet.eachRow((row) => {
    const cells: Cell[] = [];
    // exceljs row.values is 1-based; normalize to 0-based dense array
    for (let col = 1; col <= row.cellCount; col++) {
      cells.push(cellValue(row.getCell(col).value));
    }
    allRows.push(cells);
  });
  const [headerRow = [], ...rows] = allRows;
  return { headers: headerRow.map((h) => (h === null ? "" : String(h))), rows };
}
