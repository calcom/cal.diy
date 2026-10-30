import { SchedulingType } from "@calcom/prisma/enums";
import { OrganizerScheduledEmail } from "./OrganizerScheduledEmail";

export const OrganizerReassignedEmail = (props: React.ComponentProps<typeof OrganizerScheduledEmail>) => {
  const t = props.teamMember?.language.translate || props.calEvent.organizer.language.translate;
  const isRoundRobin = props.calEvent.schedulingType === SchedulingType.ROUND_ROBIN;
  const subtitle = isRoundRobin ? t("event_reassigned_subtitle") : t("event_reassigned_subtitle_generic");

  return (
    <OrganizerScheduledEmail
      title="event_request_reassigned"
      headerType="xCircle"
      subject="event_reassigned_subject"
      subtitle={<>{subtitle}</>}
      callToAction={null}
      reassigned={props.reassigned}
      {...props}
    />
  );
};
