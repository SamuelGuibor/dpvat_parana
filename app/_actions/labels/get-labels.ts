'use server'

import { fetchLabels } from "@/app/_shared/lib/db/labels";

export async function getLabels() {
  return fetchLabels();
}
