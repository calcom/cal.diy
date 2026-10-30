import ServerTrans from "@calcom/lib/components/ServerTrans";
import { WEBAPP_URL } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { BaseEmailHtml, CallToAction } from "../components";

export const SlugReplacementEmail = (
  props: {
    slug: string;
    name: string;
    teamName: string;
    t: TFunction;
  } & Partial<React.ComponentProps<typeof BaseEmailHtml>>
) => {
  const { slug, name, teamName, t } = props;

  return (
    <BaseEmailHtml
      subject={t("email_subject_slug_replacement", { slug: slug })}
      headerType="teamCircle"
      title={t("event_replaced_notice")}>
      <>
        <p style={{ fontWeight: 400, lineHeight: "24px", display: "inline-block" }}>
          <ServerTrans t={t} i18nKey="hi_user_name" values={{ name }} />
        </p>
        <p style={{ display: "inline" }}>,</p>
        <p style={{ fontWeight: 400, lineHeight: "24px" }}>
          <ServerTrans t={t} i18nKey="email_body_slug_replacement_notice" values={{ teamName, slug }} />
        </p>
        <p style={{ fontWeight: 400, lineHeight: "24px" }}>{t("email_body_slug_replacement_info")}</p>
        <table
          role="presentation"
          border={0}
          style={{ verticalAlign: "top", marginTop: "25px" }}
          width="100%">
          <tbody>
            <tr>
              <td align="center">
                <CallToAction
                  label={t("review_event_type")}
                  href={`${WEBAPP_URL}/event-types`}
                  endIconName="white-arrow-right"
                />
              </td>
            </tr>
          </tbody>
        </table>
        <p
          style={{
            borderTop: "solid 1px #E1E1E1",
            fontSize: 1,
            margin: "35px auto",
            width: "100%",
          }}
        />
        <p style={{ fontWeight: 400, lineHeight: "24px" }}>
          <ServerTrans i18nKey="email_body_slug_replacement_suggestion" t={t} />
        </p>
        {/*<p style={{ fontWeight: 400, lineHeight: "24px" }}>
          <>{t("email_body_slug_replacement_suggestion")}</>
        </p>*/}
      </>
    </BaseEmailHtml>
  );
};
