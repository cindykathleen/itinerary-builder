"use client";

import { SubmitEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import PublicNav from "@/components/PublicNav";
import styles from "./page.module.css";

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const fieldsFilled =
    name.trim() !== "" &&
    email.trim() !== "" &&
    password !== "" &&
    confirmPassword !== "";
  const passwordsMatch = password === confirmPassword;
  const showPasswordMismatch =
    password.length > 0 && confirmPassword.length > 0 && !passwordsMatch;
  const canSubmit = fieldsFilled && passwordsMatch && !isLoading;

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError("");

    if (!fieldsFilled || !passwordsMatch) {
      return;
    }

    setIsLoading(true);

    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
    });

    if (error) {
      setError(error.message ?? "Sign-up unsuccessful.");
      setIsLoading(false);
      return;
    }

    router.push("/itineraries");
  };

  return (
    <PublicNav>
      <main className={styles.card}>
        <section className={styles.formPanel}>
          <h1>Create a New Account</h1>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label htmlFor="name">
                Name <span className="required">*</span>
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="confirm-password">
                Confirm your password <span className="required">*</span>
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
                aria-invalid={showPasswordMismatch || undefined}
                aria-describedby={
                  showPasswordMismatch ? "password-mismatch" : undefined
                }
              />
              {showPasswordMismatch ? (
                <p id="password-mismatch" className={styles.hint} role="alert">
                  Passwords do not match.
                </p>
              ) : null}
            </div>

            {error ? <p className={styles.error}>{error}</p> : null}

            <button className="primary" type="submit" disabled={!canSubmit}>
              {isLoading ? "Creating account..." : "Sign Up"}
            </button>
          </form>
        </section>

        <div className={styles.panel} aria-hidden="true" />
      </main>
    </PublicNav>
  );
}
