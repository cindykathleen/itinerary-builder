"use client";

import { useRef, useState } from "react";
import dialogStyles from "./dialog.module.css";

const SECTION_DRAG = "application/x-section-order";

type SectionItem = {
  key: string;
  id?: string | null;
  name: string;
};

function reorderSections<T extends SectionItem>(sections: T[], fromKey: string, toKey: string) {
  if (fromKey === toKey) {
    return sections;
  }

  const from = sections.findIndex((section) => section.key === fromKey);
  const to = sections.findIndex((section) => section.key === toKey);

  if (from < 0 || to < 0) {
    return sections;
  }

  const next = [...sections];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function SectionListEditor<T extends SectionItem>({
  sections,
  labelledBy,
  describedBy,
  withIds = false,
  canAdd,
  onChange,
  onAdd,
}: {
  sections: T[];
  labelledBy: string;
  describedBy: string;
  withIds?: boolean;
  canAdd: boolean;
  onChange: (sections: T[]) => void;
  onAdd: () => void;
}) {
  const draggedKey = useRef<string | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  const clearDrag = () => {
    draggedKey.current = null;
    setDraggingKey(null);
    setDropKey(null);
  };

  return (
    <div className={dialogStyles.sectionList} role="group" aria-labelledby={labelledBy}>
      {sections.map((section, index) => {
        const label = section.name.trim() || `section ${index + 1}`;

        return (
          <div
            key={section.key}
            className={dialogStyles.sectionRow}
            data-dragging={draggingKey === section.key || undefined}
            data-drop={dropKey === section.key && draggingKey !== section.key ? true : undefined}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(SECTION_DRAG)) {
                return;
              }

              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropKey(section.key);
            }}
            onDrop={(event) => {
              if (!event.dataTransfer.types.includes(SECTION_DRAG)) {
                return;
              }

              event.preventDefault();
              const fromKey = draggedKey.current;

              if (fromKey) {
                onChange(reorderSections(sections, fromKey, section.key));
              }

              clearDrag();
            }}
          >
            {withIds ? <input type="hidden" name="sectionIds" value={section.id ?? ""} /> : null}
            <input
              name="sections"
              type="text"
              value={section.name}
              maxLength={40}
              aria-label={`Section ${index + 1}`}
              aria-describedby={describedBy}
              onChange={(event) =>
                onChange(
                  sections.map((item) =>
                    item.key === section.key ? { ...item, name: event.target.value } : item,
                  ),
                )
              }
            />
            <span
              className={dialogStyles.sectionDrag}
              draggable
              role="button"
              tabIndex={0}
              aria-label={`Reorder ${label}`}
              onDragStart={(event) => {
                draggedKey.current = section.key;
                setDraggingKey(section.key);
                event.dataTransfer.setData(SECTION_DRAG, section.key);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={clearDrag}
              onKeyDown={(event) => {
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
                  return;
                }

                event.preventDefault();
                const nextIndex = index + (event.key === "ArrowUp" ? -1 : 1);
                const target = sections[nextIndex];

                if (target) {
                  onChange(reorderSections(sections, section.key, target.key));
                }
              }}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <circle cx="5" cy="3.5" r="1.15" fill="currentColor" />
                <circle cx="11" cy="3.5" r="1.15" fill="currentColor" />
                <circle cx="5" cy="8" r="1.15" fill="currentColor" />
                <circle cx="11" cy="8" r="1.15" fill="currentColor" />
                <circle cx="5" cy="12.5" r="1.15" fill="currentColor" />
                <circle cx="11" cy="12.5" r="1.15" fill="currentColor" />
              </svg>
            </span>
            <button
              className={dialogStyles.sectionRemove}
              type="button"
              aria-label={`Remove ${label}`}
              disabled={sections.length === 1}
              onClick={() => {
                const message = section.name.trim()
                  ? `Remove “${section.name.trim()}”?`
                  : "Remove this section?";

                if (!window.confirm(message)) {
                  return;
                }

                onChange(sections.filter((item) => item.key !== section.key));
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        );
      })}
      <button
        className={dialogStyles.sectionAdd}
        type="button"
        aria-label="Add section"
        disabled={!canAdd}
        onClick={onAdd}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
