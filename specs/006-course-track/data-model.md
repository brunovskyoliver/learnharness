# Data Model: Course track

## CourseInput (`course` tool arguments; TypeBox in `src/core/course.ts`)
| Field | Type | Rule |
|-------|------|------|
| `title` | string | 1–120 |
| `url` | string? | http(s) |
| `items` | `CourseItem[]` | 1–100, course order |

## CourseItem
| Field | Type | Rule |
|-------|------|------|
| `title` | string | 1–160 |
| `kind` | `"lecture" \| "problem-set" \| "notes" \| "reading"` | labels Lecture / Problem set / Notes / Reading |
| `url` | string? | http(s) |
| `topics` | string[] | plan slugs existing at call time; may be empty |

## Derived
- `ItemCoverage`: `"covered" | "not-covered" | "not-in-plan"` per item.
- `ChatSummary.course?`: `{ covered: number; items: number }`.
