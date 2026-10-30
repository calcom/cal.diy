import type { CSSProperties } from "react";
import EmailCommonDivider from "./EmailCommonDivider";
import RawHtml from "./RawHtml";

export const EmailSchedulingBodyDivider = (props: { headStyles?: CSSProperties }) => (
  <EmailCommonDivider headStyles={props.headStyles}>
    <td
      align="center"
      style={{
        fontSize: 0,
        padding: "10px 25px",
        paddingBottom: 15,
        wordBreak: "break-word",
      }}>
      <p
        style={{
          borderTop: "solid 1px #E1E1E1",
          fontSize: 1,
          margin: "0px auto",
          width: "100%",
        }}
      />
      <RawHtml
        html={`<!--[if mso | IE]><table align="center" border="0" cellpadding="0" cellspacing="0" style="border-top:solid 1px #E1E1E1;font-size:1px;margin:0px auto;width:548px;" role="presentation" width="548px" ><tr><td style="height:0;line-height:0;"> &nbsp;</td></tr></table><![endif]-->`}
      />
    </td>
  </EmailCommonDivider>
);

export default EmailSchedulingBodyDivider;
