import { DurableObject } from "cloudflare:workers";

/* Lanes are the whole point: a mob becomes coverage the moment everyone
   is standing somewhere different. */
const LANES = [
  { id: "forms",   label: "FORMS",        brief: "Every input. Empty, huge, emoji, paste, tab order, double-submit." },
  { id: "mobile",  label: "SMALL SCREEN", brief: "Narrow the window to 375px. What overflows, overlaps, or vanishes." },
  { id: "links",   label: "LINKS",        brief: "Click everything. Dead ends, wrong tabs, 404s, back button." },
  { id: "edge",    label: "EDGE INPUT",   brief: "Absurd values. Negative, zero, 10,000 chars, script tags, unicode." },
  { id: "flow",    label: "THE FLOW",     brief: "The one thing the site is FOR. Do it start to finish. Then do it wrong." },
  { id: "slow",    label: "SLOW + COLD",  brief: "Hard reload, throttled, no cache. What breaks before it loads." },
  { id: "a11y",    label: "KEYBOARD",     brief: "Tab only, no mouse. Focus visible? Can you escape? Can you finish?" },
  { id: "copy",    label: "WORDS",        brief: "Typos, lies, stale prices, broken tone, unlabelled buttons." },
  { id: "look",    label: "LOOK",         brief: "Colour, contrast, spacing, hierarchy. What is ugly and what is unreadable." },
  { id: "idea",    label: "WHAT'S MISSING", brief: "Not bugs. The feature that should obviously exist and does not." }
];

const SEV = { low: 1, med: 2, high: 3 };

const KINDS = {
  bug:     { label: "BUG",     verb: "broke" },
  feature: { label: "FEATURE", verb: "wants" },
  design:  { label: "DESIGN",  verb: "would change" },
  patch:   { label: "PATCH",   verb: "wrote a fix for" }
};
const STATUS = { open: 1, merged: 1, closed: 1 };

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type"
};
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...CORS } });

const clean = (v, n) =>
  String(v == null ? "" : v).slice(0, n).replace(/[\x00-\x1f\x7f]/g, "").trim();

