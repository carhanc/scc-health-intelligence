"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError, type DocumentAnalysisResponse, type DocumentTopicMatch } from "@/lib/api";
import { ADVOCACY_TERMS } from "@/lib/advocacy-terms";

const UPLOAD_WARNING =
  "Upload only documents you are authorized to use. Do not upload patient records, protected " +
  "health information, confidential personnel material, or other sensitive personal data.";

/** Finds a short, real excerpt for a detected topic by searching the
 * page-level text the backend already extracted for one of that topic's
 * own matched keywords -- never a fabricated summary. Returns null (no
 * excerpt shown) rather than guessing if no keyword is actually found in
 * any page's text. */
function findExcerpt(
  topic: DocumentTopicMatch,
  excerptByPage: Record<string, string>,
): { page: string; text: string } | null {
  for (const [page, text] of Object.entries(excerptByPage)) {
    for (const keyword of topic.matched_keywords) {
      const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
      if (idx === -1) continue;
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + keyword.length + 100);
      const snippet = (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
      return { page, text: snippet };
    }
  }
  return null;
}

/** Screen 1 of the document flow: "Choose a document" -- one upload
 * control, one plain explanation (docs/design/advocate-flow-
 * simplification-visual-review.md "DOCUMENT FLOW"). */
export function ChooseDocumentScreen({
  onAnalyzed,
}: {
  onAnalyzed: (result: DocumentAnalysisResponse) => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: (file: File) => api.analyzeDocument(file),
    onSuccess: (result) => onAnalyzed(result),
  });

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !acknowledged) return;
    mutation.mutate(file);
    event.target.value = "";
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{ADVOCACY_TERMS.findEvidenceInDocumentHeading}</h2>
      <p className="text-sm text-[var(--color-text-secondary)]">{ADVOCACY_TERMS.chooseDocumentExplainer}</p>

      <div className="rounded-[var(--radius-md)] border border-[var(--color-caution)] bg-[var(--color-caution-subtle)] p-3 text-sm text-[var(--color-caution-strong)]">
        {UPLOAD_WARNING}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5"
        />
        <span>I confirm this document contains no protected health information or other sensitive personal data, and I am authorized to use it.</span>
      </label>

      <div>
        <Button
          variant="secondary"
          disabled={!acknowledged || mutation.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          {ADVOCACY_TERMS.reviewDocumentCta}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md,.docx"
          className="hidden"
          onChange={handleFileChange}
          aria-label="Upload a meeting document"
        />
      </div>

      {mutation.isPending && (
        <LoadingRegion label="Reviewing document">
          <SkeletonText lines={4} />
        </LoadingRegion>
      )}
      {mutation.isError && (
        <ErrorState
          title="Could not analyze this document"
          description={
            mutation.error instanceof ApiError
              ? mutation.error.message
              : "The document could not be processed. Try a different file."
          }
        />
      )}
    </div>
  );
}

/** Screen 2: "Review useful passages" -- real excerpts with a page
 * reference and a plain reason, an Include toggle per passage, and an
 * honest no-match state. Included passages are folded into the
 * project's existing free-text notes (no new evidence-like data model
 * needed) so they flow into generation exactly like any other note. */
export function ReviewPassagesScreen({
  finding,
  includedTopicIds,
  onToggleTopic,
  onContinue,
}: {
  finding: DocumentAnalysisResponse;
  includedTopicIds: Set<string>;
  onToggleTopic: (topic: DocumentTopicMatch, excerpt: string | null) => void;
  onContinue: () => void;
}) {
  const availableTopics = finding.detected_topics.filter((t) => !t.unavailable_reason);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{ADVOCACY_TERMS.relevantPassagesHeading}</h2>
      <div>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{finding.filename}</p>
        {finding.injection_warnings.length > 0 && (
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            This document contains instruction-like text. It's treated as plain content to describe, never as
            instructions.
          </p>
        )}
      </div>

      {availableTopics.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">{ADVOCACY_TERMS.noRelevantPassages}</p>
      ) : (
        <>
          <p className="text-sm text-[var(--color-text-secondary)]">
            We found {availableTopics.length} passage{availableTopics.length === 1 ? "" : "s"} that may be
            useful.
          </p>
          <ul className="space-y-2">
            {availableTopics.map((topic) => {
              const excerpt = findExcerpt(topic, finding.excerpt_by_page);
              const isIncluded = includedTopicIds.has(topic.topic_id);
              return (
                <li
                  key={topic.topic_id}
                  className={`rounded-[var(--radius-lg)] border p-4 ${
                    isIncluded ? "border-[var(--color-interactive)] bg-[var(--color-interactive-subtle)]" : "border-[var(--color-border)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">{topic.label}</p>
                      {excerpt && (
                        <p className="mt-1 text-sm italic text-[var(--color-text-secondary)]">
                          &ldquo;{excerpt.text}&rdquo;
                        </p>
                      )}
                      <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)]">
                        {excerpt && `Page ${excerpt.page} · `}
                        {topic.scenarios.length > 0
                          ? `May relate to your project's focus area`
                          : "May be relevant to advocacy work in this area"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleTopic(topic, excerpt?.text ?? null)}
                      aria-pressed={isIncluded}
                      aria-label={`${isIncluded ? "Included" : "Include"} passage: ${topic.label}`}
                      className={`flex-none rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        isIncluded
                          ? "bg-[var(--color-interactive)] text-[var(--color-text-on-interactive)]"
                          : "border border-[var(--color-border-strong)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
                      }`}
                    >
                      {isIncluded ? "Included ✓" : "Include"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <button
        type="button"
        onClick={onContinue}
        className="rounded-[var(--radius-md)] bg-[var(--color-interactive)] px-5 py-2.5 text-sm font-medium text-[var(--color-text-on-interactive)] hover:bg-[var(--color-interactive-hover)]"
      >
        Continue
      </button>
    </div>
  );
}
