"use client";

import { useRef, useState, useTransition } from "react";
import { COVER_MAX_BYTES } from "@/lib/cover-url";
import { removeItineraryCover, uploadItineraryCover } from "./actions";
import styles from "./CoverControls.module.css";

const ACCEPT = "image/jpeg,image/png,image/webp";

export default function CoverControls({
  itineraryId,
  photoUrl,
}: {
  itineraryId: string;
  photoUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const chooseFile = () => {
    inputRef.current?.click();
  };

  const upload = (file: File | undefined) => {
    if (!file) {
      return;
    }

    if (file.size > COVER_MAX_BYTES) {
      setError("Cover images must be 5 MB or smaller.");
      return;
    }

    const formData = new FormData();
    formData.set("id", itineraryId);
    formData.set("file", file);
    startTransition(async () => {
      const result = await uploadItineraryCover(formData);
      setError(result?.error ?? "");
    });
  };

  const remove = () => {
    const formData = new FormData();
    formData.set("id", itineraryId);
    startTransition(async () => {
      try {
        await removeItineraryCover(formData);
        setError("");
      } catch (removeError) {
        setError(removeError instanceof Error ? removeError.message : "The cover could not be removed.");
      }
    });
  };

  return (
    <div className={styles.dialog}>
      <input
        ref={inputRef}
        className={styles.file}
        type="file"
        accept={ACCEPT}
        disabled={pending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          upload(file);
        }}
      />
      <div className={styles.actions}>
        <button className="primary" type="button" onClick={chooseFile} disabled={pending}>
          {photoUrl ? "Edit cover photo" : "Upload cover photo"}
        </button>
        {photoUrl ? (
          <button className={`secondary ${styles.remove}`} type="button" onClick={remove} disabled={pending}>
            Remove
          </button>
        ) : null}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
