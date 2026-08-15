import { useState } from "react";
import { Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createOrg as createOrgRow, listOrgs } from "./lib/orgs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function OrgSidebar() {
  const { orgId } = useParams({ strict: false });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const orgs = useQuery({ queryKey: ["orgs"], queryFn: listOrgs });

  const createOrg = useMutation({
    mutationFn: () => createOrgRow(name.trim()),
    onSuccess: async (newOrgId) => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["orgs"] });
      navigate({ to: "/orgs/$orgId/projects", params: { orgId: newOrgId } });
    },
  });

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-56 shrink-0 flex-col border-r">
        <div className="shrink-0 border-b px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Organisations
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto">
          {orgs.data?.map((o) => (
            <li key={o.id}>
              <Link
                to="/orgs/$orgId/projects"
                params={{ orgId: o.id }}
                className={`block border-l-2 px-3 py-1.5 text-sm ${
                  o.id === orgId
                    ? "border-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {o.name}
              </Link>
            </li>
          ))}
          {orgs.data && !orgs.data.length && (
            <li className="px-3 py-1.5 text-xs text-muted-foreground">
              none yet
            </li>
          )}
        </ul>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createOrg.mutate();
          }}
          className="flex shrink-0 flex-col gap-2 border-t p-2"
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="new organisation"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={createOrg.isPending || !name.trim()}
          >
            {createOrg.isPending ? "creating" : "create organisation"}
          </Button>
          {createOrg.error && (
            <p className="text-xs text-destructive">{createOrg.error.message}</p>
          )}
        </form>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {orgs.isPending ? (
          <div className="flex flex-col gap-px p-3">
            <div className="h-7 animate-pulse bg-muted" />
            <div className="h-7 animate-pulse bg-muted" />
            <div className="h-7 animate-pulse bg-muted" />
          </div>
        ) : orgs.isError ? (
          <p className="p-3 text-sm text-destructive">{orgs.error.message}</p>
        ) : !orgs.data.some((o) => o.id === orgId) ? (
          <div className="flex flex-col gap-1 p-3">
            <h2 className="text-sm font-medium">Organisation not found</h2>
            <p className="text-sm text-muted-foreground">
              There is no organisation with this id, or you are not a member of
              it. Pick one on the left.
            </p>
          </div>
        ) : (
          <Outlet />
        )}
      </div>
    </div>
  );
}
