import { describe, expect, it, vi } from "vitest";
import { closeDialogOnEscape } from "./dialog";

function escapeEvent(key: string, close: () => void) {
  return {
    key,
    currentTarget: { close },
  } as unknown as Parameters<typeof closeDialogOnEscape>[0];
}

describe("closeDialogOnEscape", () => {
  it("closes the dialog on Escape", () => {
    const close = vi.fn();

    closeDialogOnEscape(escapeEvent("Escape", close));

    expect(close).toHaveBeenCalledOnce();
  });

  it("leaves the dialog open for any other key", () => {
    const close = vi.fn();

    closeDialogOnEscape(escapeEvent("Enter", close));

    expect(close).not.toHaveBeenCalled();
  });
});
