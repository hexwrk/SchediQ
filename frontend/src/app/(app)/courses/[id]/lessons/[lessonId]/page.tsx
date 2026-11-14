"use client";

import Link from "next/link";
import { use, useState } from "react";
import { QuizResult, lessonsApi, coursesApi } from "@/lib/api";
import { ErrorState, LoadingState } from "@/lib/states";
import { errorMessage, useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { useProgress } from "@/lib/progress-context";
import { ProgressBar, useXpReward } from "@/lib/ui";

// Lesson view: explanation, key points, and an interactive quiz graded by the
// server on submit. XP is never computed here: after each action the derived
// progress is refetched and the difference is shown as "+N XP".
export default function LessonPage({ params }: PageProps<"/courses/[id]/lessons/[lessonId]">) {
  const { id, lessonId } = use(params);
  // key = lessonId: moving to another lesson remounts the view, so the previous
  // lesson's answers and result can never leak into the next quiz.
  return <LessonView key={lessonId} id={id} lessonId={lessonId} />;
}

function LessonView({ id, lessonId }: { id: string; lessonId: string }) {
  const { token } = useAuth();
  const { progress } = useProgress();
  const { reward, float } = useXpReward();
  const { data, error: loadError, loading, reload, reloading } = useApi(`course:${id}`, (t) =>
    coursesApi.get(t, id).then((r) => r.course)
  );
  const course = data ?? null;
  // Chosen options. Empty until the learner picks one; the effective list is
  // derived below from the quiz length, so nothing is copied into state.
  const [picked, setPicked] = useState<(number | null)[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = reload;

  const lesson = course?.lessons.find((l) => l.id === lessonId);
  const quizLength = lesson?.quiz.length ?? 0;
  const answers: (number | null)[] = picked.length === quizLength ? picked : Array(quizLength).fill(null);
  const index = course?.lessons.findIndex((l) => l.id === lessonId) ?? -1;
  const prev = index > 0 ? course?.lessons[index - 1] : undefined;
  const next = course && index >= 0 ? course.lessons[index + 1] : undefined;

  async function submitQuiz() {
    if (!token || !lesson) return;
    // Client-side check: every question needs an answer before grading.
    const missing = answers.findIndex((a) => a === null);
    if (missing !== -1) {
      setQuizError(`Answer question ${missing + 1} before submitting.`);
      return;
    }
    setQuizError(null);
    setBusy(true);
    try {
      await reward(async () => {
        const res = await lessonsApi.update(token, lesson.id, { quizAnswers: answers as number[] });
        setResult(res.result);
      });
      await load();
    } catch (err) {
      setQuizError(errorMessage(err, "Could not submit the quiz"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleComplete() {
    if (!token || !lesson) return;
    setBusy(true);
    setError(null);
    try {
      await reward(async () => {
        await lessonsApi.update(token, lesson.id, { completed: !lesson.completedAt });
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not update the lesson"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading lesson" rows={2} />;
  if (!course)
    return <ErrorState title="Couldn't open this lesson" message={loadError ?? "Course not found."} onRetry={reload} retrying={reloading} />;
  if (!lesson)
    return (
      <ErrorState
        title="Lesson not found"
        message="It may have been deleted with its course. Go back to your courses to continue."
      />
    );

  const passMark = progress?.xpRules.values.QUIZ_PASS_MARK ?? 70;
  const paragraphs = lesson.content.split(/\n\s*\n/);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {float}
      <div className="flex flex-col gap-2">
        <Link href={`/courses/${course.id}`} className="text-sm text-primary hover:underline">
          &larr; {course.title}
        </Link>
        <div className="flex items-center gap-3">
          <ProgressBar value={course.progress.percent} label="Course progress" />
          <span className="w-32 shrink-0 text-right text-xs text-text-muted">
            Lesson {lesson.order} of {course.lessons.length}
          </span>
        </div>
      </div>

      <article className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{lesson.title}</h2>
          {lesson.completedAt && (
            <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
              Completed
            </span>
          )}
        </div>
        {paragraphs.map((p, i) => (
          <p key={i} className="text-sm leading-relaxed">
            {p}
          </p>
        ))}
        <div className="rounded-lg bg-bg p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Key points</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {lesson.keyPoints.map((k) => (
              <li key={k}>• {k}</li>
            ))}
          </ul>
        </div>
        <div>
          <button
            onClick={toggleComplete}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-bg disabled:opacity-50"
          >
            {lesson.completedAt ? "Mark as not completed" : `Mark lesson complete (+${progress?.xpRules.values.LESSON_COMPLETE ?? 20} XP)`}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </article>

      <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Quiz</h2>
          <span className="text-xs text-text-muted">
            Pass mark {passMark}% · +{progress?.xpRules.values.QUIZ_PASS ?? 30} XP on first pass
            {lesson.quizScore !== null && ` · best ${lesson.quizScore}%`}
          </span>
        </div>
        {lesson.quiz.map((q, qi) => {
          const graded = result !== null;
          return (
            <fieldset key={qi} className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">
                {qi + 1}. {q.question}
              </legend>
              {q.options.map((opt, oi) => {
                const chosen = answers[qi] === oi;
                const isAnswer = graded && result.answerKey[qi] === oi;
                const wrongPick = graded && chosen && !result.correct[qi];
                return (
                  <label
                    key={oi}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                      isAnswer
                        ? "border-accent bg-accent/5"
                        : wrongPick
                          ? "border-red-500 bg-red-50"
                          : chosen
                            ? "border-primary bg-primary/5"
                            : "border-input hover:bg-bg"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q${qi}`}
                      checked={chosen}
                      onChange={() => {
                        setResult(null);
                        setPicked(answers.map((v, i) => (i === qi ? oi : v)));
                      }}
                      className="accent-[var(--primary)]"
                    />
                    {opt}
                  </label>
                );
              })}
            </fieldset>
          );
        })}
        {quizError && <p className="text-sm text-red-600">{quizError}</p>}
        {result && (
          <p className={`text-sm font-medium ${result.passed ? "text-accent" : "text-amber"}`}>
            You scored {result.score}%.{" "}
            {result.passed ? "Passed: lesson complete." : `Not quite: ${passMark}% needed. Review and try again.`}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={submitQuiz}
            disabled={busy}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-on-solid hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Grading..." : result ? "Resubmit" : "Submit answers"}
          </button>
          <div className="flex gap-3 text-sm">
            {prev && (
              <Link href={`/courses/${course.id}/lessons/${prev.id}`} className="text-primary hover:underline">
                &larr; Previous
              </Link>
            )}
            {next ? (
              <Link href={`/courses/${course.id}/lessons/${next.id}`} className="text-primary hover:underline">
                Next lesson &rarr;
              </Link>
            ) : (
              <Link href={`/courses/${course.id}`} className="text-primary hover:underline">
                Back to course
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
