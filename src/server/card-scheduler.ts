/**
 * The FSRS adapter behind core's `CardScheduler` (feature 021). The one file that
 * imports ts-fsrs, and only when a card is first scheduled, so the library stays
 * out of the browser and off the startup path.
 */
import type { CardPhase, CardRating, CardSchedule } from "../core/cards.ts";
import type { CardScheduler } from "../core/card-schedule.ts";

const PHASES: readonly CardPhase[] = ["new", "learning", "review", "relearning"];

let loaded: Promise<CardScheduler> | undefined;

/** Default FSRS parameters, with fuzz off: the same rating at the same moment
 *  always gives the same date, which the predicted intervals have to promise. */
export function loadCardScheduler(): Promise<CardScheduler> {
	return (loaded ??= import("ts-fsrs").then(({ createEmptyCard, fsrs, Rating, State }) => {
		const engine = fsrs({ enable_fuzz: false });
		const ratings = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const;
		const states = { new: State.New, learning: State.Learning, review: State.Review, relearning: State.Relearning } as const;
		type EngineCard = ReturnType<typeof createEmptyCard>;
		const toEngine = (schedule: CardSchedule): EngineCard => ({
			due: new Date(schedule.due), stability: schedule.stability, difficulty: schedule.difficulty,
			scheduled_days: schedule.scheduledDays, learning_steps: schedule.learningSteps,
			reps: schedule.reps, lapses: schedule.lapses, state: states[schedule.phase],
			last_review: schedule.lastReview ? new Date(schedule.lastReview) : undefined,
		} as EngineCard);
		const fromEngine = (card: EngineCard): CardSchedule => ({
			due: card.due.toISOString(), stability: card.stability, difficulty: card.difficulty,
			scheduledDays: card.scheduled_days, learningSteps: card.learning_steps,
			reps: card.reps, lapses: card.lapses, phase: PHASES[card.state]!,
			lastReview: card.last_review ? new Date(card.last_review).toISOString() : null,
		});
		return {
			initial: (now) => fromEngine(createEmptyCard(now)),
			apply: (schedule, rating, now) => fromEngine(engine.next(toEngine(schedule), now, ratings[rating]).card),
			preview: (schedule, now) => {
				const all = engine.repeat(toEngine(schedule), now);
				const of = (rating: CardRating) => fromEngine(all[ratings[rating]].card);
				return { again: of("again"), hard: of("hard"), good: of("good"), easy: of("easy") };
			},
		};
	}));
}
