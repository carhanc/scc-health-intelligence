/** Geometry is fetched once, for this scenario, and reused for every focus
 * area. Scores for any other focus arrive separately and are painted onto
 * the same polygons, so switching focus never re-downloads the ~3 MB
 * boundary file. Kept apart from the map module so panels can import it
 * without pulling MapLibre into their bundle. */
export const BASE_GEOMETRY_SCENARIO = "default_integrated_screen_v1";
