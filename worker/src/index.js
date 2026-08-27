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


/* Lanes are not a fixed menu. We read the actual page and hand out lanes for
   what is really on it, plus the handful that apply to any site. */
const BASE_LANES = [
  { id: "mobile", label: "SMALL SCREEN", brief: "Narrow the window to 375px. What overflows, overlaps, or vanishes." },
  { id: "a11y",   label: "KEYBOARD",     brief: "Tab only, no mouse. Focus visible? Can you escape? Can you finish?" },
  { id: "slow",   label: "SLOW + COLD",  brief: "Hard reload, throttled, no cache. What breaks before it loads." },
  { id: "copy",   label: "WORDS",        brief: "Typos, lies, stale prices, broken tone, unlabelled buttons." },
  { id: "look",   label: "LOOK",         brief: "Colour, contrast, spacing, hierarchy. What is ugly and what is unreadable." },
  { id: "idea",   label: "WHAT'S MISSING", brief: "Not bugs. The feature that should obviously exist and does not." }
];

function deriveLanes(html, url) {
  const h = String(html || "");
  const low = h.toLowerCase();
  const found = [];
  const count = (re) => (h.match(re) || []).length;
  const has = (re) => re.test(h);

  const forms = count(/<form\b/gi);
  const inputs = count(/<input\b/gi);
  const pw = has(/<input[^>]+type=["']password["']/i);
  const search = has(/type=["']search["']/i) || has(/name=["'](q|s|search|query)["']/i);
  const links = count(/<a\b[^>]*href=/gi);
  const imgs = count(/<img\b/gi);
  const media = count(/<(video|audio|iframe)\b/gi);
  const tables = count(/<table\b/gi);
  const buttons = count(/<button\b/gi);
  const selects = count(/<select\b/gi);
  const commerce = /\b(cart|checkout|add to (bag|cart)|basket|\$[0-9]|price|pricing|subscribe|buy now)\b/i.test(low);
  const auth = pw || /\b(sign ?in|log ?in|sign ?up|register|create account)\b/i.test(low);
  const upload = has(/type=["']file["']/i);
  const map = /\b(map|leaflet|mapbox|google\.com\/maps)\b/i.test(low);
  const dates = has(/type=["']date(time)?(-local)?["']/i) || /\b(calendar|datepicker|book a|reservation)\b/i.test(low);

  if (auth) found.push({ id: "auth", label: "SIGN IN", brief: "Wrong password, empty fields, reset flow, what the error message leaks." });
  if (forms || inputs > 2) found.push({ id: "forms", label: "FORMS", brief: forms + " form(s), " + inputs + " input(s). Empty, huge, emoji, paste, tab order, double-submit." });
  if (search) found.push({ id: "search", label: "SEARCH", brief: "Empty query, gibberish, one letter, 500 characters, quotes and slashes." });
  if (commerce) found.push({ id: "buy", label: "THE MONEY BIT", brief: "Cart, prices, checkout. Quantity zero, negative, back button mid-flow." });
  if (upload) found.push({ id: "upload", label: "UPLOADS", brief: "Wrong file type, enormous file, zero-byte file, cancel halfway." });
  if (dates) found.push({ id: "dates", label: "DATES", brief: "Yesterday, year 1900, year 3000, end before start, other timezones." });
  if (selects > 1) found.push({ id: "selects", label: "DROPDOWNS", brief: selects + " of them. Default values, keyboard opening, options that should be disabled." });
  if (tables) found.push({ id: "tables", label: "TABLES", brief: tables + " table(s). Sorting, empty state, long values, what happens narrow." });
  if (media) found.push({ id: "media", label: "MEDIA", brief: media + " embed(s). Autoplay, no sound, slow network, does it block the page." });
  if (links > 12) found.push({ id: "links", label: "LINKS", brief: links + " links on this page. Dead ends, wrong tabs, 404s, back button." });
  if (imgs > 3) found.push({ id: "imgs", label: "IMAGES", brief: imgs + " images. Broken sources, alt text, layout shift, huge files." });
  if (buttons > 2) found.push({ id: "flow", label: "THE FLOW", brief: "The one thing this site is FOR. Do it start to finish. Then do it wrong." });
  found.push({ id: "edge", label: "EDGE INPUT", brief: "Absurd values anywhere they are accepted. Negative, zero, 10k chars, script tags, unicode." });

  const seen = {};
  const all = found.concat(BASE_LANES).filter((l) => {
    if (seen[l.id]) return false;
    seen[l.id] = 1;
    return true;
  });
  return all.slice(0, 14);
}

const SEV = { low: 1, med: 2, high: 3 };

const KINDS = {
  bug:     { label: "BUG",     verb: "broke" },
  feature: { label: "FEATURE", verb: "wants" },
  design:  { label: "DESIGN",  verb: "would change" },
  patch:   { label: "PATCH",   verb: "wrote a fix for" }
};
const STATUS = { open: 1, merged: 1, closed: 1 };

const REVIEWER = [
  "You are THE REVIEWER, a senior engineer doing code review on a red-team board.",
  "You are blunt, fast and useful. You are not a cheerleader and not a chatbot.",
  "",
  "RULES:",
  "- Maximum THREE short sentences. No preamble, no sign-off, no lists.",
  "- Lead with the verdict: does this actually fix what it claims?",
  "- Name a CONCRETE risk if there is one: what input, what browser, what edge case breaks it.",
  "- If the patch is fine, say so in one line and name the one thing still missing.",
  "- Never invent code that was not shown. Never rewrite the whole thing.",
  "- No markdown headers, no bullet points, no emoji, no backtick fences."
].join("\n");

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


/* Real checks against the real response. Nothing here is guessed:
   every finding is something present or absent in the bytes we fetched. */
function sweepChecks(res, html, url) {
  const H = (k) => (res.headers.get(k) || "").toLowerCase();
  const https = /^https:/i.test(url);
  const out = [];
  const add = (lane, sev, text, steps) => out.push({ lane, sev, text, steps });

  if (!H("content-security-policy")) {
    add("edge", "high", "No Content-Security-Policy header, so any injected script runs freely",
      "curl -sI " + url + " | grep -i content-security-policy  ->  nothing");
  }
  if (!H("x-frame-options") && !/frame-ancestors/.test(H("content-security-policy"))) {
    add("edge", "high", "Nothing stops this page being framed, so it can be clickjacked",
      "no x-frame-options and no frame-ancestors in CSP");
  }
  if (https && !H("strict-transport-security")) {
    add("edge", "med", "HTTPS with no HSTS header, so a first visit can still be downgraded",
      "curl -sI " + url + " | grep -i strict-transport-security  ->  nothing");
  }
  if (H("x-content-type-options") !== "nosniff") {
    add("edge", "med", "No nosniff header, so the browser may MIME-sniff an upload into script",
      "x-content-type-options is " + (H("x-content-type-options") || "absent"));
  }
  const srv = res.headers.get("server") || "";
  if (/\d/.test(srv)) {
    add("edge", "low", "Server header leaks an exact version: " + srv, "curl -sI " + url + " | grep -i ^server");
  }

  const blanks = (html.match(/<a\b[^>]*target=["']?_blank[^>]*>/gi) || []);
  const unsafe = blanks.filter((t) => !/rel=["'][^"']*noopener/i.test(t));
  if (unsafe.length) {
    add("links", "med", unsafe.length + " link(s) open a new tab without rel=noopener, so the new page can reach window.opener",
      "first one: " + unsafe[0].slice(0, 110));
  }
  if (https) {
    const mixed = (html.match(/(?:src|href)=["']http:\/\/[^"']+/gi) || []);
    if (mixed.length) add("slow", "high", mixed.length + " resource(s) loaded over plain http on an https page",
      "first one: " + mixed[0].slice(0, 110));
  }
  const inline = (html.match(/\son[a-z]+=["']/gi) || []);
  if (inline.length > 2) {
    add("edge", "low", inline.length + " inline event handlers in the markup, which any CSP will block later",
      "grep for on-click style attributes in the source");
  }
  if (/\bdocument\.write\s*\(/.test(html)) {
    add("slow", "med", "document.write is still in the page, which blocks parsing and breaks on slow connections", "search the source for document.write");
  }
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) {
    add("mobile", "high", "No viewport meta tag, so this renders desktop-width and unusable on a phone", "open it on a 375px screen");
  }
  const imgs = (html.match(/<img\b[^>]*>/gi) || []);
  const noalt = imgs.filter((t) => !/\balt=/i.test(t));
  if (noalt.length) {
    add("a11y", "med", noalt.length + " of " + imgs.length + " images have no alt attribute",
      "first one: " + noalt[0].slice(0, 110));
  }
  if (!/<html[^>]+lang=/i.test(html)) {
    add("a11y", "low", "The html tag has no lang attribute, so screen readers guess the language", "look at the opening html tag");
  }
  const title = (html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i) || [])[1];
  if (!title || !title.trim()) {
    add("copy", "med", "The page has no title, so every tab and every search result is blank", "check the tab name");
  }
  const pw = /<input[^>]+type=["']password["'][^>]*>/i.test(html);
  const getform = /<form[^>]+method=["']get["'][^>]*>/i.test(html);
  if (pw && getform) {
    add("forms", "high", "A password field sits on a form that may submit by GET, putting the password in the URL", "check the form method around the password input");
  }
  if (!/<meta[^>]+name=["']description["']/i.test(html)) {
    add("copy", "low", "No meta description, so search and link previews scrape whatever text is first", "view source, look for meta description");
  }
  return out;
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.s = null;
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get("s")) || {
        target: "", players: [], finds: [], msgs: [], seq: 0, fid: 0, started: 0,
        strokes: [], sid: 0, plan: [], pid: 0, notes: [], nid: 0, lanes: null, laneSrc: ""
      };
      if (!this.s.notes) { this.s.notes = []; this.s.nid = 0; }
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
  L() { return (this.s.lanes && this.s.lanes.length) ? this.s.lanes : LANES; }

  assignLane() {
    const count = {};
    this.L().forEach((l) => { count[l.id] = 0; });
    this.s.players.forEach((p) => { if (p.lane) count[p.lane] = (count[p.lane] || 0) + 1; });
    const LL = this.L();
    let best = LL[0].id, low = Infinity;
    for (const l of LL) {
      if (count[l.id] < low) { low = count[l.id]; best = l.id; }
    }
    return best;
  }

  coverage() {
    const out = {};
    this.L().forEach((l) => { out[l.id] = { finds: 0, people: 0 }; });
    this.s.players.forEach((p) => { if (p.lane && out[p.lane]) out[p.lane].people += 1; });
    this.s.finds.forEach((f) => { if (out[f.lane]) out[f.lane].finds += 1; });
    return out;
  }

  async review(kind, text, code, steps, asker) {
    const E = this.env;
    if (!E || !E.AI) return null;
    const s = this.s;
    s.ai = s.ai || { n: 0, last: 0 };
    const now = Date.now();
    if (s.ai.n >= 200) return null;
    if (now - s.ai.last < 400) return null;
    s.ai.n += 1; s.ai.last = now;

    const what = kind === "patch"
      ? ("A patch was submitted.\nIt claims: " + text +
         (steps ? "\nRepro it was meant to fix: " + steps : "") +
         "\n\nTHE CODE:\n" + String(code).slice(0, 2600))
      : ("Someone filed a " + kind + " on the board:\n" + text +
         (steps ? "\nSteps: " + steps : ""));

    try {
      const out = await E.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
        max_tokens: 190,
        temperature: 0.5,
        messages: [
          { role: "system", content: REVIEWER + "\n\nThe site being tested is: " + (s.target || "unknown") },
          { role: "user", content: what + "\n\nReview it." }
        ]
      });
      let r = "";
      if (out) {
        if (typeof out.response === "string") r = out.response;
        else if (out.choices && out.choices[0] && out.choices[0].message &&
                 typeof out.choices[0].message.content === "string") r = out.choices[0].message.content;
      }
      r = (r + "").replace(/```[a-z]*/gi, "").replace(/^[\s"']+|[\s"']+$/g, "").replace(/\s+/g, " ").trim();
      if (r.length > 400) r = r.slice(0, 397).replace(/\s\S*$/, "") + ".";
      return r.length > 4 ? r : null;
    } catch (e) { return null; }
  }

  async buildLanes() {
    const s = this.s;
    if (!s.target) return false;
    let host = "";
    try { host = new URL(s.target).hostname; } catch (e) { return false; }
    if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/i.test(host)) return false;
    try {
      const res = await fetch(s.target, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; DogpileBot/1.0)" }, redirect: "follow"
      });
      const html = (await res.text()).slice(0, 300000);
      const lanes = deriveLanes(html, s.target);
      if (!lanes.length) return false;
      s.lanes = lanes;
      s.laneSrc = host;
      const ids = {};
      lanes.forEach((l) => { ids[l.id] = 1; });
      s.players.forEach((p) => { if (!ids[p.lane]) p.lane = this.assignLane(); });
      this.push("SYS", lanes.length + " lanes built from what is actually on " + host, "sys");
      return true;
    } catch (e) {
      this.push("SYS", "could not read the target, using the standard lanes", "sys");
      return false;
    }
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
        lanes: this.L(),
        laneSrc: s.laneSrc || "",
        kinds: KINDS,
        coverage: this.coverage(),
        players: s.players.map((p) => ({ id: p.id, name: p.name, lane: p.lane, av: p.av || 0, finds: p.finds || 0, gh: p.gh || null })),
        finds: s.finds,
        strokes: s.strokes,
        sid: s.sid,
        plan: s.plan,
        notes: s.notes,
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
        const L = this.L().find((l) => l.id === p.lane);
        this.push("SYS", name + " took " + (L ? L.label : p.lane), "sys");
      }
      const t = clean(b.target, 300);
      if (t && !s.target) {
        s.target = /^https?:\/\//i.test(t) ? t : "https://" + t;
        s.started = 1;
        this.push("SYS", "target locked: " + s.target, "sys");
        await this.buildLanes();
      }
      await this.save();
      return json({ id: p.id, name: p.name, lane: p.lane, target: s.target, lanes: this.L() });
    }

    if (act === "relane") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const want = clean(b.lane, 20);
      if (!this.L().find((l) => l.id === want)) return json({ error: "no such lane" }, 400);
      p.lane = want;
      const L = this.L().find((l) => l.id === want);
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
        id: s.fid, by: p.name, av: p.av, gh: p.gh || null, lane: p.lane, text, steps,
        sev, kind, code, color, status: "open", fp, plus: [], dead: false,
        replies: []
      };
      s.finds.unshift(find);
      if (s.finds.length > 200) s.finds.length = 200;
      p.finds = (p.finds || 0) + 1;
      this.push(p.name, KINDS[kind].label + ": " + text, "find");
      await this.save();

      if (kind === "patch" && code) {
        const said = await this.review(kind, text, code, steps, p.name);
        if (said) {
          find.replies.push({ by: "REVIEWER", av: -1, text: said, bot: 1 });
          this.push("REVIEWER", "reviewed #" + find.id + ": " + said, "bot");
          await this.save();
        }
      }
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

    if (act === "askbot") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const f = s.finds.find((x) => x.id === Number(b.find));
      if (!f) return json({ error: "no such find" }, 404);
      const said = await this.review(f.kind, f.text, f.code || "", f.steps || "", p.name);
      f.replies = f.replies || [];
      if (said) {
        f.replies.push({ by: "REVIEWER", av: -1, text: said, bot: 1 });
        this.push("REVIEWER", "reviewed #" + f.id + ": " + said, "bot");
      } else {
        f.replies.push({ by: "REVIEWER", av: -1, text: "Reviewer is offline. Read it yourself.", bot: 1 });
      }
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

    /* Connect a real GitHub identity. Public API, no OAuth app needed, so it
       works the moment you type a handle. It proves the account exists and is
       public; it does not prove you are that person. */
    /* The browser does the GitHub lookup - Cloudflare IPs get 403 from the
       unauthenticated API, and a per-user rate limit is the right one anyway.
       We store what it hands us, sanitised. It shows who someone is; it does
       not prove it, which is what a real OAuth app would add. */
    if (act === "github") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const login = clean(b.login, 39).replace(/^@+/, "").replace(/[^A-Za-z0-9-]/g, "");
      if (!login) { p.gh = null; await this.save(); return json({ ok: true, gh: null }); }
      p.gh = {
        login,
        name: clean(b.name, 60) || login,
        avatar: "https://github.com/" + login + ".png?size=200",
        url: "https://github.com/" + login,
        bio: clean(b.bio, 160),
        repos: Math.max(0, Math.min(99999, Number(b.repos) || 0)),
        followers: Math.max(0, Math.min(9999999, Number(b.followers) || 0)),
        since: clean(b.since, 4)
      };
      this.push("SYS", p.name + " connected github/" + login, "sys");
      await this.save();
      return json({ ok: true, gh: p.gh });
    }

    if (act === "relanes") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const t = clean(b.target, 300);
      if (t) {
        s.target = /^https?:\/\//i.test(t) ? t : "https://" + t;
        s.started = 1;
        this.push("SYS", p.name + " pointed the crew at " + s.target, "sys");
      }
      const ok = await this.buildLanes();
      await this.save();
      return json({ ok: ok, lanes: this.L(), laneSrc: s.laneSrc, target: s.target });
    }

    if (act === "sweep") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      let u = s.target;
      if (!u) return json({ error: "no target set" }, 400);
      if (!/^https?:\/\//i.test(u)) u = "https://" + u;
      let host = "";
      try { host = new URL(u).hostname; } catch (e) { return json({ error: "bad url" }, 400); }
      if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/i.test(host)) {
        return json({ error: "refusing to fetch a private address" }, 400);
      }

      let res, html;
      try {
        res = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (compatible; DogpileBot/1.0)" }, redirect: "follow" });
        html = await res.text();
      } catch (e) {
        return json({ error: "could not fetch that: " + ((e && e.message) || "blocked") }, 502);
      }

      const hits = sweepChecks(res, html.slice(0, 400000), u);
      this.push("SYS", p.name + " ran the AI red team sweep", "sys");

      let added = 0, dupes = 0;
      for (const h of hits) {
        const fp = fingerprint(h.text);
        const clash = s.finds.some((f) => similar(fp, f.fp) >= 0.6);
        if (clash) { dupes += 1; continue; }
        s.fid += 1;
        s.finds.unshift({
          id: s.fid, by: "REVIEWER", av: -1, lane: h.lane, text: h.text, steps: h.steps,
          sev: h.sev, kind: "bug", code: "", color: "", status: "open", fp,
          plus: [], dead: false, replies: [], bot: 1
        });
        added += 1;
      }
      if (s.finds.length > 200) s.finds.length = 200;

      let line = "Swept " + host + ": " + added + " new, " + dupes + " already on the board.";
      if (!hits.length) line = "Swept " + host + ". The mechanical checks came back clean, which only means the easy stuff is done.";
      this.push("REVIEWER", line, "bot");

      const said = await this.review("bug",
        "Automated sweep of " + u + " returned these: " + hits.map((h) => h.text).join(" | "),
        "", "", p.name);
      if (said) this.push("REVIEWER", said, "bot");

      await this.save();
      return json({ ok: true, added, dupes, total: hits.length });
    }

    if (act === "pull") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      let u = clean(b.url, 400) || s.target;
      if (!u) return json({ error: "no url" }, 400);
      if (!/^https?:\/\//i.test(u)) u = "https://" + u;
      let host = "";
      try { host = new URL(u).hostname; } catch (e) { return json({ error: "bad url" }, 400); }
      if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/i.test(host)) {
        return json({ error: "refusing to fetch a private address" }, 400);
      }
      try {
        const res = await fetch(u, {
          headers: { "user-agent": "Mozilla/5.0 (compatible; DogpileBot/1.0)" },
          redirect: "follow"
        });
        const ct = res.headers.get("content-type") || "";
        let body = await res.text();
        const full = body.length;
        if (body.length > 60000) body = body.slice(0, 60000);
        return json({ ok: true, url: u, status: res.status, type: ct, bytes: full, body });
      } catch (e) {
        return json({ error: "could not fetch that: " + ((e && e.message) || "blocked") }, 502);
      }
    }

    /* sticky notes: freeform, everyone sees them, not findings */
    if (act === "note") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const text = clean(b.text, 220);
      if (!text) return json({ error: "empty" }, 400);
      s.nid += 1;
      s.notes.unshift({ id: s.nid, text, by: p.name, av: p.av, c: clean(b.c, 12) || "y" });
      if (s.notes.length > 60) s.notes.length = 60;
      await this.save();
      return json({ ok: true, notes: s.notes });
    }
    if (act === "notepoke") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      s.notes = s.notes.filter((x) => x.id !== Number(b.item));
      await this.save();
      return json({ ok: true, notes: s.notes });
    }

    if (act === "say") {
      const p = this.p(clean(b.id, 40));
      if (!p) return json({ error: "not in room" }, 403);
      const text = clean(b.text, 240);
      if (!text) return json({ error: "empty" }, 400);
      this.push(p.name, text, "say");
      if (/@(bot|reviewer)\b/i.test(text)) {
        const E2 = this.env;
        let said = null;
        if (E2 && E2.AI) {
          const recent = s.finds.slice(0, 4).map((f) => "#" + f.id + " [" + f.kind + "] " + f.text).join("\n");
          const gaps = this.L().filter((l) => {
            const c = this.coverage()[l.id];
            return c && c.people === 0 && c.finds === 0;
          }).map((l) => l.label);
          try {
            const out = await E2.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
              max_tokens: 170, temperature: 0.6,
              messages: [
                { role: "system", content: REVIEWER +
                  "\n\nYou are also watching a red-team session on " + (s.target || "a site") +
                  ".\nFindings so far:\n" + (recent || "nothing yet") +
                  "\nLanes nobody has touched: " + (gaps.join(", ") || "none") },
                { role: "user", content: p.name + " asked you: " + text }
              ]
            });
            let r = "";
            if (out) {
              if (typeof out.response === "string") r = out.response;
              else if (out.choices && out.choices[0] && out.choices[0].message) r = out.choices[0].message.content || "";
            }
            r = (r + "").replace(/```[a-z]*/gi, "").replace(/^[\s"']+|[\s"']+$/g, "").replace(/\s+/g, " ").trim();
            if (r.length > 340) r = r.slice(0, 337).replace(/\s\S*$/, "") + ".";
            said = r.length > 4 ? r : null;
          } catch (e) { said = null; }
        }
        this.push("REVIEWER", said || "Reviewer is offline.", "bot");
      }
      await this.save();
      return json({ ok: true });
    }

    if (act === "reset") {
      this.s = { target: "", players: [], finds: [], msgs: [], seq: 0, fid: 0, started: 0,
        strokes: [], sid: 0, plan: [], pid: 0, notes: [], nid: 0 };
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
