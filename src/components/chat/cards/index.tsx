"use client";

import type { CardKind } from "@/lib/stores/chat-store";
import { TaskCard, type TaskCardData } from "./task-card";
import { RoutineCard, type RoutineCardData } from "./routine-card";
import { ActivityCard, type ActivityCardData } from "./activity-card";
import { ReminderCard, type ReminderCardData } from "./reminder-card";
import { InsightCard, type InsightCardData } from "./insight-card";
import { TrackerCard, type TrackerCardData } from "./tracker-card";

interface CardProps {
  kind: CardKind;
  data: Record<string, unknown>;
}

export function Card({ kind, data }: CardProps) {
  switch (kind) {
    case "task":
      return <TaskCard data={data as unknown as TaskCardData} />;
    case "routine":
      return <RoutineCard data={data as unknown as RoutineCardData} />;
    case "activity":
      return <ActivityCard data={data as unknown as ActivityCardData} />;
    case "reminder":
      return <ReminderCard data={data as unknown as ReminderCardData} />;
    case "insight":
      return <InsightCard data={data as unknown as InsightCardData} />;
    case "tracker":
      return <TrackerCard data={data as unknown as TrackerCardData} />;
    default:
      return null;
  }
}
