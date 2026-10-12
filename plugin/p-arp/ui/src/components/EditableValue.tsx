// A displayed value that can be typed in: double-click to edit, Enter (or click away) to apply,
// Escape to cancel. Out-of-range values are clamped by the caller's onCommit.

import { useEffect, useRef, useState } from "react";

interface EditableValueProps {
  value: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
  className?: string;
  title?: string;
}

export function EditableValue({ value, format, onCommit, className = "", title }: EditableValueProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = () => {
    const number = parseFloat(text.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(number)) onCommit(number);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={input}
        className={`editable-input ${className}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
          e.stopPropagation();
        }}
        onBlur={commit}
        onPointerDown={(e) => e.stopPropagation()}
        autoFocus
      />
    );
  }
  return (
    <span
      className={`editable ${className}`}
      title={title ?? "Double-click to type a value"}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setText(String(value));
        setEditing(true);
      }}
    >
      {format(value)}
    </span>
  );
}
