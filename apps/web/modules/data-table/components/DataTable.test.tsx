import type { SeparatorRow } from "@calcom/features/data-table/lib/separator";
import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { DataTable } from "./DataTable";

vi.mock("../hooks/useColumnResizing", () => ({ useColumnResizing: vi.fn() }));

type Person = { name: string; email: string; phone: string };
type RowData = Person | SeparatorRow;

const columns: ColumnDef<RowData>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "phone", header: "Phone" },
];

const data: RowData[] = [
  { type: "separator", label: "Today" },
  { name: "Ada Lovelace", email: "ada@example.com", phone: "+15550100001" },
];

function TestTable() {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const table = useReactTable<RowData>({
    data,
    columns,
    initialState: { columnVisibility: { phone: false } },
    getCoreRowModel: getCoreRowModel(),
  });

  return <DataTable table={table} tableContainerRef={tableContainerRef} paginationMode="standard" />;
}

describe("DataTable separator rows", () => {
  it("renders the separator label in a table cell that spans the visible columns", () => {
    render(<TestTable />);

    const separatorCell = screen.getByRole("cell", { name: "Today" });

    expect(separatorCell.tagName).toBe("TD");
    expect(separatorCell.parentElement?.tagName).toBe("TR");
    expect(separatorCell).toHaveAttribute("colspan", "2");
  });
});
