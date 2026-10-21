// MapLibre 6 runs its tile and GeoJSON work in a separate module worker. The
// Next.js bundler cannot resolve that worker file on its own, so copy the two
// files it needs into public/ and point MapLibre at them (see county-map.tsx).
// Runs before dev and build, so the copies always match the installed version.
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "..", "node_modules", "maplibre-gl", "dist");
const out = path.join(here, "..", "public", "maplibre");

mkdirSync(out, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  cpSync(path.join(dist, file), path.join(out, file));
}
