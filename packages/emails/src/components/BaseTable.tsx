type BaseTableProps = Omit<
  React.DetailedHTMLProps<React.TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>,
  "border"
> &
  Partial<Pick<HTMLTableElement, "align" | "border">>;

const BaseTable = ({ children, ...rest }: BaseTableProps) => (
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  <table cellPadding="0" cellSpacing="0" role="presentation" {...rest}>
    {children}
  </table>
);

export default BaseTable;
