import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { hotelMessage, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "up"
          ? await authClient.signUp.email({ email, password, name: name || email })
          : await authClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message || "HOTEL:unknown");
      await authClient.getSession();
      await navigate({ to: "/stay" });
    } catch (err) {
      setError(hotelMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main" className="wrap grid min-h-[70vh] place-items-center pb-16">
      <div className="card w-full max-w-md">
        <h1 className="text-3xl">{t.signIn}</h1>
        <form className="mt-4 grid gap-3" onSubmit={onSubmit}>
          {mode === "up" ? (
            <label className="field">
              {t.name}
              <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" />
            </label>
          ) : null}
          <label className="field">
            {t.email}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label className="field">
            {t.password}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === "up" ? "new-password" : "current-password"}
            />
          </label>
          {error ? (
            <p className="danger" role="alert">
              {error}
            </p>
          ) : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {mode === "up" ? t.createAccount : t.signIn}
          </button>
        </form>
        <button type="button" className="btn btn-quiet mt-2 w-full" onClick={() => setMode(mode === "up" ? "in" : "up")}>
          {mode === "up" ? t.haveAccount : t.createAccount}
        </button>
      </div>
    </main>
  );
}
