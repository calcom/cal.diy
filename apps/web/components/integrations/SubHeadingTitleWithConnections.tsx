import type { ReactNode } from "react";

import { Badge } from "@calcom/ui/components/badge";

function pluralize(opts: { num: number; plural: string; singular: string }) {
  if (opts.num === 0) {
    return opts.singular;
  }
  return opts.singular;
}

export default function SubHeadingTitleWithConnections(props: { title: ReactNode }) {
  return <span>{props.title}</span>;
}
