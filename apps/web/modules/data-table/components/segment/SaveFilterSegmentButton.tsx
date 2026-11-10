import { checkAdminOrOwner } from "@calcom/features/auth/lib/checkAdminOrOwner";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { FilterSegmentScope } from "@calcom/prisma/enums";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
} from "@calcom/ui/components/dialog";
import { Form, Input, Label, Select, Switch } from "@calcom/ui/components/form";
import { RadioField, RadioGroup } from "@calcom/ui/components/radio";
import { showToast } from "@calcom/ui/components/toast";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useDataTable } from "~/data-table/hooks";

interface FormValues {
  name: string;
  scope: FilterSegmentScope;
  teamId?: number;
}

export function SaveFilterSegmentButton() {
  const createSegmentMutation = {
    mutate: (_args: Record<string, unknown>) => {},
    mutateAsync: async (_args: Record<string, unknown>) => ({ id: "" }),
  };
  const updateSegmentMutation = {
    mutate: (_args: Record<string, unknown>) => {},
    mutateAsync: async (_args: Record<string, unknown>) => ({}),
  };
  const createSegment = (args: Record<string, unknown>) => createSegmentMutation.mutate(args);
  const updateSegment = (args: Record<string, unknown>) => updateSegmentMutation.mutate(args);
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const [isTeamSegment, setIsTeamSegment] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<number>();
  const session = useSession();
  const isAdminOrOwner = checkAdminOrOwner(session.data?.user?.org?.role);

  const form = useForm<FormValues>({
    defaultValues: {
      name: "",
      scope: "USER",
    },
  });

  const {
    tableIdentifier,
    activeFilters,
    sorting,
    columnVisibility,
    columnSizing,
    selectedSegment,
    canSaveSegment,
    isSegmentEnabled,
    setSegmentId,
    pageSize,
    searchTerm,
  } = useDataTable();

  const [saveMode, setSaveMode] = useState<"create" | "update">(() =>
    selectedSegment && selectedSegment.type === "user" ? "update" : "create"
  );

  // When the dialog is not open,
  // switch `saveMode` according to `selectedSegment`
  useEffect(() => {
    if (isOpen) {
      return;
    }
    setSaveMode(selectedSegment && selectedSegment.type === "user" ? "update" : "create");
  }, [selectedSegment, isOpen]);

  const teams = null as { id: number; name: string; slug: string | null }[] | null;

  const onSubmit = (values: FormValues) => {
    if (isTeamSegment && !selectedTeamId) {
      showToast(t("please_select_team"), "error");
      return;
    }

    const segmentData = {
      tableIdentifier,
      activeFilters,
      sorting,
      columnVisibility,
      columnSizing,
      perPage: pageSize,
      searchTerm,
    };

    if (saveMode === "update" && selectedSegment && selectedSegment.type === "user") {
      const scope = selectedSegment.scope;
      if (scope === "TEAM") {
        updateSegment({
          id: selectedSegment.id,
          scope,
          teamId: selectedSegment.teamId || 0,
          name: selectedSegment.name,
          ...segmentData,
        });
      } else {
        updateSegment({
          id: selectedSegment.id,
          scope,
          name: selectedSegment.name,
          ...segmentData,
        });
      }
    } else {
      if (isTeamSegment) {
        createSegment({
          ...segmentData,
          name: values.name,
          scope: "TEAM",
          teamId: selectedTeamId || 0,
        });
      } else {
        createSegment({
          ...segmentData,
          name: values.name,
          scope: "USER",
        });
      }
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset form state when dialog closes
      setIsTeamSegment(false);
      setSelectedTeamId(undefined);
      setSaveMode(selectedSegment && selectedSegment.type === "user" ? "update" : "create");
      form.reset();
    }
    setIsOpen(open);
  };

  if (!isSegmentEnabled) {
    return (
      <Button StartIcon="bookmark" color="secondary" disabled>
        {t("save")}
      </Button>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          StartIcon="bookmark"
          color="secondary"
          disabled={!canSaveSegment}
          data-testid="save-filter-segment-button">
          {t("save")}
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="save-filter-segment-dialog">
        <DialogHeader title={t("save_segment")} />
        <Form form={form} handleSubmit={onSubmit}>
          {selectedSegment && selectedSegment.type === "user" ? (
            <div className="mb-4">
              <RadioGroup
                defaultValue="update"
                onValueChange={(value: string) => setSaveMode(value as "create" | "update")}
                className="stack-y-2">
                <RadioField
                  id="update_segment"
                  label={t("override_segment", { name: selectedSegment.name })}
                  value="update"
                />
                <RadioField id="create_segment" label={t("create_new_segment")} value="create" />
              </RadioGroup>
            </div>
          ) : null}

          <div>
            {saveMode === "create" && (
              <div>
                <Label>{t("name")}</Label>
                <Input {...form.register("name")} data-testid="save-filter-segment-name" required />
              </div>
            )}

            {isAdminOrOwner && saveMode === "create" && (
              <>
                <div className="-ml-2 mt-4">
                  <Switch
                    id="teamSegment"
                    label={t("save_for_team")}
                    checked={isTeamSegment}
                    onCheckedChange={setIsTeamSegment}
                    labelOnLeading
                  />
                </div>

                {isTeamSegment && teams && teams.length > 0 && (
                  <div className="mt-1.5">
                    <Select<{ value: string; label: string }>
                      options={teams.map((team) => ({
                        value: team.id.toString(),
                        label: team.name,
                      }))}
                      onChange={(option) => setSelectedTeamId(parseInt(option?.value || "0"))}
                      placeholder={t("select_team")}
                      data-testid="save-filter-segment-team-select"
                      required
                    />
                  </div>
                )}
              </>
            )}

            <DialogFooter>
              <Button type="button" color="minimal" onClick={() => setIsOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit">{t("save")}</Button>
            </DialogFooter>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
