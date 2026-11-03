import { useEffect, useState } from "react";

// Three plain dropdowns — Day / Month / Year — instead of the browser's
// native date picker, which shows mm/dd/yyyy and confuses people.
// Emits "YYYY-MM-DD" (or "" while incomplete), so nothing else changes.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const THIS_YEAR = new Date().getFullYear();
// A few years back (overdue documents) through 15 years ahead (passports etc.)
const YEARS = Array.from({ length: 18 }, (_, i) => THIS_YEAR - 2 + i);

const parse = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : { y: "", m: "", d: "" };
};

const compose = ({ y, m, d }) =>
  y && m && d ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "";

export default function DateInput({ value, onChange, required = false }) {
  // Local state keeps partially chosen parts (e.g. month picked, day not yet)
  // alive; the composed ISO string only reaches the parent once complete.
  const [parts, setParts] = useState(() => parse(value));

  // Sync when the parent changes the value from outside (e.g. edit form load).
  useEffect(() => {
    if ((value || "") !== compose(parts)) setParts(parse(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const daysInMonth = parts.y && parts.m ? new Date(parts.y, parts.m, 0).getDate() : 31;

  function update(patch) {
    const next = { ...parts, ...patch };
    // Changing month/year can make the chosen day impossible (31 Feb) — clamp.
    if (next.y && next.m && next.d) {
      const max = new Date(next.y, next.m, 0).getDate();
      if (next.d > max) next.d = max;
    }
    setParts(next);
    onChange(compose(next));
  }

  return (
    <div className="date-parts">
      <select
        aria-label="Day"
        value={parts.d}
        onChange={(e) => update({ d: +e.target.value || "" })}
        required={required}
      >
        <option value="">Day</option>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <select
        aria-label="Month"
        value={parts.m}
        onChange={(e) => update({ m: +e.target.value || "" })}
        required={required}
      >
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>{name}</option>
        ))}
      </select>
      <select
        aria-label="Year"
        value={parts.y}
        onChange={(e) => update({ y: +e.target.value || "" })}
        required={required}
      >
        <option value="">Year</option>
        {YEARS.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </div>
  );
}
