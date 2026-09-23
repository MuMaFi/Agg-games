#!/bin/sh
# Verteilt die Feldzüge auf alle Kerne und fasst zusammen.
# Aufruf: sh werkzeug/sturmflut-mess.sh [je_prozess=30] [stufe=normal]
je=${1:-30}; stufe=${2:-normal}; n=$(nproc)
dir=$(mktemp -d)
i=0
while [ $i -lt $n ]; do
  node "$(dirname "$0")/sturmflut-bot.mjs" "$je" "$stufe" $((1 + i * 1000)) > "$dir/$i.txt" &
  i=$((i + 1))
done
wait
cat "$dir"/*.txt | node -e '
let t = require("fs").readFileSync(0, "utf8"); let s = 0, g = 0; const m = {};
for (const l of t.split("\n")) {
  let r = l.match(/(\d+)\/(\d+) Feldzüge/); if (r) { s += +r[1]; g += +r[2]; continue; }
  r = l.match(/^(\d\.\d) (.{14}) +(\d+) +([\d.]+) +(\d+) +(\d+) %/);
  if (r) { const k = r[1]; const e = m[k] ||= { name: r[2], n: 0, v: 0, l: 0, a: 0 };
    e.n += +r[3]; e.v += +r[4] * +r[3]; e.l += +r[5]; e.a += +r[6] * +r[3]; }
}
console.log(`GESAMT ${s}/${g} gewonnen = ${Math.round(s / g * 100)} %`);
for (const [k, e] of Object.entries(m)) console.log(`  ${k} ${e.name} n=${String(e.n).padStart(3)}  Deich− ${(e.v / e.n).toFixed(2)}  verloren ${String(e.l).padStart(3)}  Aufträge ${Math.round(e.a / e.n)} %`);
'
rm -rf "$dir"
