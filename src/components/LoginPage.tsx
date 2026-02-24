import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabase";

const ALLOWED_EMAILS = ["johnlee3@gmail.com", "emily.langhorne@gmail.com"];

const isAllowedEmail = (value: string) => ALLOWED_EMAILS.includes(value.trim().toLowerCase());

export const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsLoading(true);

    if (!isAllowedEmail(email)) {
      setError("Only the two configured admin accounts are allowed.");
      setIsLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
    } else {
      setError("");
    }

    setIsLoading(false);
  };

  const handlePasswordReset = async () => {
    setError("");
    setSuccess("");
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Enter your email first.");
      return;
    }

    if (!isAllowedEmail(normalizedEmail)) {
      setError("Only the two configured admin accounts are allowed.");
      return;
    }

    setIsResetLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}`,
    });

    if (resetError) {
      setError(resetError.message);
    } else {
      setSuccess("Password reset email sent.");
    }

    setIsResetLoading(false);
  };

  return (
    <main className="auth-shell">
      <h1>Consistency Tracker</h1>
      <p>Sign in with your Supabase-authenticated account.</p>
      <form className="card" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            required
            autoComplete="username"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            required
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button disabled={isLoading} type="submit">
          {isLoading ? "Signing in..." : "Sign in"}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={handlePasswordReset}
          disabled={isResetLoading}
        >
          {isResetLoading ? "Sending reset email..." : "Forgot password?"}
        </button>
        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
      </form>
      <p className="muted">Use the two pre-created admin accounts only; no public sign up.</p>
    </main>
  );
};
