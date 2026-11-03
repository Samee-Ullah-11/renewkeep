// Status badge: colour AND a text label, so status never relies on colour alone.
const LABELS = {
  expired: "Expired",
  red: "Urgent",
  amber: "Due soon",
  green: "OK",
};

export default function StatusBadge({ status, daysLeft }) {
  let text = LABELS[status] || status;
  if (status === "expired" && daysLeft !== undefined)
    text = `Expired ${Math.abs(daysLeft)}d ago`;
  else if ((status === "red" || status === "amber") && daysLeft !== undefined)
    text = `${text} · ${daysLeft}d`;
  return <span className={`badge badge-${status}`}>{text}</span>;
}
