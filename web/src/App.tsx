import { useEffect, useState } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { supabase } from "./lib/supabase";
import { router, type Auth } from "./router";
import { Button } from "@/components/ui/button";

function App() {
  const [auth, setAuth] = useState<Auth>({ status: "loading" });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuth(
        session ? { status: "signedIn", session } : { status: "signedOut" },
      );
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (auth.status !== "loading") router.invalidate();
  }, [auth]);

  if (auth.status === "loading") return null;

  return (
    <div className="flex h-svh flex-col">
      {auth.status === "signedIn" && (
        <header className="flex shrink-0 items-center gap-3 border-b px-3 py-1.5">
          <span className="text-sm font-medium">Quantity surveyor</span>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {auth.session.user.email}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => supabase.auth.signOut()}
          >
            sign out
          </Button>
        </header>
      )}
      <main className="flex min-h-0 flex-1 flex-col">
        <RouterProvider router={router} context={{ auth }} />
      </main>
    </div>
  );
}

export default App;
