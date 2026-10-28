import "dotenv/config";
import bcrypt from "bcryptjs";
import { AccountType, PrismaClient, Prisma, Role } from "@prisma/client";
import { buildSchedule, SchedulerTask, SchedulerPrefs } from "../src/lib/scheduler";
import { pickTemplate } from "../src/lib/courseTemplates";

// Seed a populated, lived-in demo plus a small leaderboard cohort.
// Everything here is DEMO data; the gamification math is identical for every
// account (XP derives from completed sessions), so the leaderboard is honest.
// Idempotent: each seeded account's subjects/tasks/sessions are wiped and
// rebuilt, so re-running always lands on the same state.
const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@schediq.app";
const DEMO_PASSWORD = "demo1234";
// Seeded operator account for the admin module. Demo credential only: change
// it (or delete the account) on any deployment that is not a local demo.
const ADMIN_EMAIL = "admin@schediq.app";
const ADMIN_PASSWORD = "admin1234";

// Fixed clock anchor so the seed is repeatable within a day.
const now = new Date();

// Build a past-day instant (local) at a given hour for completed sessions.
function pastDay(daysAgo: number, hour: number, minute = 0): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute, 0, 0);
}
// Future deadline, N days out at end of day.
function inDays(n: number, h = 23, m = 59): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + n, h, m, 0, 0);
}

async function wipeUser(userId: string) {
  await prisma.studySession.deleteMany({ where: { task: { userId } } });
  await prisma.task.deleteMany({ where: { userId } });
  await prisma.course.deleteMany({ where: { userId } }); // cascades to lessons
  await prisma.subject.deleteMany({ where: { userId } });
}

// Build a course from the same offline templates the generator uses, then mark
// the first lessons complete at past instants so XP, streak and mastery derive
// from them exactly as they would from real use. score >= 70 = quiz passed.
async function seedCourse(
  userId: string,
  topic: string,
  level: string,
  lessonCount: number,
  subjectId: string | null,
  completions: { daysAgo: number; hour: number; score: number }[]
) {
  const template = pickTemplate(topic, lessonCount);
  const course = await prisma.course.create({
    data: {
      userId,
      subjectId,
      title: template.title,
      topic,
      level,
      description: template.description,
      source: "SEED",
      lessons: {
        create: template.lessons.map((l, i) => ({
          order: i + 1,
          title: l.title,
          content: l.content,
          keyPoints: l.keyPoints,
          quiz: l.quiz as unknown as Prisma.InputJsonValue,
        })),
      },
    },
    include: { lessons: { orderBy: { order: "asc" } } },
  });
  for (const [i, c] of completions.entries()) {
    const at = pastDay(c.daysAgo, c.hour);
    await prisma.lesson.update({
      where: { id: course.lessons[i].id },
      data: { completedAt: at, quizScore: c.score, quizPassedAt: c.score >= 70 ? at : null },
    });
  }
  return course;
}

async function upsertUser(
  email: string,
  name: string,
  password: string,
  role: Role = "USER",
  accountType: AccountType = "FREE"
) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    update: { passwordHash, name, role, accountType },
    create: { email, passwordHash, name, role, accountType },
  });
}

// Create a completed study session in the past, tied to a task, so XP/streak
// derive from it. Duration comes from start/end; completedAt marks it done.
async function completedSession(taskId: string, start: Date, durationMin: number) {
  const end = new Date(start.getTime() + durationMin * 60000);
  await prisma.studySession.create({
    data: { taskId, startsAt: start, endsAt: end, completedAt: end },
  });
}

