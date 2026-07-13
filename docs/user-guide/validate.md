# Using the Validate page

Validate is for anyone checking this platform's work — a commissioner deciding whether to cite a number in public testimony, a researcher deciding whether to reuse a method, or anyone who wants to know what a score does and doesn't prove. Every tab leads with a plain-language summary; the exact numbers behind it are always one click away.

## Data coverage

A summary of every published source this platform draws on and its current freshness — how many are recently checked, on their normal publication schedule, overdue for a refresh, or currently unavailable. For the full detail on any one source (publisher, exact vintage, license, and a live preview of its data), follow the link to the Data page.

## Scoring methods

A four-step, plain-language explanation of how a combined score is built (metric → subdomain/domain → scenario weighting → uncertainty), followed by the real metric registry (expand any domain to see every contributing measure, its definition, and its source) and a table of exactly what weight each named scenario gives each factor.

## Uncertainty & sensitivity

Pick a scenario to see how many places currently have "Robust," "Moderately stable," or "Assumption-sensitive" rankings under it, and how that scenario's ranking would change under five alternate, fixed weightings (a high correlation means the ranking holds up regardless of which of those weightings is used; a lower one means it's more sensitive to the exact priorities chosen).

## Validation

Two independent checks, run against every scenario: does its score agree with an established social-vulnerability index (a check against a related, but separately-built, measure), and does it agree with modeled emergency-department utilization (a check against an actual outcome, not just a related index). Both checks are screened by a tautology guard before they run — a check that would compare a score against its own input is blocked outright and shown as "BLOCKED," never silently computed into a misleading number. Neither check is causal evidence.

## Known limitations

Every limitation this platform is aware of, stated in one place — including gaps that are still open, not only ones already worked around. Read this before citing any number from this platform in a decision or a public document.

## Reproducibility

A record of exactly which weighting configuration produced a given result (a short hash per scenario — two sessions reporting the same hash for the same scenario are guaranteed to be using identical weights), the random seeds behind every uncertainty calculation (so results can be regenerated exactly), the current pass/fail status of this platform's own automated data-quality checks, and a history of recent data-pipeline runs.

## What Validate cannot tell you

- Whether any score is "correct" in an absolute sense — validation here means internal consistency and agreement with independent checks, not ground truth.
- Whether this platform's methods generalize to a county other than Santa Clara — every check here is specific to this county's data and geography.
- A guarantee that a passing audit or a strong correlation means a recommendation elsewhere on the platform will work in practice — see each page's own limitations for what its specific numbers do and don't establish.
