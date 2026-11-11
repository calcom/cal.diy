const FORMULA_PREFIX_REGEX = /^[=+\-@\t\r]/;

export const downloadAsCsv = (data: string | Record<string, unknown>[], filename: string): void => {
  const csvString = typeof data === "string" ? data : objectsToCsv(data);

  const blob = new Blob([csvString], { type: "text/plain" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
};

export const objectsToCsv = (data: Record<string, unknown>[]): string => {
  if (!data.length) return "";

  const headers = Object.keys(data[0]);

  const csvRows = [
    headers.map((header) => sanitizeValue(header)).join(","),
    ...data.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          if (typeof value === "number" && Number.isFinite(value)) return String(value);
          return sanitizeValue(value?.toString() ?? "");
        })
        .join(",")
    ),
  ];

  return csvRows.join("\n");
};

export const sanitizeValue = (value: string): string => {
  if (FORMULA_PREFIX_REGEX.test(value)) {
    value = `'${value}`;
  }

  if (value.includes('"') || value.includes(",") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
};

