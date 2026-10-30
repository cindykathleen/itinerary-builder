"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import styles from "./PublicNav.module.css";

export default function PublicNav({
  children,
}: {
  children?: ReactNode;
}) {
  return (
    <div className={`page ${styles.shell}`}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Itinerary Builder
        </Link>
        <nav className={styles.nav}>
          <Link href="/sign-in" className={styles.signIn}>
            Sign In
          </Link>
          <Link href="/sign-up" className="primary">
            Sign Up
          </Link>
        </nav>
      </header>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
