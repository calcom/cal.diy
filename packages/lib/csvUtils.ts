export const downloadAsCsv = (data: string | Record<string, unknown>[], filename: string): void => {
  // If data is an array of objects, convert it to CSV string
  let csvString: string;
  if (typeof data === "string") {
    csvString = data;
  } else {
    csvString = objectsToCsv(data);
  }

  // Create a Blob from the text data
  const blob = new Blob([csvString], { type: "text/plain" });

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

export const objectsToCsv = (data: Record<string, unknown>[]): string => {
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

export const sanitizeValue = (value: string): string => {
  // Neutralize formula injection (OWASP CSV injection prevention)
  // Prefix with single quote to prevent formula evaluation
  // Characters that can start formulas: = + - @ \t \r
  if (/^[=+\-@\t\r]/.test(value)) {
    value = `'${value}`;
  }

  // Check for characters that require quoting per RFC 4180
  // \r and \r\n are record separators in RFC 4180
  const needsQuoting =
    value.includes('"') || value.includes(",") || value.includes("\n") || value.includes("\r");

  if (needsQuoting) {
    // Escape quotes by doubling them
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  return value;
};
