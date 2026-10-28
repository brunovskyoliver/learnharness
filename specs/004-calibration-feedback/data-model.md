# Data Model: Calibration feedback

Derived only; nothing stored.

## ConfidenceLevel
`"Guessing" | "Unsure" | "Fairly sure" | "Certain"`, from raw confidence by R3.

## ChatCalibration (per chat, `ChatSummary.calibration?`)
| Field | Type | Rule |
|-------|------|------|
| `levels` | `Partial<Record<ConfidenceLevel, { answers: number; right: number }>>` | only levels with ≥ 1 counted answer |
| `misses` | `CalibrationMiss[]` | wrong answers at Certain, in transcript order |

Absent when no answer counts.

## CalibrationMiss
| Field | Type | Rule |
|-------|------|------|
| `toolCallId` | string | the check's call id (React key) |
| `question` | string | `questionText` with the display math repair, markdown kept (client strips to one line) |
| `answeredAt` | string | ISO, from the answer |
| `messageId` | string \| null | link target per R4; null → link to the session without a hash |

## Merged (Home)
`{ levels (summed, fixed order), misses: (CalibrationMiss & { chatId, title })[] newest answeredAt first }`
