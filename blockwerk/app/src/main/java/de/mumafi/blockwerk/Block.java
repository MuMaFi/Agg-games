package de.mumafi.blockwerk;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Ein Block im Skriptbereich. Befehle hängen über {@link #next} aneinander,
 *  Schleifen und Verzweigungen tragen ihre Innenstapel in {@link #sub}, und
 *  jedes Feld hat einen festen Wert ({@link #werte}) — liegt ein Werteblock
 *  darauf ({@link #args}), zählt dieser, der feste Wert bleibt darunter
 *  erhalten. */
final class Block {
  final Spec spec;
  final String[] werte;
  final Block[] args;
  final Block[] sub;
  Block next;
  /** Lage im Skriptbereich, nur für den obersten Block eines Stapels */
  float x, y;

  // ---- Anordnung, vom BlockMaler berechnet (in Einheiten, relativ) ----
  float w, h;
  float ax, ay;
  float[] slotX, slotY, slotW, slotH;
  float[] teilX, teilY, teilW;
  float[] zeileY, zeileH, mundY, mundH;
  float armH;

  Block(Spec spec) {
    this.spec = spec;
    int n = spec.slots();
    werte = new String[n];
    args = new Block[n];
    sub = new Block[spec.muender];
    for (int i = 0; i < n; i++) werte[i] = spec.vorgaben[i];
  }

  Block(String op) { this(Bloecke.spec(op)); }

  Block letzter() {
    Block b = this;
    while (b.next != null) b = b.next;
    return b;
  }

  /** Tiefe Kopie, wahlweise mit allem, was darunter hängt. */
  Block kopie(boolean mitNachfolgern) {
    Block k = new Block(spec);
    System.arraycopy(werte, 0, k.werte, 0, werte.length);
    for (int i = 0; i < args.length; i++) if (args[i] != null) k.args[i] = args[i].kopie(false);
    for (int i = 0; i < sub.length; i++) if (sub[i] != null) k.sub[i] = sub[i].kopie(true);
    if (mitNachfolgern && next != null) k.next = next.kopie(true);
    k.x = x;
    k.y = y;
    return k;
  }

  /** Kommt die Bauart irgendwo in diesem Stapel (samt Innerem) vor? */
  boolean enthaelt(String op) {
    for (Block b = this; b != null; b = b.next) {
      if (b.spec.op.equals(op)) return true;
      for (Block a : b.args) if (a != null && a.enthaelt(op)) return true;
      for (Block s : b.sub) if (s != null && s.enthaelt(op)) return true;
    }
    return false;
  }

  /** Ersetzt in allen Auswahlfeldern eines Menüs einen Wert, etwa beim
   *  Umbenennen einer Variable. */
  void ersetzeWert(String menue, String alt, String neu) {
    for (Block b = this; b != null; b = b.next) {
      for (int i = 0; i < b.werte.length; i++) {
        boolean passt = menue.equals(b.spec.slotMenue[i])
            || (menue.equals("variable") && b.spec.slotArt[i] == 'v');
        if (passt && alt.equals(b.werte[i])) b.werte[i] = neu;
        if (b.args[i] != null) b.args[i].ersetzeWert(menue, alt, neu);
      }
      for (Block s : b.sub) if (s != null) s.ersetzeWert(menue, alt, neu);
    }
  }

  // ------------------------------------------------------------- Speichern

  JSONObject json(boolean mitLage) throws JSONException {
    JSONObject o = new JSONObject();
    o.put("op", spec.op);
    if (werte.length > 0) {
      JSONArray w = new JSONArray();
      for (String s : werte) w.put(s == null ? "" : s);
      o.put("w", w);
      JSONArray a = new JSONArray();
      boolean irgendeiner = false;
      for (Block b : args) {
        if (b != null) { a.put(b.json(false)); irgendeiner = true; }
        else a.put(JSONObject.NULL);
      }
      if (irgendeiner) o.put("a", a);
    }
    if (sub.length > 0) {
      JSONArray s = new JSONArray();
      for (Block b : sub) s.put(b == null ? JSONObject.NULL : b.json(false));
      o.put("s", s);
    }
    if (mitLage) { o.put("x", (double) x); o.put("y", (double) y); }
    if (next != null) {
      // Lange Stapel nicht verschachtelt speichern, sondern als Liste —
      // sonst stößt JSON bei hunderten Blöcken an die Rekursionstiefe.
      JSONArray folge = new JSONArray();
      for (Block b = next; b != null; b = b.next) {
        Block einzeln = b;
        Block merk = einzeln.next;
        einzeln.next = null;
        folge.put(einzeln.json(false));
        einzeln.next = merk;
      }
      o.put("n", folge);
    }
    return o;
  }

  /** Liest einen Block; unbekannte Bauarten ergeben null. */
  static Block ausJson(JSONObject o) {
    Spec s = Bloecke.spec(o.optString("op"));
    if (s == null) return null;
    Block b = new Block(s);
    JSONArray w = o.optJSONArray("w");
    if (w != null) for (int i = 0; i < b.werte.length && i < w.length(); i++) b.werte[i] = w.optString(i, "");
    JSONArray a = o.optJSONArray("a");
    if (a != null) for (int i = 0; i < b.args.length && i < a.length(); i++) {
      JSONObject ao = a.optJSONObject(i);
      if (ao != null) {
        Block arg = ausJson(ao);
        if (arg != null && arg.spec.istWert()) b.args[i] = arg;
      }
    }
    JSONArray sa = o.optJSONArray("s");
    if (sa != null) for (int i = 0; i < b.sub.length && i < sa.length(); i++) {
      JSONObject so = sa.optJSONObject(i);
      if (so != null) b.sub[i] = ausJson(so);
    }
    b.x = (float) o.optDouble("x", 0);
    b.y = (float) o.optDouble("y", 0);
    JSONArray n = o.optJSONArray("n");
    if (n != null && !s.istKappe() && !s.istWert()) {
      Block ende = b.letzter();
      for (int i = 0; i < n.length(); i++) {
        JSONObject no = n.optJSONObject(i);
        if (no == null) continue;
        Block nb = ausJson(no);
        if (nb == null || nb.spec.istWert() || nb.spec.istHut()) continue;
        ende.next = nb;
        ende = nb.letzter();
        if (ende.spec.istKappe()) break;
      }
    }
    return b;
  }
}
