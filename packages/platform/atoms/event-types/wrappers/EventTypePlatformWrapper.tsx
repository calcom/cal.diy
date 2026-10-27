"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useEffect, forwardRef, useImperativeHandle, useCallback } from "react";

import { BookerStoreProvider } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import type { ChildrenEventType } from "@calcom/web/modules/event-types/components/ChildrenEventTypeSelect";
import { EventType as EventTypeComponent } from "@calcom/web/modules/event-types/components/EventType";
import ManagedEventTypeDialog from "@calcom/features/eventtypes/components/dialogs/ManagedEventDialog";
import type {
  EventTypeSetupProps,
  FormValues,
  EventTypePlatformWrapperRef,
} from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { SchedulingType } from "@calcom/prisma/enums";
import type { EventAdvancedTabCustomClassNames } from "@calcom/web/modules/event-types/components/tabs/advanced/EventAdvancedTab";
import type { EventTeamAssignmentTabCustomClassNames } from "@calcom/web/modules/event-types/components/tabs/assignment/EventTeamAssignmentTab";
import type { EventAvailabilityTabCustomClassNames } from "@calcom/web/modules/event-types/components/tabs/availability/EventAvailabilityTab";
import type { EventLimitsTabCustomClassNames } from "@calcom/web/modules/event-types/components/tabs/limits/EventLimitsTab";
import type { EventRecurringTabCustomClassNames } from "@calcom/web/modules/event-types/components/tabs/recurring/RecurringEventController";
import type { EventSetupTabCustomClassNames } from "@calcom/web/modules/event-types/components/tabs/setup/EventSetupTab";

import { useDeleteEventTypeById } from "../../hooks/event-types/private/useDeleteEventTypeById";
import { useAtomsContext } from "../../hooks/useAtomsContext";
import { useMe } from "../../hooks/useMe";
import { AtomsWrapper } from "../../src/components/atoms-wrapper";
import { useToast } from "../../src/components/ui/use-toast";
import { useAtomsEventTypeById, QUERY_KEY as ATOM_EVENT_TYPE_QUERY_KEY } from "../hooks/useAtomEventTypeById";
import { useAtomUpdateEventType } from "../hooks/useAtomUpdateEventType";
import { useEventTypeForm } from "../hooks/useEventTypeForm";
import { useHandleRouteChange } from "../hooks/useHandleRouteChange";
import { usePlatformTabsNavigations } from "../hooks/usePlatformTabsNavigations";
import EventAdvancedPlatformWrapper from "./EventAdvancedPlatformWrapper";
import EventAvailabilityTabPlatformWrapper from "./EventAvailabilityTabPlatformWrapper";
import EventLimitsTabPlatformWrapper from "./EventLimitsTabPlatformWrapper";
import EventPaymentsTabPlatformWrapper from "./EventPaymentsTabPlatformWrapper";
import EventRecurringTabPlatformWrapper from "./EventRecurringTabPlatformWrapper";
import SetupTab from "./EventSetupTabPlatformWrapper";
import EventTeamAssignmentTabPlatformWrapper from "./EventTeamAssignmentTabPlatformWrapper";
import type { PlatformTabs } from "./types";

export type EventTypeCustomClassNames = {
  atomsWrapper?: string;
  eventSetupTab?: EventSetupTabCustomClassNames;
  eventLimitsTab?: EventLimitsTabCustomClassNames;
  eventAdvancedTab?: EventAdvancedTabCustomClassNames;
  eventAssignmentTab?: EventTeamAssignmentTabCustomClassNames;
  eventRecurringTab?: EventRecurringTabCustomClassNames;
  eventAvailabilityTab?: EventAvailabilityTabCustomClassNames;
};

export type EventTypePlatformWrapperProps = {
  id: number;
  tabs?: PlatformTabs[];
  onSuccess?: (eventType: FormValues) => void;
  onError?: (eventType: FormValues, error: Error) => void;
  onDeleteSuccess?: () => void;
  onDeleteError?: (msg: string) => void;
  allowDelete: boolean;
  customClassNames?: EventTypeCustomClassNames;
  disableToasts?: boolean;
  isDryRun?: boolean;
  onFormStateChange?: (formState: {
    isDirty: boolean;
    dirtyFields: Partial<FormValues>;
    values: FormValues;
  }) => void;
};

const EventType = forwardRef<
  EventTypePlatformWrapperRef,
  EventTypeSetupProps & EventTypePlatformWrapperProps
