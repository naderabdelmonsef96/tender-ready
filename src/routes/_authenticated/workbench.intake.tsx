import { createFileRoute } from "@tanstack/react-router";

import { WorkbenchPlaceholder } from "@/components/workbench-placeholder";

export const Route = createFileRoute("/_authenticated/workbench/intake")({
  head: () => ({
    meta: [
      { title: "Tender intake — TenderReady" },
      { name: "description", content: "Register a tender, upload the tender files and start the governed flow." },
      { property: "og:title", content: "Tender intake — TenderReady" },
      { property: "og:description", content: "Register a tender, upload the tender files and start the governed flow." },
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
      screenKey="screens.intake"
      phase="phase2"
      currentPath="/workbench/intake"
    />
  );
}
