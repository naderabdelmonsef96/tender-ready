import { createFileRoute } from "@tanstack/react-router";

import { WorkbenchPlaceholder } from "@/components/workbench-placeholder";

export const Route = createFileRoute("/_authenticated/workbench/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing builder — TenderReady" },
      {
        name: "description",
        content: "Landed cost and selling price with editable commercial factors.",
      },
      { property: "og:title", content: "Pricing builder — TenderReady" },
      {
        property: "og:description",
        content: "Landed cost and selling price with editable commercial factors.",
      },
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
      screenKey="screens.pricing"
      phase="phase4"
      currentPath="/workbench/pricing"
    />
  );
}
