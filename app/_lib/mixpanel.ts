import mixpanel from "mixpanel-browser";

export const initMixpanel = () => {
  if (typeof window === "undefined") return;

  mixpanel.init("3a16647810beddeb9b99612b7af13120", {
    debug: true, // MUITO IMPORTANTE para testar
    track_pageview: true,
    persistence: "localStorage",
  });
};

export default mixpanel;
