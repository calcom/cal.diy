import type { PageProps } from "app/_types";
import type { Metadata } from "next";
import AuthentikRedirect from "./AuthentikRedirect";

const isLocalPath = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//");

const Page = async ({ searchParams }: PageProps) => {
  const { callbackUrl } = await searchParams;
  return <AuthentikRedirect callbackUrl={isLocalPath(callbackUrl) ? callbackUrl : "/rezervace"} />;
};

export const metadata: Metadata = { title: "Přihlášení | Werk|0" };

export default Page;
