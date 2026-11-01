"use client";

import { useEffect, useState } from "react";
import { inputClass } from "./form";

// Search box + debounce shared by the Users, Tasks, Subjects and Courses
// lists. Debouncing keeps typing smooth (and, for admin Users, means one API
// request per pause instead of one per keystroke).

export const SEARCH_DEBOUNCE_MS = 250;

export function useDebounced<T>(value: T, delay = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// Case-insensitive "contains" across the given fields. null/undefined fields
// (e.g. a task with no subject) are skipped.
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => !!f && f.toLowerCase().includes(q));
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
  shown,
  total,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  // Optional "3 of 12" counter once a query narrows the list.
  shown?: number;
  total?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        maxLength={100}
        className={inputClass(null, "w-full text-sm sm:w-64")}
      />
      {value.trim() && shown !== undefined && total !== undefined && (
        <span className="text-xs text-text-muted" aria-live="polite">
          {shown} of {total} shown
        </span>
      )}
    </div>
  );
}
