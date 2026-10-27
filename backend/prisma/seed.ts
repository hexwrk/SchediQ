import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { buildSchedule, SchedulerTask, SchedulerPrefs } from "../src/lib/scheduler";

// Seed a populated, lived-in demo account so the app looks real on first login.
// Idempotent: re-running wipes and rebuilds the demo user's data, so the demo
// always starts from a known state.
const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@schediq.app";
const DEMO_PASSWORD = "demo1234";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // Upsert the demo user (cascade deletes clear old subjects/tasks/sessions on
  // the full reset below).
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash, name: "Demo Student" },
    create: { email: DEMO_EMAIL, passwordHash, name: "Demo Student" },
  });

  // Clean slate for the demo user so the seed is repeatable.
  await prisma.studySession.deleteMany({ where: { task: { userId: user.id } } });
  await prisma.task.deleteMany({ where: { userId: user.id } });
  await prisma.subject.deleteMany({ where: { userId: user.id } });

  // Four subjects across distinct cognitive categories and colours.
  const subjectSpecs = [
    { name: "Networking", cognitiveCategory: "Analytical", colorTag: "#3454D1" },
    { name: "Maths", cognitiveCategory: "Analytical", colorTag: "#0E9E7E" },
    { name: "English", cognitiveCategory: "Verbal", colorTag: "#D98324" },
    { name: "Databases", cognitiveCategory: "Technical", colorTag: "#6B52E0" },
  ];

  const subjects: Record<string, { id: string; cognitiveCategory: string }> = {};
  for (const spec of subjectSpecs) {
    const s = await prisma.subject.create({ data: { ...spec, userId: user.id } });
    subjects[spec.name] = { id: s.id, cognitiveCategory: s.cognitiveCategory };
  }

  const now = new Date();
  const inDays = (n: number, h = 23, m = 59) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + n, h, m, 0, 0);

  // Four realistic tasks with varied deadlines/priorities/durations.
  const taskSpecs = [
    { title: "Subnetting practice set", subject: "Networking", deadline: inDays(2), durationMin: 120, priority: "HIGH" as const },
    { title: "Calculus problem sheet 4", subject: "Maths", deadline: inDays(3), durationMin: 90, priority: "MEDIUM" as const },
    { title: "Essay: comparative analysis", subject: "English", deadline: inDays(4), durationMin: 150, priority: "MEDIUM" as const },
    { title: "SQL joins + normalization revision", subject: "Databases", deadline: inDays(5), durationMin: 100, priority: "HIGH" as const },
  ];

  const createdTasks = [];
  for (const spec of taskSpecs) {
    const t = await prisma.task.create({
      data: {
        title: spec.title,
        deadline: spec.deadline,
        durationMin: spec.durationMin,
        priority: spec.priority,
        subjectId: subjects[spec.subject].id,
        userId: user.id,
      },
    });
    createdTasks.push(t);
  }

  // Default preferences for the demo user.
  const preference = await prisma.preference.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  // Generate the initial schedule using the real scheduler, so login lands on a
  // populated calendar. Load tasks with subject so clustering/penalty apply.
  const tasksWithSubject = await prisma.task.findMany({
    where: { userId: user.id },
    include: { subject: true },
  });

  const prefs: SchedulerPrefs = {
    maxDailyMins: preference.maxDailyMins,
    preferredStart: preference.preferredStart,
    preferredEnd: preference.preferredEnd,
    breakMins: preference.breakMins,
    clustering: preference.clustering,
  };

  const planned = buildSchedule(
    tasksWithSubject as unknown as SchedulerTask[],
    prefs,
    { now }
  );

  if (planned.length > 0) {
    await prisma.studySession.createMany({
      data: planned.map((p) => ({
        taskId: p.taskId,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
      })),
    });
    const scheduledIds = Array.from(new Set(planned.map((p) => p.taskId)));
    await prisma.task.updateMany({
      where: { id: { in: scheduledIds } },
      data: { status: "SCHEDULED" },
    });
  }

  console.log(
    `Seeded demo user ${DEMO_EMAIL} (password ${DEMO_PASSWORD}) with ` +
      `${subjectSpecs.length} subjects, ${taskSpecs.length} tasks, ${planned.length} sessions.`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
