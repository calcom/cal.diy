import ServerTrans from "@calcom/lib/components/ServerTrans";
import type { TFunction } from "i18next";
import { BaseEmailHtml, CallToAction } from "../components";

export type OrganizationAdminNoSlotsEmailInput = {
  language: TFunction;
  to: {
    email: string;
  };
  user: string;
  slug: string;
  startTime: string;
  endTime: string;
  editLink: string;
  teamSlug: string;
};

export const OrganizationAdminNoSlotsEmail = (
  props: OrganizationAdminNoSlotsEmailInput & Partial<React.ComponentProps<typeof BaseEmailHtml>>
) => {
  return (
    <BaseEmailHtml subject={`No availability found for ${props.user}`}>
      <p
        style={{
          fontWeight: 600,
          fontSize: "32px",
          lineHeight: "38px",
        }}>
        <>{props.language("org_admin_no_slots|heading", { name: props.user })}</>
      </p>
      <p style={{ fontWeight: 400, fontSize: "16px", lineHeight: "24px" }}>
        <ServerTrans
          t={props.language}
          i18nKey="org_admin_no_slots|content"
          values={{ username: props.user, slug: props.slug }}
        />
      </p>
      <div style={{ marginTop: "3rem", marginBottom: "0.75rem" }}>
        <CallToAction
          label={props.language("org_admin_no_slots|cta")}
          href={props.editLink}
          endIconName="linkIcon"
        />
      </div>
    </BaseEmailHtml>
  );
};
