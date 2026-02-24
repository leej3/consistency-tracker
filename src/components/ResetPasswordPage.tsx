import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabase";

export const ResetPasswordPage = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!password) {
      setError("Enter a new password.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage("Password updated. You are now signed in.");
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <main className="auth-shell">
      <h1>Set New Password</h1>
      <form className="card" onSubmit={handleSubmit}>
        <label>
          New password
          <input
            type="password"
            value={password}
            required
            autoComplete="new-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            value={confirmPassword}
            required
            autoComplete="new-password"
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>
        <button disabled={isLoading} type="submit">
          {isLoading ? "Updating..." : "Update password"}
        </button>
        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}
      </form>
    </main>
  );
};
