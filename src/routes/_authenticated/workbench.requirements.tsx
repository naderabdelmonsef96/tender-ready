import { createFileRoute } from "@tanstack/react-router";

import { WorkbenchPlaceholder } from "@/components/workbench-placeholder";

export const Route = createFileRoute("/_authenticated/workbench/requirements")({
  head: () => ({
    meta: [
      { title: "BOQ & requirements — TenderReady" },
      { name: "description", content: "Source-linked requirements register extracted from the tender files." },
      { property: "og:title", content: "BOQ & requirements — TenderReady" },
      { property: "og:description", content: "Source-linked requirements register extracted from the tender files." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <WorkbenchPlaceholder
      screenKey="screens.requirements"
      phase="phase2"
      currentPath="/workbench/requirements"
    />
  );
}
