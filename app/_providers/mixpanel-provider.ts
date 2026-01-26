"use client";

import { useEffect } from "react";
import { initMixpanel } from "@/app/_lib/mixpanel";

export function MixpanelProvider() {
  useEffect(() => {
    initMixpanel();
  }, []);

  return null;
}
