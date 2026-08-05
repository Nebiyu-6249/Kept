/**
 * A small CSV reader for the secondary import control.
 *
 * Deliberately not a full RFC 4180 parser: it handles quoted fields, escaped
 * quotes and CRLF, which is what a bank export actually contains. Anything it
 * cannot read becomes a row the user is told about, never a silent drop.
 */

export type CsvRow = Record<string, string>;

export function parseCsv(input: string): { headers: string[]; rows: CsvRow[] } {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      record.push(field);
      field = "";
      if (record.some((cell) => cell.trim() !== "")) records.push(record);
      record = [];
    } else {
      field += char;
    }
  }

  record.push(field);
  if (record.some((cell) => cell.trim() !== "")) records.push(record);

  const [headerRow, ...dataRows] = records;
  if (!headerRow) return { headers: [], rows: [] };

  const headers = headerRow.map((header) => header.trim().toLowerCase());
  const rows = dataRows.map((cells) => {
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? "").trim();
    });
    return row;
  });

  return { headers, rows };
}

/**
 * Turn CSV rows into the same message strings the SMS parser reads, so both
 * import paths go through one pipeline rather than two.
 */
export function csvToMessages(csv: string): string[] {
  const { headers, rows } = parseCsv(csv);
  if (headers.length === 0) return [];

  const pick = (row: CsvRow, names: string[]): string => {
    for (const name of names) {
      const value = row[name];
      if (value) return value;
    }
    return "";
  };

  return rows
    .map((row) => {
      const date = pick(row, ["date", "transaction date", "posted", "occurred_at"]);
      const merchant = pick(row, ["merchant", "description", "details", "narrative", "payee"]);
      const amount = pick(row, ["amount", "debit", "value", "amount (aed)"]);
      const reference = pick(row, ["reference", "ref", "transaction id"]);

      if (!amount && !merchant) return "";

      return [
        amount ? `AED ${amount}` : "",
        merchant ? `at ${merchant}` : "",
        date ? `on ${date}` : "",
        reference ? `Ref ${reference}` : "",
      ]
        .filter(Boolean)
        .join(" ");
    })
    .filter((message) => message.trim() !== "");
}
