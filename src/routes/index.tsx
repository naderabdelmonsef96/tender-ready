import { createFileRoute, Link } from "@tanstack/react-router";
import { FileSpreadsheet, ShieldCheck, Workflow } from "lucide-react";

import logo from "@/assets/tenderready-logo.png";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TenderReady — Tender-to-quotation governance" },
      {
        name: "description",
        content:
          "TenderReady turns tender files into a source-linked requirements register, priced quotation and audited maker-checker approval trail for engineering and EPC teams.",
      },
      { property: "og:title", content: "TenderReady — Tender-to-quotation governance" },
      {
        property: "og:description",
        content:
          "Bilingual EN/AR tender operating system: requirements, portfolio match, sourcing, pricing and governed quotation release.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const highlights = [
  {
    icon: FileSpreadsheet,
    title: "Source-linked requirements",
    body: "Every BOQ line keeps its file, sheet, row and original text so reviewers can verify the source.",
  },
  {
    icon: Workflow,
    title: "Seven governed stages",
    body: "Intake, technical, portfolio, sourcing, commercial, finance and release — each with a named approver.",
  },
  {
    icon: ShieldCheck,
    title: "Maker-checker enforced",
    body: "No one approves work they created. Access rules and audit records are enforced on the server.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-sidebar">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-3 px-4">
          <img
            src={logo}
            alt="TenderReady"
            className="h-9 w-9 rounded-md bg-white/95 object-contain p-1"
          />
          <span className="text-sm font-semibold text-sidebar-accent-foreground">TenderReady</span>
          <div className="ms-auto">
            <Button asChild size="sm">
              <Link to="/auth" search={{ next: "/dashboard" }}>
                Sign in
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-4 py-14 sm:py-20">
        <section className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Tender-to-quotation governance
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            From tender file to signed quotation, with every decision owned by a named person
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            TenderReady is a bilingual Arabic-English operating system for Egyptian and MENA
            engineering, contracting, EPC, solar and medical-equipment teams. AI assists with
            extraction and matching; humans own every material decision.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth" search={{ next: "/dashboard" }}>
                Sign in to your workspace
              </Link>
            </Button>
          </div>
        </section>

        <section className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((item) => (
            <article
              key={item.title}
              className="rounded-xl border border-border bg-card p-5 shadow-sm"
            >
              <item.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-semibold text-foreground">{item.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{item.body}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-6">
        <p className="mx-auto w-full max-w-[1200px] px-4 text-xs text-muted-foreground">
          TenderReady — governed tender-to-quotation workflow. Access requires an organization
          invitation.
        </p>
      </footer>
    </div>
  );
}
