import type {
  EventTypeAppSettingsComponent,
  EventTypeAppSettingsComponentProps,
} from "@calcom/app-store/types";
import { Switch, TextField } from "@calcom/ui/components/form";
import { Section } from "@calcom/ui/components/section";
import { useId } from "react";

type SectionProps = Pick<
  EventTypeAppSettingsComponentProps,
  "getAppData" | "setAppData" | "disabled" | "slug"
>;

const SettingToggle = ({
  label,
  description,
  ...props
}: {
  name: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => {
  const id = useId();

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div id={`${id}-label`} className="font-medium text-emphasis text-sm">
          {label}
        </div>
        <p id={`${id}-description`} className="mt-1 text-pretty text-muted text-sm">
          {description}
        </p>
      </div>
      <Switch size="sm" aria-labelledby={`${id}-label`} aria-describedby={`${id}-description`} {...props} />
    </div>
  );
};

const GeneralSettings = ({ getAppData, setAppData, disabled }: SectionProps) => (
  <TextField
    name="Hostname"
    label="Hostname"
    required
    pattern=".*\S.*"
    showAsteriskIndicator
    placeholder="example.com"
    data-testid="simple-analytics-hostname-input"
    defaultValue={getAppData("HOSTNAME")}
    disabled={disabled}
    hint="Must match a website in your Simple Analytics dashboard. Booking page visits and events are recorded under it."
    onChange={(e) => {
      setAppData("HOSTNAME", e.target.value);
    }}
  />
);

const AdvancedSettings = ({ getAppData, setAppData, disabled }: SectionProps) => (
  <SettingToggle
    name="collect-do-not-track-visits"
    label="Collect Do Not Track visits"
    checked={getAppData("COLLECT_DNT") === "true"}
    disabled={disabled}
    description="Enable web analytics for visitors who have Do Not Track turned on."
    onCheckedChange={(checked) => {
      setAppData("COLLECT_DNT", String(checked));
    }}
  />
);

const EventSettings = ({ getAppData, setAppData, disabled }: SectionProps) => (
  <SettingToggle
    name="collect-booking-events"
    label="Collect booking events"
    checked={getAppData("BOOKING_EVENTS") !== "false"}
    disabled={disabled}
    description="Send an event when a booking is completed, rescheduled or cancelled."
    onCheckedChange={(checked) => {
      setAppData("BOOKING_EVENTS", String(checked));
    }}
  />
);

const EventTypeAppSettingsInterface: EventTypeAppSettingsComponent = ({
  getAppData,
  setAppData,
  disabled,
  slug,
}) => {
  return (
    <Section.Content>
      <GeneralSettings getAppData={getAppData} setAppData={setAppData} disabled={disabled} slug={slug} />
      <EventSettings getAppData={getAppData} setAppData={setAppData} disabled={disabled} slug={slug} />
      <AdvancedSettings getAppData={getAppData} setAppData={setAppData} disabled={disabled} slug={slug} />
    </Section.Content>
  );
};

export default EventTypeAppSettingsInterface;
