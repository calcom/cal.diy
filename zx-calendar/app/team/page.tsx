import type { Metadata } from "next";
import { TeamApp } from "@/components/team/TeamApp";

export const metadata: Metadata = { title: "Book a call · Z × XOE" };

export default function TeamPage() {
  return <TeamApp />;
}
