import { getStore } from "@netlify/blobs";
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[\u064B-\u0652\u0640]/g, "").toLowerCase();
const key = (n) => "s/" + Array.from(new TextEncoder().encode(norm(n))).map((x) => x.toString(16)).join("").slice(0, 120);
export default async (req) => {
  const store = getStore("students");
  const path = new URL(req.url).pathname;
  const b = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const get = (n) => store.get(key(n), { type: "json" });
  if (path.endsWith("/login")) {
    const s = await get(b.name);
    return s ? J({ name: s.name, lessons: s.lessons || {}, exams: s.exams || {} }) : J({ error: "notfound" }, 404);
  }
  if (path.endsWith("/log")) {
    const s = await get(b.name);
    if (!s) return J({ error: "notfound" }, 403);
    const now = Date.now();
    s.last = now;
    if (b.type === "login") s.logins = (s.logins || 0) + 1;
    const lt = String(b.lt || "").slice(0, 80);
    if (b.ex && lt) {
      s.exams = s.exams || {};
      const e = s.exams[lt];
      if (e && e.done) return J({ error: "done" }, 409);
      if (b.type === "exstart") s.exams[lt] = e || { done: false, started: now };
      else if (b.type === "result") s.exams[lt] = { done: true, score: +b.score | 0, total: +b.total | 0, v: +b.v | 0, ts: now };
    } else if (lt) {
      const l = (s.lessons[lt] = s.lessons[lt] || { opened: now, done: false });
      if (b.type === "result") {
        l.done = true; l.score = +b.score | 0; l.total = +b.total | 0; l.ts = now;
        if (!(l.best >= l.score)) l.best = l.score;
      }
    }
    s.log.unshift({ t: String(b.type || ""), lt, score: b.score, total: b.total, ts: now });
    s.log = s.log.slice(0, 30);
    await store.setJSON(key(s.name), s);
    return J({ ok: 1 });
  }
  const P = process.env.TEACHER_PASSWORD || "4321";
  if (b.pass !== P) return J({ error: "auth" }, 401);
  if (path.endsWith("/report")) {
    const { blobs } = await store.list({ prefix: "s/" });
    const all = await Promise.all(blobs.map((x) => store.get(x.key, { type: "json" })));
    return J(all.filter(Boolean));
  }
  if (path.endsWith("/add")) {
    let added = 0, skipped = 0;
    for (const raw of (Array.isArray(b.names) ? b.names : []).slice(0, 500)) {
      const name = String(raw || "").trim().replace(/\s+/g, " ").slice(0, 40);
      if (!name) continue;
      if (await get(name)) { skipped++; continue; }
      await store.setJSON(key(name), { name, logins: 0, lessons: {}, exams: {}, log: [], last: 0 });
      added++;
    }
    return J({ added, skipped });
  }
  if (path.endsWith("/del")) {
    await store.delete(key(b.name));
    return J({ ok: 1 });
  }
  return J({ error: "not found" }, 404);
};
export const config = { path: "/api/*" };
