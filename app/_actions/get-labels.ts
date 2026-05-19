'use server'

import { fetchLabels } from "@/app/_lib/db/labels";

export async function getLabels() {
  return fetchLabels();
}
