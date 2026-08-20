/**
 * The wordmark echoes the poster's "pillars" lockup: lowercase geometric sans
 * with a bar riding over the middle letters. Drawn rather than set, so the
 * overline lands on the same letters at every size.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-block font-light tracking-tight ${className}`}>
      h
      <span className="relative">
        <span
          aria-hidden
          className="absolute left-[0.04em] right-[0.04em] rounded-full bg-net-100"
          style={{ top: "-0.06em", height: "0.05em" }}
        />
        oo
      </span>
      ps&amp;hasanat
    </span>
  );
}

/** A single hoop, traced from the poster's rim-and-net crop. */
export function HoopMark({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <ellipse cx="24" cy="15" rx="16" ry="5.5" stroke="#c4472f" strokeWidth="2.6" />
      <path
        d="M9 16c1.5 9 4.5 17 8 22M39 16c-1.5 9-4.5 17-8 22M15 18.5c.8 8 2.2 15.5 4 20.5M33 18.5c-.8 8-2.2 15.5-4 20.5M24 20.5V40"
        stroke="#f4f1ea"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M11 23h26M13 30h22M16 36h16"
        stroke="#f4f1ea"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}
