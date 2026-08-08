import { createFileRoute } from "@tanstack/react-router";

import { WorkbenchPlaceholder } from "@/components/workbench-placeholder";

export const Route = createFileRoute("/_authenticated/workbench/sourcing")({
  head: () => ({
    meta: [
      { title: "Supply route — TenderReady" },
      { name: "description", content: "Route each item to stock, import, local supplier or foreign RFQ." },
      { property: "og:title", content: "Supply route — TenderReady" },
      { property: "og:description", content: "Route each item to stock, import, local supplier or foreign RFQ." },
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
      screenKey="screens.sourcing"
      phase="phase3"
      currentPath="/workbench/sourcing"
    />
  );
}
