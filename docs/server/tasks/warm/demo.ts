/** Warms the coverage cache for the demo targets, so the dashboards answer instantly on stage. */
export default defineTask({
  meta: {
    name: "warm:demo",
    description: "Refresh cross-archive coverage for the demo targets",
  },
  async run() {
    const warmed: string[] = [];
    for (const target of DEMO_TARGETS) {
      await coverage(target);
      warmed.push(target);
    }
    return { result: warmed };
  },
});
