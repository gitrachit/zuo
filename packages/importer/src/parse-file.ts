// File → headers + cell rows. CSV via papaparse, XLSX via exceljs.
// Pure transforms (bytes in, rows out); no filesystem or network access.

import ExcelJS from "exceljs";
import Papa from "papaparse";
import { mapHeaders, normalizeHeader } from "./headers";
import type { Cell } from "./map-executions";

export interface TabularFile {
  headers: string[];
  rows: Cell[][];
}

const HEADER_SCAN_LIMIT = 30;

// Console XLSX exports carry ~14 preamble rows (client id, title, blanks)
// before the real header; CSVs may grow the same someday. Find the first row
// that maps to all required fields and treat everything after it as data.
function detectTable(allRows: Cell[][]): TabularFile {
  for (let i = 0; i < Math.min(allRows.length, HEADER_SCAN_LIMIT); i++) {
    const candidate = (allRows[i] ?? []).map((c) => (c === null || c === undefined ? "" : String(c)));
    if (mapHeaders(candidate).missingRequired.length === 0) {
      const rows = allRows.slice(i + 1);
      // Console XLSX quirk: F&O exports write an expiry data column but omit
      // its header cell. When data rows are exactly one column wider than the
      // header row and the last header is the execution time, that trailing
      // column is the expiry date.
      const dataWidth = rows.slice(0, 50).reduce((w, r) => Math.max(w, r.length), 0);
      const lastHeader = normalizeHeader(candidate[candidate.length - 1] ?? "");
      if (dataWidth === candidate.length + 1 && lastHeader === "order_execution_time") {
        candidate.push("expiry_date");
      }
      return { headers: candidate, rows };
    }
  }
  const [headers = [], ...rows] = allRows;
  return { headers: headers.map((c) => (c === null || c === undefined ? "" : String(c))), rows };
}

export function parseTradebookCsv(text: string): TabularFile {
  const result = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  return detectTable(result.data);
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
  return detectTable(allRows);
}
