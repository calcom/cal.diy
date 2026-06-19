"use client";

import { WEBAPP_URL } from "@calcom/lib/constants";
import { useDebounce } from "@calcom/lib/hooks/useDebounce";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Avatar } from "@calcom/ui/components/avatar";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { ConfirmationDialogContent, Dialog } from "@calcom/ui/components/dialog";
import { TextField } from "@calcom/ui/components/form";
import { DropdownActions, Table } from "@calcom/ui/components/table";
import { showToast } from "@calcom/ui/components/toast";
import { keepPreviousData } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const { Cell, ColumnTitle, Header, Row } = Table;

const FETCH_LIMIT = 25;

export function UsersTable() {
  const { t } = useLocale();
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();
  const [searchTerm, setSearchTerm] = useState<string>("");
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const router = useRouter();
  const { data: session } = useSession();

  async function loginAsUser(userId: number) {
    try {
      const res = await fetch("/api/auth/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId }),
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.error ?? t("error_impersonating_user"), "error");
        return;
      }
      // Redirect to dashboard as the impersonated user
      router.push("/");
      router.refresh();
    } catch {
      showToast(t("error_impersonating_user"), "error");
    }
  }

  const [userToDelete, setUserToDelete] = useState<number | null>(null);

  const deleteMutation = trpc.viewer.users.delete.useMutation({
    onSuccess: async () => {
      showToast(t("user_has_been_deleted"), "success");
      utils.viewer.admin.listPaginated.setInfiniteData({ limit: FETCH_LIMIT }, (cachedData) => {
        if (!cachedData) {
          return {
            pages: [],
            pageParams: [],
          };
        }
        return {
          ...cachedData,
          pages: cachedData.pages.map((page) => ({
            ...page,
            rows: page.rows.filter((row) => row.id !== userToDelete),
          })),
        };
      });
    },
    onError: (err) => {
      console.error(err.message);
      showToast(t("error_deleting_user"), "error");
    },
    onSettled: () => {
      setUserToDelete(null);
    },
  });

  const { data, fetchNextPage, isFetching } = trpc.viewer.admin.listPaginated.useInfiniteQuery(
    {
      limit: FETCH_LIMIT,
      searchTerm: debouncedSearchTerm,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: keepPreviousData,
      refetchOnWindowFocus: false,
    }
  );

  const sendPasswordResetEmail = trpc.viewer.admin.sendPasswordReset.useMutation({
    onSuccess: () => {
      showToast(t("password_reset_email_sent"), "success");
    },
  });

  const removeTwoFactor = trpc.viewer.admin.removeTwoFactor.useMutation({
    onSuccess: () => {
      showToast(t("two_factor_removed"), "success");
    },
  });

  const lockUserAccount = trpc.viewer.admin.lockUserAccount.useMutation({
    onSuccess: ({ locked }) => {
      showToast(locked ? t("user_locked") : t("user_unlocked"), "success");
      utils.viewer.admin.listPaginated.invalidate();
    },
  });

  const flatData = useMemo(() => data?.pages?.flatMap((page) => page.rows) ?? [], [data]);
  const totalRowCount = data?.pages?.[0]?.meta?.totalRowCount ?? 0;
  const totalFetched = flatData.length;

  const fetchMoreOnBottomReached = useCallback(
    (containerRefElement?: HTMLDivElement | null) => {
      if (containerRefElement) {
        const { scrollHeight, scrollTop, clientHeight } = containerRefElement;
        if (scrollHeight - scrollTop - clientHeight < 300 && !isFetching && totalFetched < totalRowCount) {
          fetchNextPage();
        }
      }
    },
    [fetchNextPage, isFetching, totalFetched, totalRowCount]
  );

  useEffect(() => {
    fetchMoreOnBottomReached(tableContainerRef.current);
  }, [fetchMoreOnBottomReached]);

  return (
    <div>
      <TextField
        placeholder="username or email"
        label={t("search")}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <div
        className="border-subtle rounded-md border"
        ref={tableContainerRef}
        onScroll={() => fetchMoreOnBottomReached()}
        style={{
          height: "calc(100vh - 30vh)",
          overflow: "auto",
        }}>
        <Table>
          <Header>
            <ColumnTitle widthClassNames="w-auto">{t("user")}</ColumnTitle>
            <ColumnTitle>{t("timezone")}</ColumnTitle>
            <ColumnTitle>{t("role")}</ColumnTitle>
            <ColumnTitle widthClassNames="w-auto">
              <span className="sr-only">{t("edit")}</span>
            </ColumnTitle>
          </Header>

          <tbody className="divide-subtle divide-y rounded-md">
            {flatData.map((user) => (
              <Row key={user.email}>
                <Cell widthClassNames="w-auto">
                  <div className="min-h-10 flex">
                    <Avatar
                      size="md"
                      alt={`Avatar of ${user.username || "Nameless"}`}
                      imageSrc={`${WEBAPP_URL}/${user.username}/avatar.png`}
                    />
                    <div className="text-subtle ml-4 font-medium">
                      <div className="flex gap-3">
                        <span className="text-default">{user.name}</span>
                        <span>/{user.username}</span>
                        {user.locked && <Badge variant="red">{t("locked")}</Badge>}
                      </div>
                      <span className="break-all">{user.email}</span>
                    </div>
                  </div>
                </Cell>
                <Cell>{user.timeZone}</Cell>
                <Cell>
                  <Badge className="capitalize" variant={user.role === "ADMIN" ? "red" : "gray"}>
                    {user.role.toLowerCase()}
                  </Badge>
                </Cell>
                <Cell widthClassNames="w-auto">
                  <div className="flex w-full justify-end">
                    <DropdownActions
                      actions={[
                        {
                          id: "edit",
                          label: t("edit"),
                          href: `/settings/admin/users/${user.id}/edit`,
                          icon: "pencil" as const,
                        },
                        ...(session?.user?.id !== user.id
                          ? [
                              {
                                id: "impersonate",
                                label: t("impersonate"),
                                onClick: () => loginAsUser(user.id),
                                icon: "user" as const,
                              },
                            ]
                          : []),
                        {
                          id: "reset-password",
                          label: t("reset_password"),
                          onClick: () => sendPasswordResetEmail.mutate({ userId: user.id }),
                          icon: "lock" as const,
                        },
                        {
                          id: "lock-user",
                          label: user.locked ? t("unlock_user_account") : t("lock_user_account"),
                          onClick: () => lockUserAccount.mutate({ userId: user.id, locked: !user.locked }),
                          icon: "lock" as const,
                        },
                        {
                          id: "remove-2fa",
                          label: t("remove_2fa"),
                          color: "destructive" as const,
                          onClick: () => removeTwoFactor.mutate({ userId: user.id }),
                          icon: "shield" as const,
                        },
                        {
                          id: "delete",
                          label: t("delete"),
                          color: "destructive" as const,
                          onClick: () => setUserToDelete(user.id),
                          icon: "trash" as const,
                        },
                      ]}
                    />
                  </div>
                </Cell>
              </Row>
            ))}
          </tbody>
        </Table>
        <DeleteUserDialog
          user={userToDelete}
          onClose={() => setUserToDelete(null)}
          onConfirm={() => {
            if (!userToDelete) return;
            deleteMutation.mutate({ userId: userToDelete });
          }}
        />
      </div>
    </div>
  );
}

function DeleteUserDialog({
  user,
  onConfirm,
  onClose,
}: {
  user: number | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useLocale();
  return (
    <Dialog open={!!user} onOpenChange={(open) => (open ? undefined : onClose())}>
      <ConfirmationDialogContent
        title={t("delete_user")}
        confirmBtnText={t("delete")}
        cancelBtnText={t("cancel")}
        variety="danger"
        onConfirm={onConfirm}>
        <p>{t("delete_user_confirmation")}</p>
      </ConfirmationDialogContent>
    </Dialog>
  );
}
