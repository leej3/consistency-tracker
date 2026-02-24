import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { Dashboard } from "./components/Dashboard";
import { LoginPage } from "./components/LoginPage";
import { ResetPasswordPage } from "./components/ResetPasswordPage";

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [requiresPasswordReset, setRequiresPasswordReset] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const initializeSession = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      setSession(currentSession);
      setRequiresPasswordReset(
        Boolean(currentSession) && window.location.hash.includes("type=recovery"),
      );
      setInitializing(false);
    };

    void initializeSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);

      if (event === "PASSWORD_RECOVERY") {
        setRequiresPasswordReset(true);
      } else if (nextSession === null) {
        setRequiresPasswordReset(false);
      } else if (!window.location.hash.includes("type=recovery")) {
        setRequiresPasswordReset(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (initializing) {
    return <p className="centered">Starting…</p>;
  }

  if (requiresPasswordReset && session) {
    return <ResetPasswordPage />;
  }

  if (!session) {
    return <LoginPage />;
  }

  return <Dashboard session={session} />;
};

export default App;
