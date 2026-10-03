import { setConfig } from "@agntn/archives";

/** The site has no config files, so the library takes its defaults without looking for any. */
export default defineNitroPlugin(() => {
  setConfig();
});
