"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function SignOutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const signOut = async () => {
    setIsLoading(true);

    const { error } = await authClient.signOut();

    if (error) {
      setIsLoading(false);
      return;
    }

    router.push("/sign-in");
    router.refresh();
  };

  return (
    <button className="secondary" type="button" onClick={signOut} disabled={isLoading}>
      {isLoading ? "Signing out..." : "Sign out"}
    </button>
  );
}
