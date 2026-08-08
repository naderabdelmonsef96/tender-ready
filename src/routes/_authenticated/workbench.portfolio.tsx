import { createFileRoute } from "@tanstack/react-router";

import { WorkbenchPlaceholder } from "@/components/workbench-placeholder";

export const Route = createFileRoute("/_authenticated/workbench/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio match — TenderReady" },
      {
        name: "description",
        content: "Match every requirement to your product portfolio with named review.",
      },
      { property: "og:title", content: "Portfolio match — TenderReady" },
      {
        property: "og:description",
        content: "Match every requirement to your product portfolio with named review.",
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
      screenKey="screens.portfolioMatch"
      phase="phase3"
      currentPath="/workbench/portfolio"
    />
  );
}
