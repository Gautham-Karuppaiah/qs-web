import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { Projects } from "./Projects";
import { Drawings } from "./Drawings";
import { Viewer } from "./Viewer";
import { Import } from "./Import";
import { OrgSidebar } from "./OrgSidebar";
import { AuthForm } from "./AuthForm";

export type Auth =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; session: Session };

const rootRoute = createRootRouteWithContext<{ auth: Auth }>()({
  component: () => <Outlet />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (search: Record<string, unknown>) => {
    const raw = typeof search.redirect === "string" ? search.redirect : "/";
    try {
      const url = new URL(raw, window.location.origin);
      if (url.origin === window.location.origin) {
        return { redirect: url.pathname + url.search };
      }
    } catch {
      /* malformed, fall through */
    }
    return { redirect: "/" };
  },
  beforeLoad: ({ context, search }) => {
    if (context.auth.status === "signedIn") {
      throw redirect({ href: search.redirect });
    }
  },
  component: AuthForm,
});

const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authed",
  beforeLoad: ({ context, location }) => {
    if (context.auth.status !== "signedIn") {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/",
  beforeLoad: async () => {
    const { data } = await supabase
      .from("memberships")
      .select("org_id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (data) {
      throw redirect({
        to: "/orgs/$orgId/projects",
        params: { orgId: data.org_id },
      });
    }
  },
  component: () => (
    <p className="text-sm text-muted-foreground">No organisations found.</p>
  ),
});

const orgLayoutRoute = createRoute({
  getParentRoute: () => authedRoute,
  id: "orgLayout",
  component: OrgSidebar,
});

const projectsRoute = createRoute({
  getParentRoute: () => orgLayoutRoute,
  path: "/orgs/$orgId/projects",
  component: Projects,
});

const drawingsRoute = createRoute({
  getParentRoute: () => orgLayoutRoute,
  path: "/orgs/$orgId/projects/$projectId/drawings",
  component: Drawings,
});

const importRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/drawings/$drawingId",
  component: Import,
});

const viewerRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/pages/$pageId",
  component: Viewer,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  authedRoute.addChildren([
    indexRoute,
    importRoute,
    viewerRoute,
    orgLayoutRoute.addChildren([projectsRoute, drawingsRoute]),
  ]),
]);

export const router = createRouter({
  routeTree,
  context: { auth: { status: "loading" } },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
