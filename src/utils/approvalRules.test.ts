import { describe, expect, it } from "vitest";
import { getApprovalCommandInfo, normalizeCommandTokens } from "./approvalRules";

describe("approvalRules", () => {
  it("normalizes fetch approvals by tool kind instead of full URL command text", () => {
    const info = getApprovalCommandInfo({
      command: [
        'Fetching content from https://www.sse.com.cn/ and processing with prompt: "extract"',
      ],
      raw: {
        toolCall: {
          kind: "fetch",
        },
      },
    });

    expect(info).not.toBeNull();
    expect(info?.tokens).toEqual(["fetch"]);
    expect(info?.preview).toBe("fetch");
  });

  it("strips trailing execution annotations and stderr redirection", () => {
    const tokens = normalizeCommandTokens([
      'cd C:\\tmp && python scripts\\run_pipeline.py --query "abc" --data-dir C:\\data 2>&1 (Test the pipeline script with a sample query.)',
    ]);
    expect(tokens).toContain("python");
    expect(tokens).not.toContain("2>&1");
    expect(tokens.some((token) => token.includes("sample"))).toBe(false);
  });
});
