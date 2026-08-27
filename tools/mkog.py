"""Rebuild the link-preview card in the site's CURRENT palette.

The old og.png was cut when Dogpile was a dark room: near-black ground, glowing
orange. The app is now ash grey with beige paper and black ink, so the preview
was advertising a site that no longer exists. Same composition, real component
CSS lifted out of index.html, so the card and the app cannot drift apart.
"""
import subprocess, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)          # the site root
HTML = os.path.join(HERE, "og.build.html")
PNG = os.path.join(OUT, "og-2.png")

# deterministic chalk dust, the same field the canvas draws behind the app
seed = 20260827
def rnd():
    global seed
    seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
    return seed / 0x7FFFFFFF

dust = []
for i in range(210):
    x, y = rnd() * 1200, rnd() * 630
    r = 0.7 + rnd() * 1.9
    o = 0.10 + rnd() * 0.30
    col = "#0A0B09" if rnd() > 0.16 else "#C24A00"
    dust.append(
        '<circle cx="%.1f" cy="%.1f" r="%.2f" fill="%s" opacity="%.2f"/>' % (x, y, r, col, o)
    )
DUST = "".join(dust)

PAGE = """<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Kalam:wght@400;700&family=Space+Mono:wght@400;700&display=swap">
<style>
:root{
  --void:#D7D7D5; --chalk:#0A0B09; --dust:#131410; --faint:#7C7C76;
  --orange:#C24A00; --orangefill:#FF6B1A;
  --violet:#5B3FA8; --vdim:#8B5CF6;
  --paper:#EDE6D8; --ink:#0D1015; --inkdim:#2C3037;
}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:var(--void);color:var(--chalk);
  font-family:"Space Mono",ui-monospace,Menlo,monospace;-webkit-font-smoothing:antialiased}
.field{position:absolute;inset:0}
.card{position:relative;width:1200px;height:630px;padding:36px 56px 30px}

/* masthead, straight off .mast / .chip */
.mast{display:flex;align-items:center;justify-content:space-between}
.w{font-family:Anton,sans-serif;font-size:40px;text-transform:uppercase;letter-spacing:.14em;color:var(--chalk)}
.w i{font-style:normal;color:var(--orange)}
.chip{font-size:14px;letter-spacing:.2em;text-transform:uppercase;color:#0A0B09;font-weight:700;
  border:1px solid var(--faint);padding:9px 16px;white-space:nowrap}

/* the line that does the selling */
.hl{margin-top:28px;font-family:Anton,sans-serif;text-transform:uppercase;line-height:.86;letter-spacing:.005em}
.hl .a{display:block;font-size:86px;color:var(--chalk)}
.hl .b{display:block;font-size:99px;color:var(--orange)}

/* lanes, straight off .pl - two held, three nobody has touched */
.rail{display:flex;gap:12px;margin-top:30px}
.pl{position:relative;padding:15px 14px 16px;background:rgba(255,255,255,.28);
  border:1px solid var(--faint);color:var(--dust);width:196px}
.pl .hole{position:absolute;top:-5px;left:50%;transform:translateX(-50%);width:10px;height:10px;
  border-radius:50%;background:#8E8E88;border:1px solid #6F6F6A}
.pl .pn{font-family:Anton,sans-serif;font-size:21px;text-transform:uppercase;letter-spacing:.04em;
  line-height:1.05;color:#3F4A55}
.pl .pc{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#0A0B09;margin-top:6px;font-weight:700}
.pl.held{border-color:var(--vdim)}
.pl.held .pn{color:var(--violet)}
.pl.held .hole{background:var(--vdim);border-color:var(--violet)}
.pl.gap{border-style:dashed;border-color:var(--orange);background:rgba(194,74,0,.07)}
.pl.gap .pn{color:var(--orange)}
.pl.gap .pc{color:#7A3007}
.pl.gap .hole{border-color:var(--orange)}

.foot{display:flex;align-items:flex-end;justify-content:space-between;margin-top:30px;gap:40px}

/* a finding, straight off .pin */
.pin{position:relative;background:var(--paper);color:var(--ink);padding:19px 20px 15px;width:452px;
  box-shadow:5px 6px 0 rgba(25,26,23,.42);transform:rotate(-1.1deg)}
.pin::after{content:"";position:absolute;top:-9px;left:32px;width:18px;height:18px;border-radius:50%;
  background:#5B3FA8;border:1px solid #38246E;box-shadow:inset 2px 2px 0 rgba(255,255,255,.45)}
.pin .kn{font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:#1A1E24;font-weight:700;
  display:flex;align-items:center;gap:10px}
.pin .fid{margin-left:auto;font-family:Anton,sans-serif;font-size:21px;color:var(--inkdim);letter-spacing:.05em}
.pin .ft{font-size:21px;line-height:1.42;color:var(--ink);margin:11px 0 10px}
.pin .marg{display:flex;align-items:center;gap:14px;font-family:Kalam,cursive;font-weight:700;font-size:23px;
  color:#23272E;border-top:1px dashed rgba(13,16,21,.22);padding-top:11px}

.say{text-align:right;font-size:20px;line-height:1.6;color:var(--dust);padding-bottom:4px}
.say b{color:var(--chalk);font-weight:700}
.say .u{display:block;margin-top:14px;font-size:17px;letter-spacing:.11em;text-transform:uppercase;
  color:var(--violet);font-weight:700}
</style></head><body>
<svg class="field" width="1200" height="630" viewBox="0 0 1200 630">__DUST__</svg>
<div class="card">

  <div class="mast">
    <div class="w">DOG<i>PILE</i></div>
    <div class="chip">group thrashing &middot; live &middot; no signup</div>
  </div>

  <div class="hl"><span class="a">everyone</span><span class="b">found the same bug</span></div>

  <div class="rail">
    <div class="pl held"><span class="hole"></span><div class="pn">forms</div><div class="pc">3 found &middot; 1 here</div></div>
    <div class="pl held"><span class="hole"></span><div class="pn">small screen</div><div class="pc">1 found &middot; 1 here</div></div>
    <div class="pl gap"><span class="hole"></span><div class="pn">keyboard</div><div class="pc">nobody tested this</div></div>
    <div class="pl gap"><span class="hole"></span><div class="pn">edge input</div><div class="pc">nobody tested this</div></div>
    <div class="pl gap"><span class="hole"></span><div class="pn">the flow</div><div class="pc">nobody tested this</div></div>
  </div>

  <div class="foot">
    <div class="pin">
      <div class="kn">bug<span class="fid">#1</span></div>
      <div class="ft">double-clicking submit sends the form twice</div>
      <div class="marg"><span>+3</span><span>&#8627;2</span></div>
    </div>
    <div class="say">
      Everyone gets a <b>different lane</b>.<br>
      Nobody files the same bug twice.<br>
      The gaps stay lit.
      <span class="u">aunysillyme.github.io/dogpile</span>
    </div>
  </div>

</div></body></html>"""

open(HTML, "w", encoding="utf-8").write(PAGE.replace("__DUST__", DUST))

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
cmd = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
       "--force-device-scale-factor=1", "--window-size=1200,630",
       "--virtual-time-budget=9000", "--screenshot=" + PNG, "file://" + HTML]
r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
print("chrome exit", r.returncode)
if r.returncode != 0:
    print(r.stderr[-1200:])
print("png bytes:", os.path.getsize(PNG) if os.path.exists(PNG) else "MISSING")
