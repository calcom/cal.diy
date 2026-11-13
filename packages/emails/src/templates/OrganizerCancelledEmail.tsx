import { SchedulingType } from "@calcom/prisma/enums";
import { OrganizerScheduledEmail } from "./OrganizerScheduledEmail";

export const OrganizerCancelledEmail = (props: React.ComponentProps<typeof OrganizerScheduledEmail>) => {
  const t = props.teamMember?.language.translate || props.calEvent.organizer.language.translate;
  const title = "event_request_cancelled";
  const subject = "event_cancelled_subject";
  const isRoundRobin = props.calEvent.schedulingType === SchedulingType.ROUND_ROBIN;
  const subtitle = props.reassigned
    ? isRoundRobin
      ? t("event_reassigned_subtitle")
      : t("event_reassigned_subtitle_generic")
    : "";
  return (
    <OrganizerScheduledEmail
      title={title}
      subtitle={subtitle}
      headerType="xCircle"
      subject={subject}
      callToAction={null}
      reassigned={props.reassigned}
      {...props}
    />
  );
};
