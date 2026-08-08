import { createFileRoute } from "@tanstack/react-router";

import { WorkbenchPlaceholder } from "@/components/workbench-placeholder";

export const Route = createFileRoute("/_authenticated/workbench/review")({
  head: () => ({
    meta: [
      { title: "Commercial review & quotation — TenderReady" },
      {
        name: "description",
        content: "Final review, maker-checker approval and quotation release.",
      },
      { property: "og:title", content: "Commercial review & quotation — TenderReady" },
      {
        property: "og:description",
        content: "Final review, maker-checker approval and quotation release.",
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
      screenKey="screens.commercialReview"
      phase="phase4"
      currentPath="/workbench/review"
    />
  );
}
