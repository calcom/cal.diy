export const downloadAsCsv = (data: string | Record<string, any>[], filename: string) => {
  // If data is an array of objects, convert it to CSV string
  const csvString = typeof data === "string" ? data : objectsToCsv(data);

  // Create a Blob from the text data
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8" });

  // Create an Object URL for the Blob
  const url = window.URL.createObjectURL(blob);

  // Create a download link
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;

  // Simulate a click event to trigger the download
  a.click();

  // Release the Object URL to free up memory
  window.URL.revokeObjectURL(url);
};

export const objectsToCsv = (data: Record<string, any>[]): string => {
  if (!data.length) return "";

  // Get headers from the first object
  const headers = Object.keys(data[0]);

  // Create CSV rows
  const csvRows = [
    // Header row
    headers
      .map((header) => sanitizeValue(header))
      .join(","),
    // Data rows
    ...data.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          return sanitizeValue(value?.toString() ?? "");
        })
        .join(",")
    ),
  ];

  return csvRows.join("\n");
};

export const sanitizeValue = (value: string) => {
  // Protect against formula injection (OWASP). Values starting with =, +, -, @
  // are interpreted as formulas by Excel/Sheets. Prefix with a single quote to
  // force text rendering, which is invisible in most spreadsheet apps.
  // This runs before quoting: quoting is a CSV delimiter, not an escape the
  // spreadsheet honours, so a formula that also contains a comma would come
  // back merely quoted and still be evaluated.
  const sanitized = /^[=+\-@]/.test(value) ? `'${value}` : value;

  // handling three cases:
  // 1. quotes - we need to double quotes for CSV
  // 2. commas
  // 3. line breaks (LF, CR, CRLF — per RFC 4180, CR and CRLF are valid record separators)
  if (sanitized.includes('"')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  if (sanitized.includes(",") || sanitized.includes("\n") || sanitized.includes("\r")) {
    return `"${sanitized}"`;
  }
  return sanitized;
};
