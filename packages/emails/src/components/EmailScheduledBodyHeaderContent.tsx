import type { CSSProperties } from "react";
import EmailCommonDivider from "./EmailCommonDivider";

const EmailScheduledBodyHeaderContent = (props: {
  title: string;
  subtitle?: React.ReactNode;
  headStyles?: CSSProperties;
}) => (
  <EmailCommonDivider headStyles={{ padding: 0, ...props.headStyles }} mutipleRows>
    <tr>
      <td
        align="center"
        style={{
          fontSize: 0,
          padding: "10px 25px",
          paddingTop: 24,
          paddingBottom: 0,
          wordBreak: "break-word",
        }}>
        <div
          data-testid="heading"
          style={{
            fontFamily: "Roboto, Helvetica, sans-serif",
            fontSize: 24,
            fontWeight: 700,
            lineHeight: "24px",
            textAlign: "center",
            color: "#111827",
          }}>
          {props.title}
        </div>
      </td>
    </tr>
    {props.subtitle && (
      <tr>
        <td align="center" style={{ fontSize: 0, padding: "10px 25px", wordBreak: "break-word" }}>
          <div
            data-testid="subHeading"
            style={{
              fontFamily: "Roboto, Helvetica, sans-serif",
              fontSize: 16,
              fontWeight: 400,
              lineHeight: "24px",
              textAlign: "center",
              color: "#4B5563",
            }}>
            {props.subtitle}
          </div>
        </td>
      </tr>
    )}
  </EmailCommonDivider>
);

export default EmailScheduledBodyHeaderContent;
