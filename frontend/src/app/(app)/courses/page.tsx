"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { COURSE_LEVELS, NUMBER_LIMITS, TOPIC_MAX, validateIntInRange, validateTopic } from "@shared/validation";
import { ApiError, Course, CourseLevel, Subject, Usage, coursesApi, subjectsApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { FieldError, FieldErrors, UpgradePrompt, collectErrors, hasErrors, inputClass, serverFieldErrors } from "@/lib/form";
import { CapIcon, SparkIcon } from "@/lib/icons";
import { LevelPill, ProgressBar } from "@/lib/ui";
import { SearchBox, matchesQuery, useDebounced } from "@/lib/search";
import { EmptyState, ErrorState, LoadingState } from "@/lib/states";
import { errorMessage, useApi } from "@/lib/use-api";

async function loadCourses(token: string) {
  const [c, s] = await Promise.all([coursesApi.list(token), subjectsApi.list(token)]);
  return { courses: c.courses, usage: c.usage, subjects: s.subjects };
}

type Field = "topic" | "level" | "lessonCount" | "subjectId";
const FIELDS: Field[] = ["topic", "level", "lessonCount", "subjectId"];

export default function CoursesPage() {
  const { token } = useAuth();
  const router = useRouter();
  const { data, error, loading, reload, reloading } = useApi("courses", loadCourses);
  const courses: Course[] = data?.courses ?? [];
  const subjects: Subject[] = data?.subjects ?? [];
  const usage: Usage | null = data?.usage ?? null;
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const query = useDebounced(search);
  const shown = courses.filter((c) => matchesQuery(query, c.title, c.topic, c.subject?.name, c.level));

  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<CourseLevel>("BEGINNER");
  const [lessonCount, setLessonCount] = useState("4");
  const [subjectId, setSubjectId] = useState("");
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [generating, setGenerating] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);

  // Picking a subject pre-fills the topic, the common "learn my weak subject" path.
  function pickSubject(id: string) {
    setSubjectId(id);
    const s = subjects.find((x) => x.id === id);
    if (s && !topic.trim()) setTopic(s.name);
  }

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setActionError(null);
    setUpgradeMsg(null);
    const found = collectErrors<Field>({
      topic: validateTopic(topic),
      level: COURSE_LEVELS.includes(level) ? null : "Choose a level.",
      lessonCount: validateIntInRange(lessonCount, "lessonCount"),
      subjectId: null,
    });
    setErrors(found);
    if (hasErrors(found)) return;

    setGenerating(true);
    try {
      const res = await coursesApi.generate(token, {
        topic: topic.trim(),
        level,
        lessonCount: Number(lessonCount),
        subjectId: subjectId || null,
      });
      router.push(`/courses/${res.course.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.upgradeRequired) {
        setUpgradeMsg(err.message);
      } else {
        const fromServer = serverFieldErrors(err, FIELDS);
        setErrors(fromServer);
        if (!hasErrors(fromServer)) setActionError(errorMessage(err, "Could not generate the course"));
      }
      setGenerating(false);
    }
  }

  async function remove(c: Course) {
    if (
      !token ||
      !window.confirm(
        `Delete "${c.title}"? Its ${c.progress.lessonsTotal} lessons and quiz scores are deleted too, and the XP they earned is removed.`
      )
    )
      return;
    setActionError(null);
    try {
      await coursesApi.remove(token, c.id);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err, "Failed to delete"));
    }
  }

  const atCap = !!usage && usage.limit !== null && usage.used >= usage.limit;
  const lc = NUMBER_LIMITS.lessonCount;

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-muted">
          Learn a topic step by step. Lessons and quizzes earn XP and raise the linked subject&rsquo;s mastery.
        </p>
        {actionError && <ErrorState title="That didn't work" message={actionError} />}
        {courses.length > 0 && (
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search courses by title, topic or subject"
            label="Search courses"
            shown={shown.length}
            total={courses.length}
          />
        )}
        {loading ? (
          <LoadingState label="Loading courses" />
        ) : error && !data ? (
          <ErrorState message={error} onRetry={reload} retrying={reloading} />
        ) : courses.length > 0 && shown.length === 0 ? (
          <EmptyState
            title="No matching courses"
            body={`Nothing matches "${query}".`}
            onAction={() => setSearch("")}
            actionLabel="Clear search"
          />
        ) : courses.length === 0 ? (
          <EmptyState
            title="No courses yet"
            body="Tell SchediQ what you want to learn and it builds a step-by-step course with quizzes. Link it to a weak subject to raise that subject's mastery."
          />
        ) : (
          shown.map((c) => (
            <div key={c.id} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CapIcon width={20} height={20} />
                  </span>
                  <div>
                    <Link href={`/courses/${c.id}`} className="font-medium hover:text-primary hover:underline">
                      {c.title}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                      <LevelPill level={c.level} />
                      {c.subject && (
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full" style={{ background: c.subject.colorTag }} />
                          {c.subject.name}
                        </span>
                      )}
                      <span>{c.source === "AI" ? "AI generated" : "Offline template"}</span>
                    </p>
                  </div>
                </div>
                <button onClick={() => remove(c)} className="text-xs text-red-600 hover:underline">
                  Delete
                </button>
              </div>
              <div className="flex items-center gap-3">
                <ProgressBar
                  value={c.progress.percent}
                  color={c.progress.completed ? "var(--accent)" : "var(--primary)"}
                  label={`${c.title} progress`}
                />
                <span className="w-28 shrink-0 text-right text-xs text-text-muted">
                  {c.progress.lessonsDone}/{c.progress.lessonsTotal} lessons
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={onGenerate}
        noValidate
        className="flex h-fit flex-col gap-4 rounded-card border border-border bg-surface p-5"
      >
        <div className="flex items-center gap-2">
          <SparkIcon width={18} height={18} className="text-primary" />
          <h2 className="text-sm font-semibold">Generate a course</h2>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          What do you want to learn?
          <input
            value={topic}
            maxLength={TOPIC_MAX + 20}
            placeholder="e.g. SQL joins, subnetting, Python functions"
            onChange={(e) => setTopic(e.target.value)}
            aria-invalid={!!errors.topic}
            className={inputClass(errors.topic)}
          />
          <FieldError message={errors.topic} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Level
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as CourseLevel)}
              className={inputClass(errors.level)}
            >
              {COURSE_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l.charAt(0) + l.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <FieldError message={errors.level} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Lessons
            <input
              type="number"
              inputMode="numeric"
              min={lc.min}
              max={lc.max}
              value={lessonCount}
              onChange={(e) => setLessonCount(e.target.value)}
              aria-invalid={!!errors.lessonCount}
              className={inputClass(errors.lessonCount)}
            />
            <FieldError message={errors.lessonCount} />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Link to subject (optional)
          <select value={subjectId} onChange={(e) => pickSubject(e.target.value)} className={inputClass(errors.subjectId)}>
            <option value="">None</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-text-muted">Linked courses raise that subject&rsquo;s mastery.</span>
          <FieldError message={errors.subjectId} />
        </label>

        {upgradeMsg && <UpgradePrompt message={upgradeMsg} />}

        <button
          type="submit"
          disabled={generating}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-solid hover:opacity-90 disabled:opacity-50"
        >
          <SparkIcon width={16} height={16} />
          {generating ? "Generating..." : "Generate course"}
        </button>
        {usage && (
          <p className="text-xs text-text-muted">
            {usage.limit === null
              ? `Premium: unlimited courses (${usage.used} so far).`
              : `Free plan: ${usage.used} of ${usage.limit} courses used.`}{" "}
            {atCap && (
              <Link href="/upgrade" className="text-violet hover:underline">
                Upgrade
              </Link>
            )}
          </p>
        )}
      </form>
    </div>
  );
}
