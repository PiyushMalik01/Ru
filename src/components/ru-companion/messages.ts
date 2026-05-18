// Route-aware lines Ru drops as speech bubbles. Kept short and friendly.
// Greetings fire once on route entry; idle lines fire occasionally while
// Ru is just hanging out.

type Bag = string[];

function pickFrom(bag: Bag): string | null {
  if (bag.length === 0) return null;
  return bag[Math.floor(Math.random() * bag.length)];
}

function timeMood(): "morning" | "midday" | "afternoon" | "evening" | "late" {
  const h = new Date().getHours();
  if (h < 5) return "late";
  if (h < 11) return "morning";
  if (h < 15) return "midday";
  if (h < 19) return "afternoon";
  if (h < 23) return "evening";
  return "late";
}

const GREETINGS: Record<string, Bag> = {
  "/today": [
    "morning.",
    "hey.",
    "hi there.",
    "look at you.",
    "ready when you are.",
  ],
  "/sheet": [
    "everything, in one place.",
    "let me know.",
    "what are we looking for?",
  ],
  "/plans": [
    "arcs in motion.",
    "anything new to start?",
    "let's make one.",
  ],
  "/plans/_": [
    "tell me how to update this.",
    "want to extend it?",
    "let me know what changes.",
  ],
};

const IDLE: Record<string, Bag> = {
  "/today": [
    "tea sounds good.",
    "got this.",
    "small wins count.",
    "still here.",
    "you're doing fine.",
  ],
  "/sheet": [
    "lots of threads.",
    "all yours.",
    "looking at patterns.",
  ],
  "/plans": [
    "love a good plan.",
    "we'll figure it out.",
  ],
  "/plans/_": [
    "looking at it with you.",
    "tell me what's missing.",
  ],
};

function bucketFor(pathname: string): string {
  // Plan detail pages share a bucket.
  if (/^\/plans\/[0-9a-f-]{36}/i.test(pathname)) return "/plans/_";
  if (pathname.startsWith("/plans")) return "/plans";
  if (pathname.startsWith("/sheet")) return "/sheet";
  if (pathname.startsWith("/today")) return "/today";
  return "/today";
}

export function pickGreeting(pathname: string): string | null {
  const bucket = bucketFor(pathname);
  const bag = GREETINGS[bucket];
  if (!bag) return null;

  // On /today only, lean into the time-of-day greeting half the time.
  if (bucket === "/today" && Math.random() < 0.5) {
    const mood = timeMood();
    const moodLine: Record<typeof mood, string> = {
      morning: "morning.",
      midday: "midday.",
      afternoon: "afternoon.",
      evening: "evening.",
      late: "still up?",
    };
    return moodLine[mood];
  }

  return pickFrom(bag);
}

export function pickIdleLine(pathname: string): string | null {
  const bucket = bucketFor(pathname);
  const bag = IDLE[bucket];
  return pickFrom(bag ?? []);
}
