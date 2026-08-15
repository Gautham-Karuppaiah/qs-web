import { useState } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProject, listProjects } from "./lib/projects";
import { listOrgs } from "./lib/orgs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Projects() {
  const { orgId } = useParams({
    from: "/authed/orgLayout/orgs/$orgId/projects",
  });
  const [name, setName] = useState("");
  const queryClient = useQueryClient();

  const orgs = useQuery({ queryKey: ["orgs"], queryFn: listOrgs });
  const org = orgs.data?.find((o) => o.id === orgId);

  const projects = useQuery({
    queryKey: ["projects", orgId],
    queryFn: () => listProjects(orgId),
  });

  const addProject = useMutation({
    mutationFn: () => createProject(orgId, name.trim()),
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["projects", orgId] });
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Projects
        </span>
        {org && <span className="text-xs text-muted-foreground">/ {org.name}</span>}

        <div className="flex-1" />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            addProject.mutate();
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="new project"
            className="h-7 w-48"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={addProject.isPending || !name.trim()}
          >
            {addProject.isPending ? "saving" : "add"}
          </Button>
        </form>
      </div>

      {addProject.error && (
        <p className="border-b px-3 py-1.5 text-xs text-destructive">
          {addProject.error.message}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {projects.isPending ? (
          <div className="flex flex-col gap-px p-3">
            <div className="h-7 animate-pulse bg-muted" />
            <div className="h-7 animate-pulse bg-muted" />
          </div>
        ) : projects.isError ? (
          <p className="p-3 text-sm text-destructive">
            {projects.error.message}
          </p>
        ) : !projects.data.length ? (
          <p className="p-3 text-sm text-muted-foreground">
            No projects yet. Add one above.
          </p>
        ) : (
          <ul>
            {projects.data.map((p) => (
              <li key={p.id} className="border-b">
                <Link
                  to="/orgs/$orgId/projects/$projectId/drawings"
                  params={{ orgId, projectId: p.id }}
                  className="block px-3 py-2 text-sm hover:bg-muted"
                >
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