>(function EventType(props, ref) {
  const {
    tabs = ["setup", "availability", "team", "limits", "advanced", "recurring", "payments"],
    onSuccess,
    onError,
    onDeleteSuccess,
    onDeleteError,
    id,
    allowDelete = true,
    customClassNames,
    disableToasts = false,
    isDryRun = false,
    onFormStateChange,
    ...restProps
  } = props;
  const { t } = useLocale();
  const { toast } = useToast();
  const { organizationId } = useAtomsContext();
  const isTeamEventTypeDeleted = useRef(false);
  const leaveWithoutAssigningHosts = useRef(false);
  const { eventType, locationOptions, team, teamMembers, destinationCalendar } = restProps;
  const [slugExistsChildrenDialogOpen, setSlugExistsChildrenDialogOpen] = useState<ChildrenEventType[]>([]);
  const { data: user, isLoading: isUserLoading } = useMe();

  const handleDeleteSuccess = () => {
    if (!disableToasts) {
      showToast(t("event_type_deleted_successfully"), "success");
    }
    isTeamEventTypeDeleted.current = true;
    setSlugExistsChildrenDialogOpen([]);
    onDeleteSuccess?.();
  };

  const handleDeleteError = (err: Error) => {
    if (!disableToasts) {
      showToast(err.message, "error");
    }
    onDeleteError?.(err.message);
  };

  const deleteMutation = useDeleteEventTypeById({
    onSuccess: async () => {
      handleDeleteSuccess();
    },
    onError: (err) => {
      handleDeleteError(err);
    },
  });

  const updateMutation = useAtomUpdateEventType({
    onSuccess: async () => {
      const currentValues = form.getValues();

      currentValues.children = currentValues.children.map((child) => ({
        ...child,
        created: true,
      }));
      currentValues.assignAllTeamMembers = currentValues.assignAllTeamMembers || false;

      // Reset the form with these values as new default values to ensure the correct comparison for dirtyFields eval
      form.reset(currentValues);
      if (!disableToasts) {
        toast({ description: t("event_type_updated_successfully", { eventTypeTitle: eventType.title }) });
      }
      onSuccess?.(currentValues);
      callbacksRef.current?.onSuccess?.();
    },
    async onSettled() {
      return;
    },
    onError: (err: Error) => {
      const currentValues = form.getValues();
      const message = err?.message;
      const description = message ? t(message) : t(err.message);
      if (!disableToasts) {
        toast({ description });
      }
      onError?.(currentValues, err);

      const errorObj = new Error(description);
      callbacksRef.current?.onError?.(errorObj);
    },
    teamId: team?.id,
  });

  const { form, handleSubmit } = useEventTypeForm({
    eventType,
    onSubmit: (data) => {
      if (!isDryRun) {
        updateMutation.mutate(data);
      } else {
        toast({ description: t("event_type_updated_successfully", { eventTypeTitle: eventType.title }) });
        callbacksRef.current?.onSuccess?.();
      }
    },
    onFormStateChange: onFormStateChange,
  });

  // Create a ref for the save button to trigger its click
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  const callbacksRef = useRef<{ onSuccess?: () => void; onError?: (error: Error) => void }>({});

  const handleFormSubmit = useCallback(
    (customCallbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
      if (customCallbacks) {
        callbacksRef.current = customCallbacks;
      }

      if (saveButtonRef.current) {
        saveButtonRef.current.click();
      } else {
        form.handleSubmit(async (data) => {
          try {
            await handleSubmit(data);
          } catch (error) {
            customCallbacks?.onError?.(error as Error);
          }
        })();
      }
    },
    [handleSubmit, form]
  );

  const validateForm = useCallback(async () => {
    const isValid = await form.trigger();
    return {
      isValid,
      errors: form.formState.errors,
    };
  }, [form]);

  useImperativeHandle(
    ref,
    () => ({
      validateForm,
      handleFormSubmit,
    }),
    [validateForm, handleFormSubmit]
  );
  const slug = form.watch("slug") ?? eventType.slug;

  const showToast = (message: string, _variant: "success" | "warning" | "error") => {
    if (!disableToasts) {
      toast({ description: message });
    }
  };

  const tabMap = {
    setup: tabs.includes("setup") ? (
      <SetupTab
        eventType={eventType}
        locationOptions={locationOptions}
        team={team}
        teamMembers={teamMembers}
        destinationCalendar={destinationCalendar}
        customClassNames={customClassNames?.eventSetupTab}
      />
    ) : (
      <></>
    ),
    availability: tabs.includes("availability") ? (
      <EventAvailabilityTabPlatformWrapper
        eventType={eventType}
        isTeamEvent={!!team}
        user={user?.data}
        teamId={team?.id}
        customClassNames={customClassNames?.eventAvailabilityTab}
      />
    ) : (
      <></>
    ),
    team: tabs.includes("team") ? (
      <EventTeamAssignmentTabPlatformWrapper
        team={team}
        eventType={eventType}
        teamMembers={teamMembers}
        customClassNames={customClassNames?.eventAssignmentTab}
        orgId={organizationId}
      />
    ) : (
      <></>
    ),
    advanced: tabs.includes("advanced") ? (
      <EventAdvancedPlatformWrapper
        eventType={eventType}
        team={team}
        user={user?.data}
        isUserLoading={isUserLoading}
        showToast={showToast}
        customClassNames={customClassNames?.eventAdvancedTab}
      />
    ) : (
      <></>
    ),
    payments: tabs.includes("payments") ? <EventPaymentsTabPlatformWrapper eventType={eventType} /> : <></>,
    limits: tabs.includes("limits") ? (
      <EventLimitsTabPlatformWrapper
        eventType={eventType}
        customClassNames={customClassNames?.eventLimitsTab}
      />
    ) : (
      <></>
    ),
    instant: <></>,
    recurring: tabs.includes("recurring") ? (
      <EventRecurringTabPlatformWrapper
        eventType={eventType}
        customClassNames={customClassNames?.eventRecurringTab}
      />
    ) : (
      <></>
    ),
    apps: <></>,
    workflows: <></>,
    webhooks: <></>,
    ai: <></>,
  } as const;

  useHandleRouteChange({
    watchTrigger: null,
    isTeamEventTypeDeleted: isTeamEventTypeDeleted.current,
    isleavingWithoutAssigningHosts: leaveWithoutAssigningHosts.current,
    isTeamEventType: !!team,
    assignedUsers: eventType.children,
    hosts: eventType.hosts,
    assignAllTeamMembers: eventType.assignAllTeamMembers,
    isManagedEventType: eventType.schedulingType === SchedulingType.MANAGED,
    onError: () => {
      return;
    },
    onStart: () => {
      return;
    },
    onEnd: () => {
      return;
    },
  });

  const onDelete = () => {
    if (allowDelete && !isDryRun) {
      isTeamEventTypeDeleted.current = true;
      deleteMutation.mutate(id);
    }

    if (isDryRun) {
      handleDeleteSuccess();
    }
  };

  const onConflict = (conflicts: ChildrenEventType[]) => {
    setSlugExistsChildrenDialogOpen(conflicts);
  };

  const { tabsNavigation, currentTab } = usePlatformTabsNavigations({
    formMethods: form,
    eventType,
    team,
    tabs,
  });
  return (
    <AtomsWrapper customClassName={customClassNames?.atomsWrapper}>
      <EventTypeComponent
        {...restProps}
        tabMap={tabMap}
        onDelete={onDelete}
        onConflict={onConflict}
        handleSubmit={handleSubmit}
        formMethods={form}
        isUpdating={updateMutation.isPending}
        isPlatform
        tabName={currentTab}
        tabsNavigation={tabsNavigation}
        allowDelete={allowDelete}
        saveButtonRef={saveButtonRef}>
        <>
          {slugExistsChildrenDialogOpen.length ? (
            <ManagedEventTypeDialog
              slugExistsChildrenDialogOpen={slugExistsChildrenDialogOpen}
              isPending={form.formState.isSubmitting}
              onOpenChange={() => {
                setSlugExistsChildrenDialogOpen([]);
              }}
              slug={slug}
              onConfirm={(e: { preventDefault: () => void }) => {
                e.preventDefault();
                handleSubmit(form.getValues());
                setSlugExistsChildrenDialogOpen([]);
              }}
            />
          ) : null}
        </>
      </EventTypeComponent>
    </AtomsWrapper>
  );
});

