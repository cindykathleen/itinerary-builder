import type { KeyboardEvent } from "react";

export function closeDialogOnEscape(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key === "Escape") {
    event.currentTarget.close();
  }
}
