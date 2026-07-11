import { describe, expect, it } from "vitest";
import { ApiError } from "./api";

describe("ApiError", () => {
  it("carries the HTTP status alongside the message", () => {
    const error = new ApiError("Request to /api/v1/health failed with status 503", 503);
    expect(error.status).toBe(503);
    expect(error.message).toContain("/api/v1/health");
    expect(error.name).toBe("ApiError");
    expect(error).toBeInstanceOf(Error);
  });
});
