"use client";

import { SubmitEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import PublicNav from "@/components/PublicNav";
import styles from "./page.module.css";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const fieldsFilled = email.trim() !== "" && password !== "";
  const canSubmit = fieldsFilled && !isLoading;

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError("");

    if (!fieldsFilled) {
      return;
    }

    setIsLoading(true);

    const { error } = await authClient.signIn.email({
      email,
      password,
    });

    if (error) {
      setError(error.message ?? "Sign-in unsuccessful.");
      setIsLoading(false);
      return;
    }

    router.push("/itineraries");
  };

  return (
    <PublicNav>
      <main className={styles.card}>
        <section className={styles.formPanel}>
          <h1>Welcome Back</h1>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label htmlFor="email">
                Email <span className="required">*</span>
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="password">
                Password <span className="required">*</span>
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error ? <p className={styles.error}>{error}</p> : null}

            <button className="primary" type="submit" disabled={!canSubmit}>
              {isLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </section>

        <div className={styles.panel} aria-hidden="true" />
      </main>
    </PublicNav>
  );
}
