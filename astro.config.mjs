import { defineConfig } from "astro/config";
import { site } from "./src/config.js";

export default defineConfig({
  site: site.url,
  redirects: {
    "/portfolio": "/portfolio/us/",
  },
});