/* crude but effective: the same bug said two ways should collide */
const STOP = new Set(["the","a","an","is","are","it","its","on","in","at","to","of","and","or","for","with","this","that","when","you","i","not","no","doesnt","dont","cant","wont","page","site","button","link"]);
function fingerprint(t) {
  const words = String(t).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  return words.sort().slice(0, 6).join(" ");
}
function similar(a, b) {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  A.forEach((w) => { if (B.has(w)) hit++; });
  return hit / Math.min(A.size, B.size);
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.s = null;
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get("s")) || {
        target: "", players: [], finds: [], msgs: [], seq: 0, fid: 0, started: 0,
        strokes: [], sid: 0, plan: [], pid: 0
      };
      if (!this.s.strokes) { this.s.strokes = []; this.s.sid = 0; }
      if (!this.s.plan) { this.s.plan = []; this.s.pid = 0; }
    });
  }
  async save() { await this.ctx.storage.put("s", this.s); }

  push(from, body, kind) {
    const s = this.s;
    s.seq += 1;
    s.msgs.push({ i: s.seq, from, body, kind: kind || "say" });
    if (s.msgs.length > 260) s.msgs = s.msgs.slice(-260);
  }
  p(id) { return this.s.players.find((x) => x.id === id) || null; }

  /* hand out the emptiest lane, so coverage spreads instead of clumping */
  assignLane() {
    const count = {};
    LANES.forEach((l) => { count[l.id] = 0; });
    this.s.players.forEach((p) => { if (p.lane) count[p.lane] = (count[p.lane] || 0) + 1; });
    let best = LANES[0].id, low = Infinity;
    for (const l of LANES) {
      if (count[l.id] < low) { low = count[l.id]; best = l.id; }
    }
    return best;
  }

  coverage() {
    const out = {};
    LANES.forEach((l) => { out[l.id] = { finds: 0, people: 0 }; });
    this.s.players.forEach((p) => { if (p.lane && out[p.lane]) out[p.lane].people += 1; });
    this.s.finds.forEach((f) => { if (out[f.lane]) out[f.lane].finds += 1; });
    return out;
  }

  async fetch(req) {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const act = parts[parts.length - 1];
    const s = this.s;

    if (req.method === "GET" && act === "state") {
      const since = Number(url.searchParams.get("since") || 0) || 0;
      return json({
        target: s.target,
        started: s.started,
        seq: s.seq,
        lanes: LANES,
        kinds: KINDS,
        coverage: this.coverage(),
        players: s.players.map((p) => ({ id: p.id, name: p.name, lane: p.lane, av: p.av || 0, finds: p.finds || 0 })),
        finds: s.finds,
        strokes: s.strokes,
        sid: s.sid,
        plan: s.plan,
        msgs: s.msgs.filter((m) => m.i > since)
      });
    }

    let b = {};
    try { b = await req.json(); } catch (e) { b = {}; }

    if (act === "join") {
      const name = clean(b.name, 14).toUpperCase().replace(/[^A-Z0-9 _-]/g, "");
      if (!name) return json({ error: "name required" }, 400);
      let p = s.players.find((x) => x.name === name);
      if (!p) {
        if (s.players.length >= 16) return json({ error: "room is full" }, 400);
        const taken = s.players.map((x) => x.av);
        let av = Math.floor(Math.random() * 24);
        for (let k = 0; k < 24 && taken.indexOf(av) >= 0; k++) av = (av + 1) % 24;
        p = { id: crypto.randomUUID().slice(0, 8), name, av, lane: this.assignLane(), finds: 0 };
        s.players.push(p);
        const L = LANES.find((l) => l.id === p.lane);
        this.push("SYS", name + " took " + (L ? L.label : p.lane), "sys");
      }
      const t = clean(b.target, 300);
      if (t && !s.target) {
        s.target = /^https?:\/\//i.test(t) ? t : "https://" + t;
        s.started = 1;
        this.push("SYS", "target locked: " + s.target, "sys");
      }
      await this.save();
      return json({ id: p.id, name: p.name, lane: p.lane, target: s.target, lanes: LANES });
    }

    if (act === "relane") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const want = clean(b.lane, 20);
      if (!LANES.find((l) => l.id === want)) return json({ error: "no such lane" }, 400);
      p.lane = want;
      const L = LANES.find((l) => l.id === want);
      this.push("SYS", p.name + " moved to " + L.label, "sys");
      await this.save();
      return json({ ok: true, lane: p.lane });
    }

    /* the anti-dogpile gate: check BEFORE you can file */
    if (act === "check") {
      const fp = fingerprint(clean(b.text, 300));
      const hits = s.finds
        .map((f) => ({ f, score: similar(fp, f.fp) }))
        .filter((x) => x.score >= 0.6)
        .sort((a, c) => c.score - a.score)
        .slice(0, 3)
        .map((x) => x.f);
      return json({ dupes: hits });
    }

    if (act === "file") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const text = clean(b.text, 300);
      if (text.length < 6) return json({ error: "say what actually happened" }, 400);
      const steps = clean(b.steps, 300);
      const sev = SEV[clean(b.sev, 6)] ? clean(b.sev, 6) : "med";
      const kind = KINDS[clean(b.kind, 10)] ? clean(b.kind, 10) : "bug";
      const code = String(b.code == null ? "" : b.code).slice(0, 4000);
      const color = clean(b.color, 40);
      const fp = fingerprint(text);

      const dupe = s.finds
        .map((f) => ({ f, score: similar(fp, f.fp) }))
        .filter((x) => x.score >= 0.6)
        .sort((a, c) => c.score - a.score)[0];

      if (dupe && !b.force) {
        return json({ dupe: dupe.f });
      }

      s.fid += 1;
      const find = {
        id: s.fid, by: p.name, av: p.av, lane: p.lane, text, steps,
        sev, kind, code, color, status: "open", fp, plus: [], dead: false,
        replies: []
      };
      s.finds.unshift(find);
      if (s.finds.length > 200) s.finds.length = 200;
      p.finds = (p.finds || 0) + 1;
      this.push(p.name, KINDS[kind].label + ": " + text, "find");
      await this.save();
      return json({ ok: true, find });
    }

    if (act === "plus") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const f = s.finds.find((x) => x.id === Number(b.find));
      if (!f) return json({ error: "no such find" }, 404);
      const at = f.plus.indexOf(p.name);
      if (at >= 0) f.plus.splice(at, 1); else f.plus.push(p.name);
      await this.save();
      return json({ ok: true, plus: f.plus });
    }

    if (act === "mark") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const f = s.finds.find((x) => x.id === Number(b.find));
      if (!f) return json({ error: "no such find" }, 404);
      const st = clean(b.status, 10);
      if (!STATUS[st]) return json({ error: "bad status" }, 400);
      f.status = st;
      const word = st === "merged" ? "shipped" : st === "closed" ? "closed" : "reopened";
      this.push("SYS", p.name + " " + word + " #" + f.id, "sys");
      await this.save();
      return json({ ok: true, status: f.status });
    }

    if (act === "reply") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const f = s.finds.find((x) => x.id === Number(b.find));
      if (!f) return json({ error: "no such find" }, 404);
      const text = clean(b.text, 240);
      if (!text) return json({ error: "empty" }, 400);
      f.replies = f.replies || [];
      f.replies.push({ by: p.name, av: p.av, text });
      if (f.replies.length > 40) f.replies = f.replies.slice(-40);
      await this.save();
      return json({ ok: true, replies: f.replies });
    }

    if (act === "kill") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const f = s.finds.find((x) => x.id === Number(b.find));
      if (!f) return json({ error: "no such find" }, 404);
      f.dead = !f.dead;
      this.push("SYS", p.name + (f.dead ? " marked #" + f.id + " not-a-bug" : " reopened #" + f.id), "sys");
      await this.save();
      return json({ ok: true, dead: f.dead });
    }

    if (act === "draw") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const st = b.stroke || {};
      const pts = Array.isArray(st.pts) ? st.pts.slice(0, 400) : [];
      if (pts.length < 2) return json({ error: "nothing drawn" }, 400);
      const safe = [];
      for (const q of pts) {
        if (!Array.isArray(q) || q.length < 2) continue;
        const x = Number(q[0]), y = Number(q[1]);
        if (!isFinite(x) || !isFinite(y)) continue;
        safe.push([Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))]);
      }
      if (safe.length < 2) return json({ error: "nothing drawn" }, 400);
      s.sid += 1;
      s.strokes.push({
        i: s.sid, by: p.name,
        c: clean(st.c, 12) || "#EDE6D8",
        w: Math.max(1, Math.min(14, Number(st.w) || 2)),
        pts: safe
      });
      if (s.strokes.length > 900) s.strokes = s.strokes.slice(-900);
      await this.save();
      return json({ ok: true, i: s.sid });
    }

    if (act === "undraw") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      if (b.all) {
        s.strokes = [];
        this.push("SYS", p.name + " wiped the whiteboard", "sys");
      } else {
        for (let i = s.strokes.length - 1; i >= 0; i--) {
          if (s.strokes[i].by === p.name) { s.strokes.splice(i, 1); break; }
        }
      }
      await this.save();
      return json({ ok: true, n: s.strokes.length });
    }

    /* the plan: what the crew actually agreed to do about all this */
    if (act === "plan") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const text = clean(b.text, 200);
      if (!text) return json({ error: "empty" }, 400);
      s.pid += 1;
      s.plan.push({ id: s.pid, text, by: p.name, done: false, from: Number(b.from) || 0 });
      if (s.plan.length > 60) s.plan = s.plan.slice(-60);
      await this.save();
      return json({ ok: true, plan: s.plan });
    }

    if (act === "planpoke") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const it = s.plan.find((x) => x.id === Number(b.item));
      if (!it) return json({ error: "no such item" }, 404);
      if (b.remove) s.plan = s.plan.filter((x) => x.id !== it.id);
      else it.done = !it.done;
      await this.save();
      return json({ ok: true, plan: s.plan });
    }

    if (act === "say") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const text = clean(b.text, 240);
      if (!text) return json({ error: "empty" }, 400);
      this.push(p.name, text, "say");
      await this.save();
      return json({ ok: true });
    }

    if (act === "reset") {
      this.s = { target: "", players: [], finds: [], msgs: [], seq: 0, fid: 0, started: 0,
        strokes: [], sid: 0, plan: [], pid: 0 };
      await this.save();
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 404);
  }
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "lanes") return json({ lanes: LANES, kinds: KINDS });
    if (parts[0] !== "r" || parts.length < 3) return json({ error: "not found" }, 404);
    const code = parts[1].toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    if (!code) return json({ error: "bad room" }, 400);
    return env.ROOM.get(env.ROOM.idFromName(code)).fetch(req);
  }
};
