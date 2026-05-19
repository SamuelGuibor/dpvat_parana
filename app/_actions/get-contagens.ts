import { fetchEventsCount } from "@/app/_lib/db/botconversa";

export async function getEventsCount() {
  return fetchEventsCount();
}