export const EventTypePlatformWrapper = forwardRef<
  EventTypePlatformWrapperRef,
  EventTypePlatformWrapperProps
>(function EventTypePlatformWrapper(props, ref) {
  const {
    id,
    tabs,
    onSuccess,
    onError,
    onDeleteSuccess,
    onDeleteError,
    allowDelete = true,
    customClassNames,
    isDryRun,
    disableToasts,
    onFormStateChange,
  } = props;
  const { data: eventTypeQueryData } = useAtomsEventTypeById(id);
  const queryClient = useQueryClient();

  useEffect(() => {
    return () => {
      if (eventTypeQueryData) {
        // on component unmount or eventTypeId change, reset and invalidate query to get fresh data on next mount
        queryClient.invalidateQueries({
          queryKey: [ATOM_EVENT_TYPE_QUERY_KEY, id],
        });
        queryClient.resetQueries({
          queryKey: [ATOM_EVENT_TYPE_QUERY_KEY, id],
        });
      }
    };
  }, [queryClient, id, eventTypeQueryData]);

  if (!eventTypeQueryData) return null;

  return (
    <BookerStoreProvider>
      <EventType
        {...eventTypeQueryData}
        id={id}
        tabs={tabs}
        onSuccess={onSuccess}
        onError={onError}
        onDeleteSuccess={onDeleteSuccess}
        onDeleteError={onDeleteError}
        allowDelete={allowDelete}
        customClassNames={customClassNames}
        isDryRun={isDryRun}
        onFormStateChange={onFormStateChange}
        ref={ref}
        disableToasts={disableToasts}
      />
    </BookerStoreProvider>
  );
});
