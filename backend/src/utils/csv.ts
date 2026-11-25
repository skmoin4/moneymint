function escapeCsvValue(value: unknown): string {
  let str = value === null || value === undefined ? "" : String(value);
  // Neutralize formula injection: a cell starting with =, +, -, @, tab, or CR
  // is interpreted as a formula by Excel/Sheets when the CSV is opened.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(",");
  const lines = rows.map((row) => columns.map((col) => escapeCsvValue(row[col])).join(","));
  return [header, ...lines].join("\n");
}
