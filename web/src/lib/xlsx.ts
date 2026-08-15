import type { Sheet, Style } from "./export";

const thin = { style: "thin" as const };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb: string) =>
  ({ type: "pattern", pattern: "solid", fgColor: { argb } }) as const;
const centre = { horizontal: "center", vertical: "middle" } as const;
const left = { vertical: "middle" } as const;

const STYLES: Record<Style, object> = {
  header: {
    font: { bold: true },
    alignment: centre,
    border,
    fill: fill("FFD9D9D9"),
  },
  label: { alignment: left, border },
  cell: { alignment: centre, border },
  sub: { font: { bold: true }, alignment: centre, border, fill: fill("FFF2F2F2") },
  subLabel: { font: { bold: true }, alignment: left, border, fill: fill("FFF2F2F2") },
  grand: {
    font: { bold: true },
    alignment: centre,
    border,
    fill: fill("FFBDD7EE"),
  },
  grandLabel: {
    font: { bold: true },
    alignment: left,
    border,
    fill: fill("FFBDD7EE"),
  },
};

export async function sheetToBlob(sheet: Sheet) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Counts");
  ws.columns = sheet.widths.map((width) => ({ width }));

  sheet.rows.forEach((cells, r) => {
    cells.forEach((cell, c) => {
      const target = ws.getCell(r + 1, c + 1);
      target.value = cell.formula
        ? { formula: cell.formula, result: cell.value }
        : cell.value;
      Object.assign(target, { style: STYLES[cell.style] });
    });
  });

  for (const m of sheet.merges)
    ws.mergeCells(m.row + 1, m.from + 1, m.row + 1, m.to + 1);

  ws.views = [
    { state: "frozen", xSplit: sheet.freeze.col, ySplit: sheet.freeze.row },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
