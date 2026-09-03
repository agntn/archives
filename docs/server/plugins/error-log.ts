/** Print server error stacks, so a 500 on the worker is traceable from the Workers logs instead of a bare status. */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("error", (error) => {
    console.error("[docs:error]", error instanceof Error ? (error.stack ?? error.message) : error);
  });
});
