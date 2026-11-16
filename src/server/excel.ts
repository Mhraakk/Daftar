import ExcelJS from "exceljs";

export interface SheetDef { name: string; columns: { header: string; key: string; width?: number }[]; rows: Record<string, string | number | null | undefined>[] }

/** ساخت فایل Excel راست‌به‌چپ با سربرگ قالب‌بندی‌شده */
export async function buildWorkbook(sheets: SheetDef[], meta: { title: string; subtitle?: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "سامانه دفتر"; wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31), { views: [{ rightToLeft: true, state: "frozen", ySplit: 3 }] });
    ws.addRow([meta.title]); ws.addRow([meta.subtitle ?? ""]);
    ws.mergeCells(1, 1, 1, Math.max(1, s.columns.length)); ws.mergeCells(2, 1, 2, Math.max(1, s.columns.length));
    ws.getRow(1).font = { name: "Vazirmatn", bold: true, size: 13 }; ws.getRow(2).font = { name: "Vazirmatn", size: 10, color: { argb: "FF5B6670" } };
    const head = ws.addRow(s.columns.map((c) => c.header));
    head.eachCell((cell) => {
      cell.font = { name: "Vazirmatn", bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3E78" } };
      cell.alignment = { horizontal: "center", vertical: "middle", readingOrder: "rtl" };
    });
    s.columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width ?? 18; });
    for (const r of s.rows) {
      const row = ws.addRow(s.columns.map((c) => r[c.key] ?? ""));
      row.eachCell((cell) => { cell.font = { name: "Vazirmatn", size: 10 }; cell.alignment = { vertical: "middle", readingOrder: "rtl", wrapText: true }; });
    }
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: Math.max(1, s.columns.length) } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
