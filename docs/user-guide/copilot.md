# Using the Copilot page

Copilot answers specific questions about a place using this platform's own evidence — it is a guided way to ask for a summary, a comparison, or a set of meeting questions, not a general-purpose chatbot and not a source of new data.

## Two modes, always disclosed

Copilot runs in one of two modes, and the response always states plainly which one produced it:

- **Deterministic mode** (labeled "Deterministic (not AI-generated)") is always available, requires no configuration, and works identically whether or not this platform's operator has configured an AI provider. It assembles its answer from fixed templates over the same evidence used everywhere else on this platform — the exact same generation functions the Advocate page's brief builder uses, not a second, different implementation.
- **AI-assisted mode** is only available when this platform's operator has configured a server-side AI provider (currently: Anthropic, via the `ANTHROPIC_API_KEY` environment variable). If no provider is configured, Copilot works exactly as well in deterministic mode — you are never shown a broken interface or asked to supply your own API key.

Ordinary use of this platform never requires an AI provider key. If you don't see an option to use AI-assisted mode, it simply means this deployment doesn't have one configured, and deterministic mode remains fully functional.

## Asking a question

1. Search for and select a place, exactly as on Explore.
2. Choose an action: summarize this geography, explain why it's prioritized, prepare meeting questions, compare two geographies, connect a document to local evidence, draft a public comment, draft a commissioner briefing, list what cannot be concluded, identify missing evidence, or rewrite a response for a public audience.
3. Click **Ask Copilot**.

Every response shows the evidence it drew on (each item's value, source, and vintage), and — in AI-assisted mode — an explicit "Evidence used" citation list the platform independently verifies against what was actually provided. If the AI-assisted mode's response claims to have used an evidence item it was never given, that citation is silently dropped before you see it — the platform never displays a citation to evidence that doesn't exist.

## What Copilot will never do

- State or imply that a measure or score proves causation, predicts an individual's risk, or guarantees an intervention's impact.
- Answer with a number it computed itself rather than one this platform's tested analytics already produced — every numeric answer traces to a real analytics tool or a read-only query, never freehand model arithmetic (`CLAUDE.md`).
- Follow instructions found inside an uploaded document. Document text is always treated as data to describe, never as commands to the application or the model — see [Document Intelligence](../methods/document-intelligence.md) for how this is enforced and tested.
- Send your document or query to an AI provider unless AI-assisted mode is both configured by the operator and selected for that specific request; deterministic mode never leaves this platform's own server.
- Retain your conversation for training. AI-assisted requests are stateless, evidence-scoped calls — no chat history is sent beyond what a single request needs.

## What Copilot cannot tell you

The same limits as the rest of this platform apply here: every answer is a screening signal built from disclosed measurements, not a causal finding, an individual risk estimate, or a validated program recommendation.
