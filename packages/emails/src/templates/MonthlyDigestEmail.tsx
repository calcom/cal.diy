import { APP_NAME, SENDER_NAME, SUPPORT_MAIL_ADDRESS } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { BaseEmailHtml } from "../components";

export type MonthlyDigestEmailData = {
  language: TFunction;
  Created: number;
  Completed: number;
  Rescheduled: number;
  Cancelled: number;
  mostBookedEvents: {
    eventTypeId?: number | null;
    eventTypeName?: string | null;
    count?: number | null;
  }[];
  membersWithMostBookings: {
    userId: number | null;
    user: {
      id: number;
      name: string | null;
      email: string;
      avatar: string | null;
      username: string | null;
    };
    count: number;
  }[];
  admin: { email: string; name: string };
  team: { name: string; id: number };
};

export const MonthlyDigestEmail = (
  props: MonthlyDigestEmailData & Partial<React.ComponentProps<typeof BaseEmailHtml>>
) => {
  const EventsDetails = () => {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "50px",
          marginTop: "30px",
          marginBottom: "30px",
        }}>
        <div>
          <p
            style={{
              fontWeight: 500,
              fontSize: "48px",
              lineHeight: "48px",
            }}>
            {props.Created}
          </p>
          <p style={{ fontSize: "16px", fontWeight: 500, lineHeight: "20px" }}>
            {props.language("events_created")}
          </p>
        </div>
        <div>
          <p
            style={{
              fontWeight: 500,
              fontSize: "48px",
              lineHeight: "48px",
            }}>
            {props.Completed}
          </p>
          <p style={{ fontSize: "16px", fontWeight: 500, lineHeight: "20px" }}>
            {props.language("completed")}
          </p>
        </div>
        <div>
          <p
            style={{
              fontWeight: 500,
              fontSize: "48px",
              lineHeight: "48px",
            }}>
            {props.Rescheduled}
          </p>
          <p style={{ fontSize: "16px", fontWeight: 500, lineHeight: "20px" }}>
            {props.language("rescheduled")}
          </p>
        </div>
        <div>
          <p
            style={{
              fontWeight: 500,
              fontSize: "48px",
              lineHeight: "48px",
            }}>
            {props.Cancelled}
          </p>
          <p style={{ fontSize: "16px", fontWeight: 500, lineHeight: "20px" }}>
            {props.language("cancelled")}
          </p>
        </div>
      </div>
    );
  };

  return (
    <BaseEmailHtml subject={props.language("verify_email_subject", { appName: APP_NAME })}>
      <div>
        <p
          style={{
            fontWeight: 600,
            fontSize: "32px",
            lineHeight: "38px",
            width: "100%",
            marginBottom: "30px",
          }}>
          {props.language("your_monthly_digest")}
        </p>
        <p style={{ fontWeight: "normal", fontSize: "16px", lineHeight: "24px" }}>
          {props.language("hi_user_name", { name: props.admin.name })}!
        </p>
        <p style={{ fontWeight: "normal", fontSize: "16px", lineHeight: "24px" }}>
          {props.language("summary_of_events_for_your_team_for_the_last_30_days", {
            teamName: props.team.name,
          })}
        </p>
        <EventsDetails />
        <div
          style={{
            width: "100%",
          }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderBottom: "1px solid #D1D5DB",
              fontSize: "16px",
            }}>
            <p style={{ fontWeight: 500 }}>{props.language("most_popular_events")}</p>
            <p style={{ fontWeight: 500 }}>{props.language("bookings")}</p>
          </div>
          {props.mostBookedEvents
            ? props.mostBookedEvents.map((ev, idx) => (
                <div
                  key={ev.eventTypeId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    borderBottom: `${idx === props.mostBookedEvents.length - 1 ? "" : "1px solid #D1D5DB"}`,
                  }}>
                  <p style={{ fontWeight: "normal" }}>{ev.eventTypeName}</p>
                  <p style={{ fontWeight: "normal" }}>{ev.count}</p>
                </div>
              ))
            : null}
        </div>
        <div style={{ width: "100%", marginTop: "30px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderBottom: "1px solid #D1D5DB",
            }}>
            <p style={{ fontWeight: 500 }}>{props.language("most_booked_members")}</p>
            <p style={{ fontWeight: 500 }}>{props.language("bookings")}</p>
          </div>
          {props.membersWithMostBookings
            ? props.membersWithMostBookings.map((it, idx) => (
                <div
                  key={it.userId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    borderBottom: `${
                      idx === props.membersWithMostBookings.length - 1 ? "" : "1px solid #D1D5DB"
                    }`,
                  }}>
                  <p style={{ fontWeight: "normal" }}>{it.user.name}</p>
                  <p style={{ fontWeight: "normal" }}>{it.count}</p>
                </div>
              ))
            : null}
        </div>
      </div>
      <div style={{ lineHeight: "6px" }}>
        <p style={{ fontWeight: 400, lineHeight: "24px" }}>
          <>
            {props.language("happy_scheduling")}, <br />
            <a
              href={`mailto:${SUPPORT_MAIL_ADDRESS}`}
              style={{ color: "#3E3E3E" }}
              target="_blank"
              rel="noreferrer">
              <>{props.language("the_calcom_team", { companyName: SENDER_NAME })}</>
            </a>
          </>
        </p>
      </div>
    </BaseEmailHtml>
  );
};
