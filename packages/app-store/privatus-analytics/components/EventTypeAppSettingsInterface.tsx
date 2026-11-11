import type { EventTypeAppSettingsComponent } from "@calcom/app-store/types";
import { TextField } from "@calcom/ui/components/form";

const EventTypeAppSettingsInterface: EventTypeAppSettingsComponent = ({
  getAppData,
  setAppData,
  disabled,
  slug,
}) => {
  const trackingId = getAppData("trackingId");

  return (
    <TextField
      dataTestid={slug}
      name="Site ID"
      placeholder="pa_XXXXXXXXXX"
      hint="This is the data-site value in your Privatus Analytics tracking code."
      value={trackingId}
      disabled={disabled}
      onChange={(e) => {
        setAppData("trackingId", e.target.value.trim());
      }}
    />
  );
};

export default EventTypeAppSettingsInterface;
