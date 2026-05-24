import { describe, it, expect } from "vitest";
import { scrubAssistantText } from "@/lib/chat-text-scrub";

describe("scrubAssistantText", () => {
  it("returns input unchanged when there's no leakage", () => {
    const txt = "I've added it to your list. Anything else?";
    expect(scrubAssistantText(txt)).toBe(txt);
  });

  it("returns empty input unchanged", () => {
    expect(scrubAssistantText("")).toBe("");
  });

  it("strips a json-fenced tool-call block", () => {
    const txt = `Sure, I'll set that up.

\`\`\`json
{
  "name": "create_task",
  "arguments": { "title": "Buy milk", "due_at": "2026-05-25T10:00:00-04:00" }
}
\`\`\`

Done!`;
    const out = scrubAssistantText(txt);
    expect(out).not.toContain("create_task");
    expect(out).not.toContain('"arguments"');
    expect(out).toContain("Sure, I'll set that up.");
    expect(out).toContain("Done!");
  });

  it("strips <function_call> XML tags", () => {
    const txt = `Adding now. <function_call>create_task("Buy milk")</function_call> All set.`;
    const out = scrubAssistantText(txt);
    expect(out).not.toContain("function_call");
    expect(out).not.toContain("create_task");
    expect(out).toContain("Adding now.");
    expect(out).toContain("All set.");
  });

  it("strips <tool_use> XML tags", () => {
    const txt = `Filing that. <tool_use name="create_task">{"title":"x"}</tool_use> Done.`;
    const out = scrubAssistantText(txt);
    expect(out).not.toContain("tool_use");
    expect(out).not.toContain("create_task");
    expect(out).toContain("Filing that.");
    expect(out).toContain("Done.");
  });

  it("strips naked JSON objects with tool-call shape", () => {
    const txt = `Here's what I did: {"name":"create_task","arguments":{"title":"Buy milk"}} And it's logged.`;
    const out = scrubAssistantText(txt);
    expect(out).not.toContain('"name"');
    expect(out).not.toContain('"arguments"');
    expect(out).toContain("Here's what I did:");
    expect(out).toContain("And it's logged.");
  });

  it("does NOT strip a plain JSON object the user is discussing", () => {
    // No "arguments"/"args"/"input"/"parameters" key — should pass through.
    const txt = `Here's the example: {"city": "Boston", "temp": 72}`;
    const out = scrubAssistantText(txt);
    expect(out).toContain('"city"');
    expect(out).toContain("Boston");
  });

  it("strips slash-style tool command lines", () => {
    const txt = `Adding now.
create_task /title=Buy milk
All set.`;
    const out = scrubAssistantText(txt);
    expect(out).not.toContain("/title=");
    expect(out).toContain("Adding now.");
    expect(out).toContain("All set.");
  });

  it("collapses excessive whitespace left by deletions", () => {
    const txt = `Line one.

\`\`\`json
{"name":"x","arguments":{}}
\`\`\`



Line two.`;
    const out = scrubAssistantText(txt);
    expect(out).not.toMatch(/\n{3,}/);
  });

  it("handles multiple leaks in one message", () => {
    const txt = `First: <function_call>a</function_call>
Then: \`\`\`json
{"name":"b","arguments":{}}
\`\`\`
And: {"name":"c","arguments":{}}
Done.`;
    const out = scrubAssistantText(txt);
    expect(out).not.toContain("function_call");
    expect(out).not.toContain('"arguments"');
    expect(out).toContain("First:");
    expect(out).toContain("Then:");
    expect(out).toContain("And:");
    expect(out).toContain("Done.");
  });
});
