"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Badge, Button, ErrorState, LoadingRegion, SkeletonText } from "@scc-health/ui";
import { api, ApiError, type DocumentAnalysisResponse } from "@/lib/api";

const UPLOAD_WARNING =
  "Upload only documents you are authorized to use. Do not upload patient records, protected " +
  "health information, confidential personnel material, or other sensitive personal data.";

/**
 * Document entry path (step 3 alternative to geography+issue). The
 * uploaded file is sent once to /api/v1/documents/analyze and never
 * persisted -- this component holds only the returned structured
 * findings in memory/workspace state, never the raw file bytes
 * (docs/09_SECURITY_PRIVACY_GOVERNANCE.md "Upload warning" /
 * "Default local-first behavior").
 */
export function DocumentEntry({
  onAnalyzed,
  existingFindings,
  onClearFindings,
}: {
  onAnalyzed: (result: DocumentAnalysisResponse) => void;
  existingFindings: DocumentAnalysisResponse[];
  onClearFindings: () => void;
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
      <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
        Or start from a meeting document
      </h2>
      <p className="text-xs text-[var(--color-text-secondary)]">
        Upload an agenda, staff report, budget memo, minutes, or plain-text/PDF/DOCX document.
        It is processed once, in memory, and never saved on the server.
      </p>

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
          Choose a file to upload
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
        <LoadingRegion label="Analyzing document">
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

      {existingFindings.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[var(--color-text-primary)]">
              Analyzed documents this session
            </h3>
            <Button size="sm" variant="ghost" onClick={onClearFindings}>
              Clear all uploaded-document data
            </Button>
          </div>
          {existingFindings.map((finding) => (
            <DocumentFindingCard key={finding.file_hash} finding={finding} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentFindingCard({ finding }: { finding: DocumentAnalysisResponse }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">{finding.filename}</span>
        <Badge tone="neutral">{finding.page_count} page(s)</Badge>
      </div>
      {finding.structure.title && (
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{finding.structure.title}</p>
      )}
      {finding.injection_warnings.length > 0 && (
        <p className="mt-2 rounded-[var(--radius-sm)] bg-[var(--color-alert-subtle)] p-2 text-xs text-[var(--color-alert)]">
          This document contains instruction-like text (e.g. &quot;ignore previous instructions&quot;).
          It is treated as plain content to describe, never as instructions -- shown here for
          transparency only.
        </p>
      )}
      {finding.detected_geographies.length > 0 && (
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
          Geographies mentioned: {finding.detected_geographies.join(", ")}
        </p>
      )}
      {finding.detected_topics.length > 0 && (
        <ul className="mt-2 space-y-1">
          {finding.detected_topics.map((topic) => (
            <li key={topic.topic_id} className="text-xs text-[var(--color-text-secondary)]">
              <strong className="font-medium text-[var(--color-text-primary)]">{topic.label}</strong>
              {topic.unavailable_reason
                ? ` -- ${topic.unavailable_reason}`
                : topic.scenarios.length > 0
                  ? ` -- related to the "${topic.scenarios[0]}" priority scenario`
                  : ""}
            </li>
          ))}
        </ul>
      )}
      {finding.structure.agenda_item_headers.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-[var(--color-interactive)]">
            {finding.structure.agenda_item_headers.length} agenda item(s) detected
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-[var(--color-text-secondary)]">
            {finding.structure.agenda_item_headers.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">{finding.processing_disclosure}</p>
    </div>
  );
}
