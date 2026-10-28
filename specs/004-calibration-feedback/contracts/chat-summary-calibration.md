# Contract: `calibration` on the chat summary

```ts
calibration?: {
  levels: Partial<Record<"Guessing" | "Unsure" | "Fairly sure" | "Certain", { answers: number; right: number }>>;
  misses: { toolCallId: string; question: string; answeredAt: string; messageId: string | null }[];
};
```

- Only these keys cross the seam (FR-006): no options, correct indices, explanations, thinking or confidence values per answer.
- Absent when no graded answer with confidence exists in the session.
