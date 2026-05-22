import { describe, it, expect } from "vitest";
import { createProsodyStream } from "@/lib/voice/prosody";

describe("prosody stream", () => {
  it("plain text passes through with sentence boundary detection", () => {
    const s = createProsodyStream();
    const chunks = s.push("Hello there. How are you?");
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const joined = chunks.map((c) => c.ssml).join("");
    expect(joined).toContain("Hello there.");
  });

  it("[pause] translates to break", () => {
    const s = createProsodyStream();
    const ch = s.push("Wait [pause] really?");
    const tail = s.flush();
    const ssml = [...ch, ...tail].map((c) => c.ssml).join("");
    expect(ssml).toMatch(/<break time="\d+ms"\/>/);
  });

  it("[pause:500] uses explicit duration", () => {
    const s = createProsodyStream();
    const ssml = [...s.push("ok [pause:500] go."), ...s.flush()]
      .map((c) => c.ssml)
      .join("");
    expect(ssml).toContain('<break time="500ms"/>');
  });

  it("[soft]...[/soft] becomes prosody volume soft", () => {
    const s = createProsodyStream();
    const ssml = [...s.push("[soft]quietly[/soft] but firmly"), ...s.flush()]
      .map((c) => c.ssml)
      .join("");
    expect(ssml).toContain('<prosody volume="soft">quietly</prosody>');
  });

  it("[emphasized]...[/emphasized] becomes emphasis strong", () => {
    const s = createProsodyStream();
    const ssml = [
      ...s.push("really [emphasized]matters[/emphasized] here"),
      ...s.flush(),
    ]
      .map((c) => c.ssml)
      .join("");
    expect(ssml).toContain('<emphasis level="strong">matters</emphasis>');
  });

  it("strips markdown headers/bullets/code", () => {
    const s = createProsodyStream();
    const ssml = [
      ...s.push("# Title\n- item one\n- item two\n`code`"),
      ...s.flush(),
    ]
      .map((c) => c.ssml)
      .join("");
    expect(ssml).not.toContain("#");
    expect(ssml).not.toContain("`");
    expect(ssml).toContain("Title");
    expect(ssml).toContain("item one");
  });

  it("playedUpToChar tracks output cursor", () => {
    const s = createProsodyStream();
    s.push("Hello there.");
    s.flush();
    expect(s.playedUpToChar()).toBeGreaterThan(0);
  });

  it("playedUpToChar excludes SSML markup but counts spoken text", () => {
    const s = createProsodyStream();
    s.push("hi [pause] there");
    s.flush();
    // "hi " + " there" = 9 chars of speakable text; the <break/> doesn't count.
    expect(s.playedUpToChar()).toBe(9);
  });

  it("streaming across delta boundaries holds back open tags", () => {
    const s = createProsodyStream();
    // The `[` arrives at the end of one delta — it should be held in carry,
    // not emitted, so the tag is fully assembled before translation.
    const first = s.push("Wait [");
    const firstJoined = first.map((c) => c.ssml).join("");
    expect(firstJoined).not.toContain("[");
    const second = s.push("pause] really?");
    const tail = s.flush();
    const allSSML = [...first, ...second, ...tail]
      .map((c) => c.ssml)
      .join("");
    expect(allSSML).toContain('<break time="300ms"/>');
    expect(allSSML).not.toContain("[pause]");
  });

  it("unknown tags are stripped silently", () => {
    const s = createProsodyStream();
    const ssml = [...s.push("hello [shrug] world"), ...s.flush()]
      .map((c) => c.ssml)
      .join("");
    expect(ssml).not.toContain("[shrug]");
    expect(ssml).toContain("hello");
    expect(ssml).toContain("world");
  });
});