async function main() {
  // ---------- SUPER ADMIN ----------
  // PREMIUM so the admin never trips the FREE tier gate while demoing.
  await upsertUser(ADMIN_EMAIL, "System Admin", ADMIN_PASSWORD, "SUPER_ADMIN", "PREMIUM");

  // ---------- DEMO USER ----------
  // PREMIUM so the full journey (generate a course for a weak subject) is never
  // blocked by the 2-course FREE cap; free@schediq.app demonstrates the gate.
  const demo = await upsertUser(DEMO_EMAIL, "Demo Student", DEMO_PASSWORD, "USER", "PREMIUM");
  await wipeUser(demo.id);
  // Reset today's AI usage so the FREE cap demo always starts at 0/5.
  await prisma.aiParseLog.deleteMany({ where: { userId: demo.id } });

  const subjectSpecs = [
    { name: "Networking", cognitiveCategory: "Analytical", colorTag: "#3454D1" },
    { name: "Mathematics", cognitiveCategory: "Analytical", colorTag: "#0E9E7E" },
    { name: "Academic Writing", cognitiveCategory: "Verbal", colorTag: "#D98324" },
    { name: "Databases", cognitiveCategory: "Technical", colorTag: "#6B52E0" },
    { name: "Operating Systems", cognitiveCategory: "Technical", colorTag: "#DC2626" },
  ];
  const subjects: Record<string, { id: string }> = {};
  for (const spec of subjectSpecs) {
    const s = await prisma.subject.create({ data: { ...spec, userId: demo.id } });
    subjects[spec.name] = { id: s.id };
  }

  // 18 realistic tasks spread across ~3 weeks, varied type/duration/priority.
  const taskSpecs: {
    title: string;
    subject: string;
    deadline: Date;
    durationMin: number;
    priority: Prisma.TaskCreateInput["priority"];
  }[] = [
    { title: "Subnetting & VLSM practice set", subject: "Networking", deadline: inDays(2), durationMin: 120, priority: "HIGH" },
    { title: "Packet Tracer lab: inter-VLAN routing", subject: "Networking", deadline: inDays(5), durationMin: 90, priority: "MEDIUM" },
    { title: "Read OSPF chapter + notes", subject: "Networking", deadline: inDays(9), durationMin: 60, priority: "LOW" },
    { title: "Networking past paper (2024)", subject: "Networking", deadline: inDays(15), durationMin: 150, priority: "HIGH" },
    { title: "Calculus problem sheet 4", subject: "Mathematics", deadline: inDays(3), durationMin: 90, priority: "MEDIUM" },
    { title: "Linear algebra: eigenvalues drill", subject: "Mathematics", deadline: inDays(7), durationMin: 75, priority: "MEDIUM" },
    { title: "Probability tutorial prep", subject: "Mathematics", deadline: inDays(11), durationMin: 60, priority: "LOW" },
    { title: "Maths exam revision (past papers)", subject: "Mathematics", deadline: inDays(18), durationMin: 180, priority: "HIGH" },
    { title: "Essay: comparative systems analysis", subject: "Academic Writing", deadline: inDays(4), durationMin: 150, priority: "MEDIUM" },
    { title: "Literature review draft", subject: "Academic Writing", deadline: inDays(10), durationMin: 120, priority: "MEDIUM" },
    { title: "Referencing & citations cleanup", subject: "Academic Writing", deadline: inDays(6), durationMin: 30, priority: "LOW" },
    { title: "SQL joins & normalization revision", subject: "Databases", deadline: inDays(2), durationMin: 100, priority: "HIGH" },
    { title: "Database design assignment (ERD)", subject: "Databases", deadline: inDays(8), durationMin: 180, priority: "MEDIUM" },
    { title: "Indexing & query tuning reading", subject: "Databases", deadline: inDays(13), durationMin: 60, priority: "LOW" },
    { title: "OS lab: process scheduling simulation", subject: "Operating Systems", deadline: inDays(5), durationMin: 120, priority: "MEDIUM" },
    { title: "Deadlock & concurrency problem set", subject: "Operating Systems", deadline: inDays(9), durationMin: 90, priority: "MEDIUM" },
    { title: "Memory management flashcards", subject: "Operating Systems", deadline: inDays(14), durationMin: 45, priority: "LOW" },
    { title: "OS midterm exam prep", subject: "Operating Systems", deadline: inDays(16), durationMin: 240, priority: "HIGH" },
    // Deliberately overdue: shows the dashboard's "needs attention" panel. The
    // scheduler places it as soon as possible and flags it OVERDUE.
    { title: "Networking lab report (late)", subject: "Networking", deadline: inDays(-1), durationMin: 60, priority: "HIGH" },
  ];

  const created: Record<string, string> = {}; // title -> taskId
  for (const spec of taskSpecs) {
    const t = await prisma.task.create({
      data: {
        title: spec.title,
        deadline: spec.deadline,
        durationMin: spec.durationMin,
        priority: spec.priority,
        subjectId: subjects[spec.subject].id,
        userId: demo.id,
      },
    });
    created[spec.title] = t.id;
  }

  // Default preferences.
  const preference = await prisma.preference.upsert({
    where: { userId: demo.id },
    update: {},
    create: { userId: demo.id },
  });

  // Generate the forward schedule (future, incomplete) so the calendar is full.
  const tasksWithSubject = await prisma.task.findMany({
    where: { userId: demo.id },
    include: { subject: true },
  });
  const prefs: SchedulerPrefs = {
    maxDailyMins: preference.maxDailyMins,
    preferredStart: preference.preferredStart,
    preferredEnd: preference.preferredEnd,
    breakMins: preference.breakMins,
    clustering: preference.clustering,
  };
  const planned = buildSchedule(tasksWithSubject as unknown as SchedulerTask[], prefs, { now });
  if (planned.length > 0) {
    await prisma.studySession.createMany({
      data: planned.map((p) => ({ taskId: p.taskId, startsAt: p.startsAt, endsAt: p.endsAt })),
    });
    const ids = Array.from(new Set(planned.map((p) => p.taskId)));
    await prisma.task.updateMany({ where: { id: { in: ids } }, data: { status: "SCHEDULED" } });
  }

  // Past COMPLETED sessions give the demo user XP, a streak and badges on login.
  // A 4-day streak up to today, two same-subject blocks per day (earns focus
  // bonuses + Deep Focus), using real tasks so progress stays consistent.
  const demoCompleted: { title: string; daysAgo: number; hour: number; dur: number }[] = [
    { title: "Subnetting & VLSM practice set", daysAgo: 3, hour: 9, dur: 60 },
    { title: "Packet Tracer lab: inter-VLAN routing", daysAgo: 3, hour: 10, dur: 60 },
    { title: "Calculus problem sheet 4", daysAgo: 2, hour: 9, dur: 90 },
    { title: "Linear algebra: eigenvalues drill", daysAgo: 2, hour: 11, dur: 75 },
    { title: "SQL joins & normalization revision", daysAgo: 1, hour: 14, dur: 60 },
    { title: "Database design assignment (ERD)", daysAgo: 1, hour: 15, dur: 90 },
    { title: "Essay: comparative systems analysis", daysAgo: 0, hour: 8, dur: 60 },
    { title: "Referencing & citations cleanup", daysAgo: 0, hour: 9, dur: 30 },
  ];
  for (const c of demoCompleted) {
    await completedSession(created[c.title], pastDay(c.daysAgo, c.hour), c.dur);
  }

  // ---------- DEMO COURSES (the connected use case) ----------
  // Databases: in progress, 2 of 5 lessons (~40%), one quiz passed, one failed.
  // Networking: a finished 3-lesson course (Course Complete badge, milestone XP).
  // Operating Systems: generated but untouched, and its tasks have no completed
  // sessions, so its mastery starts at 0 and visibly jumps when a lesson + quiz
  // is completed live during the demo.
  await seedCourse(demo.id, "SQL and relational databases", "BEGINNER", 5, subjects["Databases"].id, [
    { daysAgo: 2, hour: 17, score: 100 },
    { daysAgo: 1, hour: 18, score: 67 },
  ]);
  await seedCourse(demo.id, "Networking subnetting and routing", "INTERMEDIATE", 3, subjects["Networking"].id, [
    { daysAgo: 6, hour: 16, score: 100 },
    { daysAgo: 5, hour: 16, score: 67 },
    { daysAgo: 3, hour: 13, score: 100 },
  ]);
  await seedCourse(demo.id, "Operating systems processes and deadlock", "BEGINNER", 5, subjects["Operating Systems"].id, []);

  // ---------- FREE-TIER ACCOUNT ----------
  // Already at the 2-course FREE cap, so "Generate a course" shows the Upgrade
  // prompt straight away; upgrading on /upgrade lifts it.
  const free = await upsertUser("free@schediq.app", "Free Student", "free1234", "USER", "FREE");
  await wipeUser(free.id);
  await prisma.aiParseLog.deleteMany({ where: { userId: free.id } });
  const freeSubject = await prisma.subject.create({
    data: { name: "Programming", cognitiveCategory: "Technical", colorTag: "#6B52E0", userId: free.id },
  });
  await seedCourse(free.id, "Python programming", "BEGINNER", 4, freeSubject.id, [{ daysAgo: 1, hour: 10, score: 100 }]);
  await seedCourse(free.id, "Cybersecurity basics", "BEGINNER", 3, null, []);

  // ---------- LEADERBOARD COHORT (demo classmates) ----------
  // Each classmate is a full account with their own subjects/tasks and a set of
  // completed past sessions, so their XP derives identically. Counts are tuned
  // so the demo user lands around 3rd-4th.
  const cohort: {
    email: string;
    name: string;
    category: string;
    color: string;
    // completed blocks: [daysAgo, hour, durationMin]
    blocks: [number, number, number][];
  }[] = [
    {
      email: "aphiwe@demo.schediq.app", name: "Aphiwe M.", category: "Analytical", color: "#3454D1",
      blocks: [[5,9,120],[5,11,120],[4,9,90],[4,11,90],[3,9,120],[3,11,90],[2,9,120],[2,11,120],[1,9,90],[1,11,120],[0,9,90],[0,11,90]],
    },
    {
      email: "thabo@demo.schediq.app", name: "Thabo N.", category: "Technical", color: "#6B52E0",
      blocks: [[4,10,120],[4,12,90],[3,10,120],[3,12,90],[2,10,90],[2,12,120],[1,10,90],[1,12,90],[0,10,120]],
    },
    {
      email: "lerato@demo.schediq.app", name: "Lerato K.", category: "Verbal", color: "#D98324",
      blocks: [[3,9,120],[3,11,90],[2,9,90],[2,11,90],[1,9,120],[1,11,90],[0,9,90]],
    },
    {
      email: "sipho@demo.schediq.app", name: "Sipho D.", category: "Analytical", color: "#0E9E7E",
      blocks: [[2,9,90],[2,11,60],[1,9,90],[1,11,60],[0,9,60]],
    },
    {
      email: "naledi@demo.schediq.app", name: "Naledi P.", category: "Technical", color: "#DC2626",
      blocks: [[1,9,60],[1,10,45],[0,9,60]],
    },
    {
      email: "kyle@demo.schediq.app", name: "Kyle R.", category: "Verbal", color: "#0891B2",
      blocks: [[0,9,45],[0,10,30]],
    },
  ];

  for (let i = 0; i < cohort.length; i++) {
    const c = cohort[i];
    const u = await upsertUser(c.email, c.name, "demo1234");
    await wipeUser(u.id);
    const subj = await prisma.subject.create({
      data: { name: `${c.category} focus`, cognitiveCategory: c.category, colorTag: c.color, userId: u.id },
    });
    // One task to hang the completed sessions on (deadline in the near future).
    const task = await prisma.task.create({
      data: {
        title: "Study block",
        deadline: inDays(7),
        durationMin: 120,
        priority: "MEDIUM",
        subjectId: subj.id,
        userId: u.id,
        status: "SCHEDULED",
      },
    });
    for (const [daysAgo, hour, dur] of c.blocks) {
      await completedSession(task.id, pastDay(daysAgo, hour), dur);
    }
  }

  console.log("Seeded free@schediq.app (password free1234, FREE, at the 2-course cap).");
  console.log("Seeded 3 demo courses (Databases 2/5, Networking 3/3, Operating Systems 0/5).");
  console.log(`Seeded super admin ${ADMIN_EMAIL} (password ${ADMIN_PASSWORD}, SUPER_ADMIN, PREMIUM).`);
  console.log(
    `Seeded ${DEMO_EMAIL} (password ${DEMO_PASSWORD}): ${subjectSpecs.length} subjects, ` +
      `${taskSpecs.length} tasks, ${planned.length} planned sessions, ` +
      `${demoCompleted.length} completed sessions; plus ${cohort.length} demo classmates.`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
