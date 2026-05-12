import { useEffect, useRef, useState } from "react";

const VALID = /^-?\d*[.,]?\d*$/;

function format(v) {
  if (v == null || v === "" || (typeof v === "number" && Number.isNaN(v))) return "";
  return String(v).replace(".", ",");
}

function parse(s) {
  if (s == null || s === "" || s === "-" || s === "," || s === ".") return NaN;
  return parseFloat(s.replace(",", "."));
}

export default function NumberInput({ value, onChange, ...props }) {
  const [text, setText] = useState(() => format(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(format(value));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        setText(format(value));
      }}
      onChange={e => {
        const raw = e.target.value;
        if (raw !== "" && !VALID.test(raw)) return;
        setText(raw);
        const n = parse(raw);
        onChange(Number.isFinite(n) ? n : null);
      }}
      {...props}
    />
  );
}
