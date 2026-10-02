import DayHeader from "./DayHeader";
import styles from "./ItineraryTimeline.module.css";

type TimelineDay = {
  iso: string;
  label: string;
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function listDays(start: string, end: string): TimelineDay[] {
  const days: TimelineDay[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);

  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) {
    return days;
  }

  while (cursor.getTime() <= last.getTime()) {
    days.push({
      iso: cursor.toISOString().slice(0, 10),
      label: `${WEEKDAYS[cursor.getUTCDay()]}, ${cursor.getUTCMonth() + 1}/${cursor.getUTCDate()}`,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function listSlots(start: string, end: string, interval: number) {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);

  if (
    startMinutes === null ||
    endMinutes === null ||
    endMinutes < startMinutes ||
    (interval !== 30 && interval !== 60)
  ) {
    return [];
  }

  const slots: number[] = [];

  for (let minutes = startMinutes; minutes <= endMinutes; minutes += interval) {
    slots.push(minutes);
  }

  if (slots[slots.length - 1] !== endMinutes) {
    slots.push(endMinutes);
  }

  return slots;
}

function formatTime(minutes: number, timeFormat: string) {
  const hours = Math.floor(minutes / 60);
  const mins = String(minutes % 60).padStart(2, "0");

  if (timeFormat === "24h") {
    return `${String(hours).padStart(2, "0")}:${mins}`;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;

  return `${hour12}:${mins} ${period}`;
}

export default function ItineraryTimeline({
  itineraryId,
  dateStart,
  dateEnd,
  dayStart,
  dayEnd,
  timeInterval,
  timeFormat,
  daySettings,
}: {
  itineraryId: string;
  dateStart: string;
  dateEnd: string;
  dayStart: string;
  dayEnd: string;
  timeInterval: number;
  timeFormat: string;
  daySettings: { date: string; heading: string | null }[];
}) {
  const days = listDays(dateStart, dateEnd);
  const slots = listSlots(dayStart, dayEnd, timeInterval);
  const headings = new Map(
    daySettings.map((day) => [day.date, day.heading?.trim() ?? ""]),
  );

  return (
    <section className={styles.timeline} aria-label="Timeline">
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.corner} scope="col">
              <span className={styles.srOnly}>Time</span>
            </th>
            {days.map((day) => (
              <th key={day.iso} className={styles.day} scope="col">
                <DayHeader
                  itineraryId={itineraryId}
                  date={day.iso}
                  label={day.label}
                  heading={headings.get(day.iso) ?? ""}
                />
                <div className={styles.date}>{day.label}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((minutes) => (
            <tr key={minutes}>
              <th className={styles.time} scope="row">
                {formatTime(minutes, timeFormat)}
              </th>
              {days.map((day) => (
                <td key={day.iso} className={styles.cell} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
