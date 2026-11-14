"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { coursesApi, subjectsApi } from "@/lib/api";
import { ErrorState, LoadingState } from "@/lib/states";
import { errorMessage, useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { LevelPill, ProgressBar } from "@/lib/ui";

// Course overview: progress, subject link, "Add to my schedule", lesson list.
// Client page, so params is unwrapped with React's use() (Next 16 convention).
export default function CoursePage({ params }: PageProps<"/courses/[id]">) {
  const { id } = use(params);
  const { token } = useAuth();
  const router = useRouter();
  const { data, error: loadError, loading, reload, reloading } = useApi(`course:${id}`, async (t) => {
    const [c, s] = await Promise.all([coursesApi.get(t, id), subjectsApi.list(t)]);
    return { course: c.course, subjects: s.subjects };
  });
  const course = data?.course ?? null;
  const subjects = data?.subjects ?? [];
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = reload;

  async function link(subjectId: string) {
    if (!token || !course) return;
    setError(null);
    try {
      await coursesApi.link(token, course.id, subjectId || null);
      await load();
      setNotice(subjectId ? "Linked: this course now counts toward that subject's mastery." : "Unlinked from subject.");
    } catch (err) {
      setError(errorMessage(err, "Failed to link subject"));
    }
  }

  async function schedule() {
    if (!token || !course) return;
    setBusy(true);
    setError(null);
    try {
      const { tasksCreated } = await coursesApi.schedule(token, course.id);
      await load();
      setNotice(
        `${tasksCreated} lesson task${tasksCreated === 1 ? "" : "s"} added. Regenerate your schedule on the Dashboard to place them.`
      );
    } catch (err) {
      setError(errorMessage(err, "Failed to add to schedule"));
    } finally {
      setBusy(false);
    }
  }

  async function removeCourse() {
    if (!token || !course) return;
    if (!window.confirm(`Delete "${course.title}"? All ${course.lessons.length} lessons and quiz scores are deleted, and the XP they earned is removed.`)) return;
    try {
      await coursesApi.remove(token, course.id);
      router.push("/courses");
    } catch (err) {
      setError(errorMessage(err, "Failed to delete the course"));
    }
  }

  if (loading) return <LoadingState label="Loading course" />;
  if (!course)
    return (
      <ErrorState
        title="Couldn't open this course"
        message={loadError ?? "Course not found."}
        onRetry={reload}
        retrying={reloading}
      />
    );

  const { progress } = course;
  const next = course.lessons.find((l) => !l.completedAt);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Link href="/courses" className="text-sm text-primary hover:underline">
        &larr; All courses
      </Link>

      <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{course.title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <LevelPill level={course.level} />
              <span>Topic: {course.topic}</span>
              <span>·</span>
              <span>{course.source === "AI" ? "AI generated" : "Built from offline templates"}</span>
            </p>
          </div>
          {next && (
            <Link
              href={`/courses/${course.id}/lessons/${next.id}`}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-solid hover:opacity-90"
            >
              {progress.lessonsDone === 0 ? "Start course" : "Continue"}
            </Link>
          )}
        </div>
        <p className="text-sm text-text-muted">{course.description}</p>

        <div>
          <div className="mb-1 flex justify-between text-xs text-text-muted">
            <span>
              {progress.lessonsDone} of {progress.lessonsTotal} lessons complete
            </span>
            <span>
              {progress.percent}%
              {progress.avgQuizScore !== null && ` · avg quiz ${progress.avgQuizScore}%`}
            </span>
          </div>
          <ProgressBar
            value={progress.percent}
            height="h-3"
            color={progress.completed ? "var(--accent)" : "var(--primary)"}
            label="Course progress"
          />
          {progress.completed && (
            <p className="mt-2 text-sm font-medium text-accent">Course complete. Milestone XP and badge earned.</p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-4 border-t border-border pt-4">
          <label className="flex flex-col gap-1 text-sm">
            Subject
            <select
              value={course.subjectId ?? ""}
              onChange={(e) => link(e.target.value)}
              className="rounded-lg border border-input bg-surface px-3 py-2 outline-none focus:border-primary"
            >
              <option value="">Not linked</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={schedule}
            disabled={busy || !!course.scheduledAt || progress.completed}
            className="rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
            title="Creates one study task per unfinished lesson"
          >
            {course.scheduledAt ? "On your schedule" : busy ? "Adding..." : "Add this course to my schedule"}
          </button>
          <button onClick={removeCourse} className="ml-auto text-sm text-red-600 hover:underline">
            Delete course
          </button>
        </div>
        {notice && <p className="text-sm text-accent">{notice}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <ol className="flex flex-col gap-2">
        {course.lessons.map((l) => (
          <li key={l.id}>
            <Link
              href={`/courses/${course.id}/lessons/${l.id}`}
              className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 hover:border-primary/40"
            >
              <span className="flex items-center gap-3">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    l.completedAt ? "bg-accent text-on-solid" : "bg-bg text-text-muted ring-1 ring-border"
                  }`}
                >
                  {l.completedAt ? "✓" : l.order}
                </span>
                <span className="font-medium">{l.title}</span>
              </span>
              <span className="flex items-center gap-3 text-xs text-text-muted">
                {l.task && <span>scheduled</span>}
                {l.quizScore !== null ? (
                  <span className={l.quizPassedAt ? "text-accent" : "text-amber"}>Quiz {l.quizScore}%</span>
                ) : (
                  <span>Quiz not taken</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
