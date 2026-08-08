import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { useAppTranslation } from "@/components/language-provider";
import { ErrorState, LoadingRows, PageHeader, Panel } from "@/components/ui-blocks";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { inviteMember, removeMember, updateMemberRole, type AppRole } from "@/lib/org.functions";
import { getMembers } from "@/lib/workspace.functions";

const roles: AppRole[] = [
  "org_admin",
  "proposal_engineer",
  "technical_lead",
  "product_manager",
  "sourcing_manager",
  "commercial_manager",
  "finance_manager",
  "signatory",
  "viewer",
];

export const Route = createFileRoute("/_authenticated/settings/users")({
  head: () => ({
    meta: [
      { title: "Users & roles — TenderReady" },
      {
        name: "description",
        content: "Invite colleagues and assign maker, checker and approval roles for your organization.",
      },
      { property: "og:title", content: "Users & roles — TenderReady" },
      { property: "og:description", content: "Role-based access for the tender governance workflow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  const { t, language } = useAppTranslation();
  const workspace = useWorkspace();
  const organizationId = workspace.activeOrganizationId!;
  const queryClient = useQueryClient();

  const fetchMembers = useServerFn(getMembers);
  const invite = useServerFn(inviteMember);
  const changeRole = useServerFn(updateMemberRole);
  const remove = useServerFn(removeMember);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("proposal_engineer");

  const query = useQuery({
    queryKey: ["members", organizationId],
    queryFn: () => fetchMembers({ data: { organizationId } }),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["members", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["audit-trail", organizationId] });
  };

  const inviteMutation = useMutation({
    mutationFn: () => invite({ data: { organizationId, email: inviteEmail.trim(), role: inviteRole } }),
    onSuccess: () => {
      toast.success(t("settings.invited"));
      setInviteEmail("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message || t("common.unexpectedError")),
  });

  const roleMutation = useMutation({
    mutationFn: (input: { membershipId: string; role: AppRole }) =>
      changeRole({ data: { organizationId, ...input } }),
    onSuccess: () => {
      toast.success(t("settings.roleUpdated"));
      refresh();
    },
    onError: (error: Error) => toast.error(error.message || t("common.unexpectedError")),
  });

  const removeMutation = useMutation({
    mutationFn: (membershipId: string) => remove({ data: { organizationId, membershipId } }),
    onSuccess: () => {
      toast.success(t("settings.removed"));
      refresh();
    },
    onError: (error: Error) => toast.error(error.message || t("common.unexpectedError")),
  });

  const isAdmin = query.data?.isAdmin === true;

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <PageHeader title={t("settings.usersTitle")} subtitle={t("settings.usersSubtitle")} />

      {query.isPending && <LoadingRows rows={5} />}
      {query.error && (
        <ErrorState
          message={(query.error as Error).message || t("common.unexpectedError")}
          action={
            <Button variant="outline" onClick={() => void query.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      )}

      {query.data && (
        <div className="space-y-4">
          {isAdmin ? (
            <Panel title={t("settings.inviteTitle")}>
              <form
                className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-end"
                onSubmit={(event) => {
                  event.preventDefault();
                  inviteMutation.mutate();
                }}
              >
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="inviteEmail" className="text-xs font-medium text-muted-foreground">
                    {t("common.email")}
                  </Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    dir="ltr"
                    required
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="inviteRole" className="text-xs font-medium text-muted-foreground">
                    {t("common.role")}
                  </Label>
                  <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as AppRole)}>
                    <SelectTrigger id="inviteRole">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {t(`roles.${role}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? t("common.saving") : t("settings.invite")}
                </Button>
              </form>
            </Panel>
          ) : (
            <p className="text-xs text-muted-foreground">{t("settings.adminOnly")}</p>
          )}

          <Panel bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-sm">
                <caption className="sr-only">{t("settings.usersTitle")}</caption>
                <thead>
                  <tr className="border-b border-border bg-surface-muted">
                    <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                      {t("settings.member")}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                      {t("common.role")}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                      {t("common.status")}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-end font-semibold">
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.members.map((member) => {
                    const isSelf = member.userId !== null && member.userId === query.data.currentUserId;
                    const name =
                      (language === "ar" ? member.fullNameAr ?? member.fullName : member.fullName) ?? null;
                    return (
                      <tr key={member.id} className="border-b border-border/70 align-top last:border-0">
                        <td className="max-w-[20rem] px-4 py-3">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium">
                              {name ?? member.email ?? t("common.none")}
                            </span>
                            {isSelf && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                                {t("settings.you")}
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground" data-ltr>
                            {member.email ?? t("common.none")}
                          </span>
                          {member.jobTitle && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {member.jobTitle}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isAdmin ? (
                            <Select
                              value={member.role}
                              onValueChange={(value) =>
                                roleMutation.mutate({ membershipId: member.id, role: value as AppRole })
                              }
                            >
                              <SelectTrigger className="h-9 w-full max-w-[15rem]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {roles.map((role) => (
                                  <SelectItem key={role} value={role}>
                                    {t(`roles.${role}`)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span>{t(`roles.${member.role}`)}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                            {t(`membership.${member.status}`)}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {formatDate(member.createdAt, language)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-end">
                          {isAdmin && !isSelf ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={removeMutation.isPending}
                              onClick={() => removeMutation.mutate(member.id)}
                            >
                              {t("settings.remove")}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("common.none")}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
