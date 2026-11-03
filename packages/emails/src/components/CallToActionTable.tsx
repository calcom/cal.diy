import BaseTable from "./BaseTable";

export const CallToActionTable = (props: { children: React.ReactNode }) => (
  <BaseTable border="0" style={{ verticalAlign: "top" }} width="100%">
    <tbody>
      <tr>
        <td
          align="center"
          role="presentation"
          style={{
            border: "none",
            borderRadius: "3px",
            cursor: "auto",
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            msoPaddingAlt: "10px 25px",
          }}
          valign="middle">
          {props.children}
        </td>
      </tr>
    </tbody>
  </BaseTable>
);
