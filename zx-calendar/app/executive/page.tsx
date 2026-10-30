import type { Metadata } from "next";
import { ExecutiveApp } from "@/components/executive/ExecutiveApp";
import { PasscodeGate } from "@/components/executive/PasscodeGate";
import { accessConfigured, isExecutive } from "@/lib/auth";

export const metadata: Metadata = { title: "Executive · Z × XOE" };
export const dynamic = "force-dynamic";

export default async function ExecutivePage() {
  if (!(await isExecutive())) return <PasscodeGate configured={accessConfigured} />;
  return <ExecutiveApp />;
}
