import { WEBSITE_URL } from "@calcom/lib/constants";
import { trpc } from "@calcom/trpc/react";
import type { AppRouter } from "@calcom/trpc/types/server/routers/_app";
import useRouterQuery from "@lib/hooks/useRouterQuery";
import type { TRPCClientErrorLike } from "@trpc/client";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { ReactNode, RefCallback } from "react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

interface UsernameAvailabilityFieldProps {
  onSuccessMutation?: () => void;
  onErrorMutation?: (error: TRPCClientErrorLike<AppRouter>) => void;
  disabled?: boolean;
}

interface ICustomUsernameProps extends UsernameAvailabilityFieldProps {
  currentUsername: string | undefined;
  setCurrentUsername?: (newUsername: string) => void;
  inputUsernameValue: string | undefined;
  usernameRef: RefCallback<HTMLInputElement>;
  setInputUsernameValue: (value: string) => void;
  disabled?: boolean | undefined;
  addOnLeading?: ReactNode;
}

const UsernameTextfield = dynamic(() => import("./UsernameTextfield").then((m) => m.UsernameTextfield), {
  ssr: false,
});

export const UsernameAvailability = (props: ICustomUsernameProps) => {
  return <UsernameTextfield {...props} />;
};

export const UsernameAvailabilityField = ({
  onSuccessMutation,
  onErrorMutation,
  disabled,
}: UsernameAvailabilityFieldProps) => {
  const searchParams = useSearchParams();
  const [user] = trpc.viewer.me.get.useSuspenseQuery();
  const [currentUsernameState, setCurrentUsernameState] = useState(user.username || "");
  const { username: usernameFromQuery, setQuery: setUsernameFromQuery } = useRouterQuery("username");
  const { username: currentUsername, setQuery: setCurrentUsername } =
    searchParams?.get("username") && user.username === null
      ? { username: usernameFromQuery, setQuery: setUsernameFromQuery }
      : { username: currentUsernameState || "", setQuery: setCurrentUsernameState };
  const formMethods = useForm({
    defaultValues: {
      username: currentUsername,
    },
  });

  const orgBranding = null;

  const usernamePrefix = orgBranding
    ? "".replace(/^(https?:|)\/\//, "")
    : `${WEBSITE_URL?.replace(/^(https?:|)\/\//, "")}`;

  return (
    <Controller
      control={formMethods.control}
      name="username"
      render={({ field: { ref, onChange, value } }) => (
        <UsernameAvailability
          currentUsername={currentUsername}
          setCurrentUsername={setCurrentUsername}
          inputUsernameValue={value}
          usernameRef={ref}
          setInputUsernameValue={onChange}
          onSuccessMutation={onSuccessMutation}
          onErrorMutation={onErrorMutation}
          disabled={disabled ?? !!user.organization?.id}
          addOnLeading={`${usernamePrefix}/`}
        />
      )}
    />
  );
};
