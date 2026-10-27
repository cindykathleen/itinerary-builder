"use client";

import { useEffect } from "react";

export default function CloseMenusOnOutsideClick() {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      document.querySelectorAll("details[open]").forEach((menu) => {
        if (!menu.contains(target)) {
          menu.removeAttribute("open");
        }
      });
    };

    document.addEventListener("pointerdown", onPointerDown, true);

    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  return null;
}
