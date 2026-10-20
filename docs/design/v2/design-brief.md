# Design v2 brief

Branch: `design/v2-redesign` (production `main` is untouched). Goal: make the product read as one clear idea, feel hand-made and calm, and be usable by someone with no statistics background.

## The one idea

> Where in Santa Clara County does health need the most support, and why?

Everything on the home screen serves that sentence: a map, a way to say what matters to you, a short list of where to look first, and a plain-language "why" for any neighborhood you pick. Everything else (access to care, advocacy tools, methods) is a clearly named next step, not a competing destination.

## What the research says

Sources are linked so each decision can be checked.

**Navigation and structure**
- Public-health dashboard reviews rank *easy navigation*, *simplicity*, *clear descriptions* and *accessible data tables* at the top of best practices, and recommend a summary first with drill-down paths. ([review of 100 COVID dashboards](https://perspectives.ahima.org/page/best-practices-for-the-design-of-covid-19-dashboards); [scoping review, BMC Public Health](https://bmcpublichealth.biomedcentral.com/articles/10.1186/s12889-024-17841-2/tables/2))
- Nine sidebar destinations is past the point where a sidebar helps. Group by the *job* the user is doing, and push rarely-used items out of the primary level. ([jobs-to-be-done IA notes](https://nastengraph.substack.com/p/jobs-to-be-done-a-user-centered-approach))
- With only a handful of destinations, a top bar fits better than a sidebar; on phones, three to five bottom tabs. ([navigation pattern overview](https://uxplanet.org/bottom-tab-bar-navigation-design-best-practices-48d46a3b0c36))

**What the best civic data explorers do**
- Opportunity Atlas, Tree Equity Score and County Health Rankings all open on a map, give a search box first, expose a small number of controls that map to plain questions ("Where / What / Who"), explain terms in place with info icons, and keep advanced modes optional. ([Opportunity Atlas guide](https://opportunityinsights.org/atlasresources/); [Tree Equity Score](https://analyzer.treeequityscore.org/); [County Health Rankings design change](https://www.countyhealthrankings.org/findings-and-insights/blog/announcing-chrrs-2025-data-viz-challenge))
- Map-first layouts work with a persistent, non-modal side panel that keeps the map interactive, and a synced list. On phones the panel becomes a bottom sheet with peek / list / detail stops. ([bottom sheet pattern](https://vp0.com/blogs/draggable-bottom-sheet-map-modal))

**What makes an interface look "built by an engineer" or off a template**
- Overused default fonts (Inter, Geist), identical card grids, cards inside cards, icon tiles above headings, tiny labels above headings, hairline border plus wide shadow, cream/beige by reflex, hero-metric blocks, tiny UI text, flat type hierarchy.
- Hand-made feel comes from: choosing a direction before coding, type that fits the product, color chosen for the emotional job, varied layout by content, a few deliberate motion moments, and copy written for the reader.

**Color**
- One accent plus neutrals; never color alone to carry meaning. Sequential data gets a sequential ramp; limit classes to five or six. ([Datawrapper on data colors](https://www.datawrapper.de/blog/colors-for-data-vis-style-guides))
- Warm sequential ramps (ColorBrewer YlOrRd family) read naturally as "more", are colorblind-safe, and avoid the red/green pair that fails for many readers. Check with a simulator. ([choropleth palette guidance](https://www.designyourway.net/blog/map-color-palettes/); [viridis vignette](https://cran.r-project.org/web/packages/viridis/vignettes/intro-to-viridis.html))

**Type**
- Serif for headlines, a plain sans for UI and numbers is the established editorial pairing (Our World in Data uses Playfair Display with Lato). Public Sans has direct government precedent (California's state web template). Newsreader is a free serif built for screens with optical sizes. ([Datawrapper on fonts](https://datawrapper.de/blog/fonts-for-data-visualization); [CA state template typography](https://template.webstandards.ca.gov/visual-design/typography.html))

**Words**
- Titles state the takeaway, not the topic. Annotate the one point that matters. Keep uncertainty visible. ([action titles](https://www.think-cell.com/en/blog/how-to-tell-a-better-data-story-one-slide-at-a-time))

## Decisions

### Navigation: nine items become four

| New | Replaces | Question it answers |
|---|---|---|
| **Map** `/` | Overview, Explore, Prioritize | Where is need highest, and why? |
| **Getting to care** `/care` | Access Lab, Utilization | How do people reach care, and how is it used? |
| **Take action** `/act` | Advocate, Copilot | What do I do with this? |
| **About the data** `/about` | Validate, Data | Can I trust it? Where does it come from? |

Old URLs keep working (redirects preserve query strings), so every shared link survives. Nothing is deleted: advanced ranking tools stay reachable from the map panel instead of being a top-level tab. A quiet "sources current" signal moves to the footer of the map panel and the About page.

### Layout
- Slim top bar: wordmark left, four links, one search button. No sidebar.
- Map page: full-bleed map under the bar. A single left column holds all state: *browse* (question, search, focus picker, where to look first) swaps to *neighborhood* (plain headline, top reasons, where it sits among all 408 tracts, evidence). One panel at a time, so nothing stacks and pushes content down.
- Phones: the same column becomes a bottom sheet.

### Look
- **Type:** Newsreader for headlines and large numerals, Public Sans for everything else. Type floor raised: body 16px, secondary 14px, nothing below 13px. Tabular numerals for data.
- **Color ("Valley"):** deep spruce for brand and interaction, near-white cool paper surfaces, ink text; the single warm color is apricot, reserved for the map's concern ramp and key highlights. Concern ramp: pale butter, apricot, burnt orange, brick, deep wine (five classes, colorblind-safe, with a hatched pattern for "no score"). Status uses text plus icon, not color alone.
- **Shape:** one radius family, no nested cards, separation by whitespace and tint, elevation only for floating panels over the map.
- **Motion:** short (150 to 250ms) ease-out transitions for panel swaps, map recolor on focus change, and list/map hover sync. No bounce, no decorative loops. Respects reduced motion.

### Signature element
A **county strip**: all 408 tracts as thin ticks along one line, ordered by score, with the selected tract marked and labeled in words ("higher than 82% of tracts"). It answers "how unusual is this place?" at a glance and is built from data already loaded.

## Non-goals
No backend, data, scoring or methodology changes. No change to citations, uncertainty or non-causal language; those move, they are not removed.

## Verification gate
Typecheck, lint, unit tests, production build, updated Playwright suite, axe at every breakpoint, plus a manual visual pass on each page at 1440, 1024, 768 and 390 px.
