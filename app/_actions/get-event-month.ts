import { fetchEventsByMonth } from "@/app/_lib/db/botconversa";

export async function getEventsByMonth(year = new Date().getFullYear()) {
  return fetchEventsByMonth(year);
}
