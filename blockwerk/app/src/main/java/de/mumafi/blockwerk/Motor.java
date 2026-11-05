package de.mumafi.blockwerk;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Random;

/** Führt die Skripte aus. Jedes laufende Skript ist ein {@link Faden}; alle
 *  Fäden laufen abwechselnd im Takt von 30 Bildern je Sekunde. Ein Faden gibt
 *  am Ende jedes Schleifendurchlaufs und bei jedem Warten ab. Solange sich auf
 *  der Bühne nichts sichtbar ändert, kommen die Fäden innerhalb eines Bildes
 *  mehrmals dran — so rechnen reine Zählschleifen schnell, und Bewegungen
 *  bleiben trotzdem flüssig sichtbar. */
final class Motor {

  interface Ansicht {
    void neuZeichnen();
    void laufendGeaendert();
    void frage(String text);
    void frageSchliessen();
    void meldung(String text);
  }

  static final float STIFT_RES = 2;
  private static final long TAKT_MS = 33;
  private static final int MAX_KLONE = 300;

  static final int WEITER = 0, WARTEN = 1, SUB = 2, ENDE = 3;

  static final class Rahmen {
    Block block;
    boolean begonnen, subFertig, gefragt;
    int zaehler;
    double t0, dauer, x0, y0, x1, y1;
    Object daten;
    Rahmen(Block b) { block = b; }
    void zuruecksetzen() {
      begonnen = subFertig = gefragt = false;
      zaehler = 0;
      daten = null;
    }
  }

  static final class Faden {
    final Figur ziel;
    final Block oben;
    final ArrayList<Rahmen> stapel = new ArrayList<>();
    boolean fertig;
    Faden(Figur ziel, Block oben) { this.ziel = ziel; this.oben = oben; neustart(); }
    void neustart() {
      stapel.clear();
      fertig = false;
      stapel.add(new Rahmen(oben.spec.istHut() ? oben.next : oben));
    }
  }

  Projekt projekt;
  final Klang klang = new Klang();
  Ansicht ansicht;

  final ArrayList<Faden> faeden = new ArrayList<>();
  /** Ausgaben von „schreibe … in die Konsole“ — in Java System.out */
  final ArrayList<String> konsole = new ArrayList<>();
  final HashSet<String> tasten = new HashSet<>();
  boolean fingerUnten;
  double fingerX, fingerY;
  double neigungLR, neigungVZ;
  String antwort = "";
  private Faden frager;
  private boolean antwortDa;
  private double stoppuhrStart = jetzt();

  Bitmap stiftBild;
  private Canvas stiftCanvas;
  private final Paint stiftFarbe = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Darstellung darstellung = new Darstellung();

  private boolean neuZeichnen, aktiv;
  /** Zuletzt in einem Skript aufgetretener Fehler — für die Prüfungen */
  static RuntimeException letzterFehler;
  private final Random zufall = new Random();
  private final Handler handler = new Handler(Looper.getMainLooper());
  private boolean taktLaeuft;
  private int laufendSchluessel;

  // Für „wird Farbe berührt?“: einmal je Bild gezeichnete Bühne ohne die Figur
  private int[] farbPixel;
  private Figur farbOhne;
  private long farbBild = -1, bildNummer;

  Motor(Projekt p) {
    projekt = p;
    stiftBild = Bitmap.createBitmap((int) (Darstellung.B * STIFT_RES), (int) (Darstellung.H * STIFT_RES),
        Bitmap.Config.ARGB_8888);
    stiftCanvas = new Canvas(stiftBild);
    stiftFarbe.setStrokeCap(Paint.Cap.ROUND);
  }

  void setzeProjekt(Projekt p) {
    stoppeAlles();
    projekt = p;
    stiftCanvas.drawColor(0, PorterDuff.Mode.CLEAR);
    ansicht.neuZeichnen();
  }

  static double jetzt() { return SystemClock.uptimeMillis() / 1000.0; }

  // ============================================================== Takt

  private final Runnable takt = new Runnable() {
    @Override public void run() {
      long start = SystemClock.uptimeMillis();
      schritt();
      if (faeden.isEmpty()) {
        taktLaeuft = false;
        return;
      }
      long rest = TAKT_MS - (SystemClock.uptimeMillis() - start);
      handler.postDelayed(this, Math.max(1, rest));
    }
  };

  private void wecken() {
    if (taktLaeuft) return;
    taktLaeuft = true;
    handler.post(takt);
  }

  boolean laeuft() { return !faeden.isEmpty(); }

  private void schritt() {
    bildNummer++;
    long beginn = SystemClock.uptimeMillis();
    neuZeichnen = false;
    int runden = 0;
    do {
      // Nur weiterrechnen, solange ein Faden wirklich vorankommt — warten
      // alle nur auf eine Zeit oder Bedingung, ist das Bild fertig.
      aktiv = false;
      for (int i = 0; i < faeden.size(); i++) {
        Faden f = faeden.get(i);
        if (!f.fertig) laufe(f);
      }
      for (int i = faeden.size() - 1; i >= 0; i--) if (faeden.get(i).fertig) faeden.remove(i);
    } while (aktiv && !faeden.isEmpty() && !neuZeichnen && ++runden < 2000
        && SystemClock.uptimeMillis() - beginn < TAKT_MS * 3 / 4);

    if (frager != null && frager.fertig) {
      frager = null;
      ansicht.frageSchliessen();
    }
    ansicht.neuZeichnen();
    int schluessel = laufendSchluessel();
    if (schluessel != laufendSchluessel) {
      laufendSchluessel = schluessel;
      ansicht.laufendGeaendert();
    }
  }

  private int laufendSchluessel() {
    int h = faeden.size();
    for (Faden f : faeden) h = h * 31 + System.identityHashCode(f.oben);
    return h;
  }

  /** Läuft gerade ein Skript, das mit diesem Block beginnt? */
  boolean laeuft(Block oben) {
    for (Faden f : faeden) if (f.oben == oben && !f.fertig) return true;
    return false;
  }

  private void laufe(Faden f) {
    int schritte = 0;
    while (!f.fertig && schritte++ < 100000) {
      if (f.stapel.isEmpty()) { f.fertig = true; return; }
      Rahmen r = f.stapel.get(f.stapel.size() - 1);
      if (r.block == null) {
        f.stapel.remove(f.stapel.size() - 1);
        if (f.stapel.isEmpty()) { f.fertig = true; return; }
        f.stapel.get(f.stapel.size() - 1).subFertig = true;
        continue;
      }
      int e;
      try {
        e = ausfuehren(f, r);
      } catch (RuntimeException ex) {
        // Ein Fehler in einem Block beendet nur dieses Skript
        letzterFehler = ex;
        e = ENDE;
      }
      if (f.fertig) return;
      switch (e) {
        case WEITER:
          aktiv = true;
          r.block = r.block.next;
          r.zuruecksetzen();
          break;
        case WARTEN:
          return;
        case SUB:
          aktiv = true;
          break;
        case ENDE:
        default:
          f.fertig = true;
          return;
      }
    }
  }

  // ============================================================== Starten

  List<Figur> ziele() {
    ArrayList<Figur> l = new ArrayList<>(projekt.ebenen.size() + 1);
    l.add(projekt.buehne);
    for (int i = projekt.ebenen.size() - 1; i >= 0; i--) l.add(projekt.ebenen.get(i));
    return l;
  }

  interface Passt { boolean passt(Block hut); }

  List<Faden> starteHuete(String op, Passt passt, Figur nur, boolean neustarten) {
    ArrayList<Faden> neu = new ArrayList<>();
    for (Figur z : nur != null ? java.util.Collections.singletonList(nur) : ziele()) {
      for (Block b : new ArrayList<>(z.skripte)) {
        if (!b.spec.op.equals(op) || (passt != null && !passt.passt(b))) continue;
        Faden alt = null;
        for (Faden f : faeden) if (f.ziel == z && f.oben == b && !f.fertig) { alt = f; break; }
        if (alt != null) {
          if (neustarten) { alt.neustart(); neu.add(alt); }
          continue;
        }
        Faden f = new Faden(z, b);
        faeden.add(f);
        neu.add(f);
      }
    }
    if (!neu.isEmpty()) wecken();
    return neu;
  }

  void flagge() {
    stoppeAlles();
    konsole.clear();
    stoppuhrStart = jetzt();
    starteHuete("ereignis.flagge", null, null, true);
    ansicht.laufendGeaendert();
  }

  void stoppeAlles() {
    for (Faden f : faeden) f.fertig = true;
    faeden.clear();
    klang.stoppeAlle();
    if (projekt != null) {
      for (int i = projekt.ebenen.size() - 1; i >= 0; i--) if (projekt.ebenen.get(i).istKlon) projekt.ebenen.remove(i);
      for (Figur f : projekt.ebenen) { f.blase = null; f.effekteAus(); }
      projekt.buehne.effekteAus();
    }
    if (frager != null) { frager = null; ansicht.frageSchliessen(); }
    laufendSchluessel = 0;
    if (ansicht != null) { ansicht.laufendGeaendert(); ansicht.neuZeichnen(); }
  }

  /** Antippen eines Stapels im Skriptbereich: starten oder anhalten. */
  void schalteSkript(Figur z, Block oben) {
    for (Faden f : faeden) if (f.oben == oben && !f.fertig) {
      f.fertig = true;
      faeden.remove(f);
      ansicht.laufendGeaendert();
      ansicht.neuZeichnen();
      return;
    }
    faeden.add(new Faden(z, oben));
    wecken();
    ansicht.laufendGeaendert();
  }

  void figurAngetippt(Figur f) {
    starteHuete("ereignis.figurAngetippt", null, f, true);
  }

  void buehneAngetippt() {
    starteHuete("ereignis.buehneAngetippt", null, projekt.buehne, true);
  }

  void tasteRunter(String taste) {
    tasten.add(taste);
    starteHuete("ereignis.taste", h -> h.werte[0].equals(taste) || h.werte[0].equals("beliebig"), null, false);
  }

  void tasteHoch(String taste) {
    tasten.remove(taste);
  }

  void beantworte(String text) {
    antwort = text == null ? "" : text;
    antwortDa = true;
    wecken();
  }

  void anhalten() {
    handler.removeCallbacks(takt);
    taktLaeuft = false;
  }

  void fortsetzen() {
    if (!faeden.isEmpty()) wecken();
  }

  // ============================================================== Werte

  private Object wert(Block b, int i, Figur z) {
    if (b.args[i] != null) return auswerten(b.args[i], z);
    return b.werte[i];
  }

  private double zahl(Block b, int i, Figur z) { return Werte.zahl(wert(b, i, z)); }

  private String text(Block b, int i, Figur z) { return Werte.text(wert(b, i, z)); }

  private boolean bedingung(Block b, int i, Figur z) {
    return b.args[i] != null && Werte.wahr(auswerten(b.args[i], z));
  }

  Object auswerten(Block b, Figur z) {
    switch (b.spec.op) {
      // Bewegung
      case "bewegung.x": return rund(z.x);
      case "bewegung.y": return rund(z.y);
      case "bewegung.r": return z.richtung;
      // Aussehen
      case "aussehen.kostuemWert":
        return b.werte[0].equals("name") ? (Object) (z.aktuell() == null ? "" : z.aktuell().name) : (double) (z.kostuem + 1);
      case "aussehen.bildWert": {
        Figur s = projekt.buehne;
        return b.werte[0].equals("name") ? (Object) (s.aktuell() == null ? "" : s.aktuell().name) : (double) (s.kostuem + 1);
      }
      case "aussehen.groesse": return (double) Math.round(z.groesse);
      // Klang
      case "klang.lautstaerke": return z.lautstaerke;
      // Fühlen
      case "fuehlen.beruehrt": return beruehrt(z, text(b, 0, z));
      case "fuehlen.farbe": return beruehrtFarbe(z, farbe(b.werte[0]));
      case "fuehlen.entfernung": {
        String n = text(b, 0, z);
        double[] p = position(n);
        if (p == null) return 10000.0;
        return Math.hypot(p[0] - z.x, p[1] - z.y);
      }
      case "fuehlen.antwort": return antwort;
      case "fuehlen.taste": {
        String t = text(b, 0, z).toLowerCase();
        if (t.equals("beliebig")) return !tasten.isEmpty();
        if (t.equals(" ")) t = "leertaste";
        return tasten.contains(t);
      }
      case "fuehlen.fingerUnten": return fingerUnten;
      case "fuehlen.fingerX": return (double) Math.round(fingerX);
      case "fuehlen.fingerY": return (double) Math.round(fingerY);
      case "fuehlen.neigung": return (double) Math.round(b.werte[0].equals("vz") ? neigungVZ : neigungLR);
      case "fuehlen.stoppuhr": return Math.round((jetzt() - stoppuhrStart) * 1000) / 1000.0;
      case "fuehlen.eigenschaft": return eigenschaft(b.werte[0], b.werte[1]);
      case "fuehlen.zeit": {
        Calendar c = Calendar.getInstance();
        switch (b.werte[0]) {
          case "monat": return (double) (c.get(Calendar.MONTH) + 1);
          case "tag": return (double) c.get(Calendar.DAY_OF_MONTH);
          case "wochentag": return (double) c.get(Calendar.DAY_OF_WEEK);
          case "stunde": return (double) c.get(Calendar.HOUR_OF_DAY);
          case "minute": return (double) c.get(Calendar.MINUTE);
          case "sekunde": return (double) c.get(Calendar.SECOND);
          default: return (double) c.get(Calendar.YEAR);
        }
      }
      // Operatoren
      case "op.plus": return zahl(b, 0, z) + zahl(b, 1, z);
      case "op.minus": return zahl(b, 0, z) - zahl(b, 1, z);
      case "op.mal": return zahl(b, 0, z) * zahl(b, 1, z);
      case "op.durch": return zahl(b, 0, z) / zahl(b, 1, z);
      case "op.zufall": {
        Object va = wert(b, 0, z), vb = wert(b, 1, z);
        double a = Werte.zahl(va), c = Werte.zahl(vb);
        double lo = Math.min(a, c), hi = Math.max(a, c);
        boolean ganz = lo == Math.rint(lo) && hi == Math.rint(hi)
            && !Werte.text(va).contains(".") && !Werte.text(vb).contains(".")
            && !Werte.text(va).contains(",") && !Werte.text(vb).contains(",");
        if (ganz) return (double) (long) (lo + Math.floor(zufall.nextDouble() * (hi - lo + 1)));
        return lo + zufall.nextDouble() * (hi - lo);
      }
      case "op.groesser": return Werte.vergleiche(wert(b, 0, z), wert(b, 1, z)) > 0;
      case "op.kleiner": return Werte.vergleiche(wert(b, 0, z), wert(b, 1, z)) < 0;
      case "op.gleich": return Werte.gleich(wert(b, 0, z), wert(b, 1, z));
      case "op.und": return bedingung(b, 0, z) && bedingung(b, 1, z);
      case "op.oder": return bedingung(b, 0, z) || bedingung(b, 1, z);
      case "op.nicht": return !bedingung(b, 0, z);
      case "op.verbinde": return text(b, 0, z) + text(b, 1, z);
      case "op.zeichen": {
        int i = Werte.ganz(wert(b, 0, z));
        String s = text(b, 1, z);
        return i >= 1 && i <= s.length() ? String.valueOf(s.charAt(i - 1)) : "";
      }
      case "op.laenge": return (double) text(b, 0, z).length();
      case "op.enthaelt": return text(b, 0, z).toLowerCase().contains(text(b, 1, z).toLowerCase());
      case "op.mod": {
        double n = zahl(b, 0, z), m = zahl(b, 1, z);
        return n - Math.floor(n / m) * m;
      }
      case "op.runde": return (double) Math.round(zahl(b, 0, z));
      case "op.mathe": return mathe(b.werte[0], zahl(b, 1, z));
      // Variablen
      case "var.wert": {
        Object v = projekt.variablen.get(b.werte[0]);
        return v == null ? (Object) 0.0 : v;
      }
      default:
        return "";
    }
  }

  private static double rund(double v) {
    double r = Math.round(v * 100) / 100.0;
    return r == 0 ? 0.0 : r;
  }

  private static double mathe(String f, double n) {
    switch (f) {
      case "betrag": return Math.abs(n);
      case "ab": return Math.floor(n);
      case "auf": return Math.ceil(n);
      case "wurzel": return Math.sqrt(n);
      case "sin": return Math.round(Math.sin(Math.toRadians(n)) * 1e10) / 1e10;
      case "cos": return Math.round(Math.cos(Math.toRadians(n)) * 1e10) / 1e10;
      case "tan": {
        double m = ((n % 360) + 360) % 360;
        if (m == 90) return Double.POSITIVE_INFINITY;
        if (m == 270) return Double.NEGATIVE_INFINITY;
        return Math.round(Math.tan(Math.toRadians(n)) * 1e10) / 1e10;
      }
      case "asin": return Math.toDegrees(Math.asin(n));
      case "acos": return Math.toDegrees(Math.acos(n));
      case "atan": return Math.toDegrees(Math.atan(n));
      case "ln": return Math.log(n);
      case "log": return Math.log10(n);
      case "e^": return Math.exp(n);
      case "10^": return Math.pow(10, n);
      default: return 0;
    }
  }

  private Object eigenschaft(String was, String objekt) {
    Figur f = objekt.equals("_buehne_") ? projekt.buehne : projekt.figur(objekt);
    if (f == null) return 0.0;
    switch (was) {
      case "x": return f.istBuehne ? 0.0 : rund(f.x);
      case "y": return f.istBuehne ? 0.0 : rund(f.y);
      case "richtung": return f.istBuehne ? 0.0 : f.richtung;
      case "kostuemNr": return (double) (f.kostuem + 1);
      case "kostuemName": return f.aktuell() == null ? "" : f.aktuell().name;
      case "groesse": return f.istBuehne ? 100.0 : (double) Math.round(f.groesse);
      case "lautstaerke": return f.lautstaerke;
      default: return 0.0;
    }
  }

  static int farbe(String hex) {
    try {
      return Color.parseColor(hex.trim());
    } catch (RuntimeException e) {
      return 0xFF000000;
    }
  }

  // ============================================================== Fühlen

  private double[] position(String name) {
    if (name.equals("_finger_")) return new double[]{fingerX, fingerY};
    if (name.equals("_zufall_"))
      return new double[]{Math.round(zufall.nextDouble() * 480 - 240), Math.round(zufall.nextDouble() * 360 - 180)};
    Figur f = projekt.figur(name);
    return f == null ? null : new double[]{f.x, f.y};
  }

  private boolean beruehrt(Figur z, String was) {
    if (z.istBuehne || !z.sichtbar) return false;
    switch (was) {
      case "_finger_":
        return fingerUnten && Darstellung.deckend(z, fingerX, fingerY);
      case "_rand_": {
        double[] g = Darstellung.grenzen(z);
        return g[0] < -240 || g[1] > 240 || g[2] < -180 || g[3] > 180;
      }
      default:
        Figur o = projekt.figur(was);
        if (o == null) return false;
        for (Figur e : projekt.ebenen) {
          if (e == z || !e.sichtbar) continue;
          if ((e == o || e.original == o) && ueberlappen(z, e)) return true;
        }
        return false;
    }
  }

  private static boolean ueberlappen(Figur a, Figur b) {
    double[] ga = Darstellung.grenzen(a), gb = Darstellung.grenzen(b);
    double l = Math.max(ga[0], gb[0]), r = Math.min(ga[1], gb[1]);
    double u = Math.max(ga[2], gb[2]), o = Math.min(ga[3], gb[3]);
    if (l >= r || u >= o) return false;
    double flaeche = (r - l) * (o - u);
    double schritt = Math.max(1, Math.sqrt(flaeche / 4000));
    for (double y = u + schritt / 2; y < o; y += schritt)
      for (double x = l + schritt / 2; x < r; x += schritt)
        if (Darstellung.deckend(a, x, y) && Darstellung.deckend(b, x, y)) return true;
    return false;
  }

  private boolean beruehrtFarbe(Figur z, int farbe) {
    if (z.istBuehne || !z.sichtbar) return false;
    if (farbBild != bildNummer || farbOhne != z || farbPixel == null) {
      Bitmap b = Bitmap.createBitmap(480, 360, Bitmap.Config.ARGB_8888);
      Canvas c = new Canvas(b);
      darstellung.zeichne(c, projekt, this, 1, z, false);
      if (farbPixel == null) farbPixel = new int[480 * 360];
      b.getPixels(farbPixel, 0, 480, 0, 0, 480, 360);
      b.recycle();
      farbBild = bildNummer;
      farbOhne = z;
    }
    double[] g = Darstellung.grenzen(z);
    int x0 = (int) Math.max(-240, Math.floor(g[0])), x1 = (int) Math.min(239, Math.ceil(g[1]));
    int y0 = (int) Math.max(-179, Math.floor(g[2])), y1 = (int) Math.min(180, Math.ceil(g[3]));
    int fr = (farbe >> 16) & 0xFF, fg = (farbe >> 8) & 0xFF, fb = farbe & 0xFF;
    for (int y = y0; y <= y1; y++) {
      for (int x = x0; x <= x1; x++) {
        if (!Darstellung.deckend(z, x + 0.5, y - 0.5)) continue;
        int c = farbPixel[(180 - y) * 480 + (x + 240)];
        if (Math.abs(((c >> 16) & 0xFF) - fr) <= 12 && Math.abs(((c >> 8) & 0xFF) - fg) <= 12
            && Math.abs((c & 0xFF) - fb) <= 12) return true;
      }
    }
    return false;
  }

  // ============================================================== Bewegen

  void setzePosition(Figur z, double nx, double ny) {
    if (z.istBuehne) return;
    double ax = z.x, ay = z.y;
    z.x = nx;
    z.y = ny;
    double[] g = Darstellung.grenzen(z);
    double rand = Math.floor(Math.min(15, Math.min((g[1] - g[0]) / 2, (g[3] - g[2]) / 2)));
    double dx = 0, dy = 0;
    if (g[1] < -240 + rand) dx = -240 + rand - g[1];
    if (g[0] > 240 - rand) dx = 240 - rand - g[0];
    if (g[3] < -180 + rand) dy = -180 + rand - g[3];
    if (g[2] > 180 - rand) dy = 180 - rand - g[2];
    z.x += dx;
    z.y += dy;
    if (z.stiftUnten) stiftLinie(z, ax, ay, z.x, z.y);
    if (z.sichtbar) neuZeichnen = true;
  }

  private void stiftLinie(Figur z, double x0, double y0, double x1, double y1) {
    stiftFarbe.setColor(z.stiftFarbe());
    stiftFarbe.setStrokeWidth((float) (z.stiftDicke * STIFT_RES));
    stiftFarbe.setStyle(Paint.Style.STROKE);
    float ax = (float) ((x0 + 240) * STIFT_RES), ay = (float) ((180 - y0) * STIFT_RES);
    float bx = (float) ((x1 + 240) * STIFT_RES), by = (float) ((180 - y1) * STIFT_RES);
    if (ax == bx && ay == by) {
      stiftFarbe.setStyle(Paint.Style.FILL);
      stiftCanvas.drawCircle(ax, ay, (float) Math.max(0.5, z.stiftDicke * STIFT_RES / 2), stiftFarbe);
    } else {
      stiftCanvas.drawLine(ax, ay, bx, by, stiftFarbe);
    }
    neuZeichnen = true;
  }

  void setzeRichtung(Figur z, double r) {
    if (Double.isInfinite(r) || Double.isNaN(r)) return;
    r = ((r + 179) % 360 + 360) % 360 - 179;
    z.richtung = r;
    if (z.sichtbar) neuZeichnen = true;
  }

  private void abprallen(Figur z) {
    double[] g = Darstellung.grenzen(z);
    double links = Math.max(0, 240 + g[0]), oben = Math.max(0, 180 - g[3]);
    double rechts = Math.max(0, 240 - g[1]), unten = Math.max(0, 180 + g[2]);
    int nah = 0;
    double min = links;
    if (oben < min) { min = oben; nah = 1; }
    if (rechts < min) { min = rechts; nah = 2; }
    if (unten < min) { min = unten; nah = 3; }
    if (min > 0) return;
    double rad = Math.toRadians(90 - z.richtung);
    double dx = Math.cos(rad), dy = -Math.sin(rad);
    switch (nah) {
      case 0: dx = Math.max(0.2, Math.abs(dx)); break;
      case 1: dy = Math.max(0.2, Math.abs(dy)); break;
      case 2: dx = -Math.max(0.2, Math.abs(dx)); break;
      default: dy = -Math.max(0.2, Math.abs(dy)); break;
    }
    setzeRichtung(z, Math.toDegrees(Math.atan2(dy, dx)) + 90);
    // zurück auf die Bühne schieben
    g = Darstellung.grenzen(z);
    double sx = 0, sy = 0;
    if (g[0] < -240) sx = -240 - g[0];
    if (g[1] > 240) sx = 240 - g[1];
    if (g[2] < -180) sy = -180 - g[2];
    if (g[3] > 180) sy = 180 - g[3];
    setzePosition(z, z.x + sx, z.y + sy);
  }

  // ============================================================== Aussehen

  private void wechsleKostuem(Figur z, Object wert) {
    if (z.kostueme.isEmpty()) return;
    String s = Werte.text(wert);
    for (int i = 0; i < z.kostueme.size(); i++) {
      if (z.kostueme.get(i).name.equals(s)) { z.kostuem = i; zeichneWennSichtbar(z); return; }
    }
    if (z.istBuehne) {
      switch (s) {
        case "_naechstes_": z.kostuem = (z.kostuem + 1) % z.kostueme.size(); zeichneWennSichtbar(z); return;
        case "_vorheriges_": z.kostuem = (z.kostuem - 1 + z.kostueme.size()) % z.kostueme.size(); zeichneWennSichtbar(z); return;
        case "_zufall_":
          if (z.kostueme.size() > 1) {
            int n;
            do { n = zufall.nextInt(z.kostueme.size()); } while (n == z.kostuem);
            z.kostuem = n;
            zeichneWennSichtbar(z);
          }
          return;
        default: break;
      }
    }
    Double n = Werte.alsZahlOderNull(wert);
    if (n != null && !Double.isInfinite(n)) {
      int i = (int) Math.round(n) - 1;
      int k = z.kostueme.size();
      z.kostuem = ((i % k) + k) % k;
      zeichneWennSichtbar(z);
    }
  }

  private void zeichneWennSichtbar(Figur z) {
    if (z.istBuehne || z.sichtbar) neuZeichnen = true;
  }

  private List<Faden> bildGewechselt() {
    Kostuem k = projekt.buehne.aktuell();
    if (k == null) return new ArrayList<>();
    final String name = k.name;
    return starteHuete("ereignis.bildWechsel", h -> h.werte[0].equals(name), null, true);
  }

  private void effekt(Figur z, String welcher, double wert, boolean aendern) {
    switch (welcher) {
      case "farbe": z.effektFarbe = aendern ? z.effektFarbe + wert : wert; break;
      case "helligkeit":
        z.effektHelligkeit = Math.max(-100, Math.min(100, aendern ? z.effektHelligkeit + wert : wert));
        break;
      case "geist": z.effektGeist = Math.max(0, Math.min(100, aendern ? z.effektGeist + wert : wert)); break;
      default: break;
    }
    zeichneWennSichtbar(z);
  }

  private void groesse(Figur z, double g) {
    Kostuem k = z.aktuell();
    double min = 5, max = 500;
    if (k != null) {
      double kurz = Math.min(k.breite(), k.hoehe()), lang = Math.max(k.breite(), k.hoehe());
      min = Math.min(100, 5 / Math.max(0.01, kurz) * 100);
      max = Math.max(100, Math.min(1.5 * 480 / Math.max(0.01, lang), 1.5 * 360 / Math.max(0.01, lang)) * 100);
    }
    z.groesse = Math.max(min, Math.min(max, g));
    setzePosition(z, z.x, z.y);
    zeichneWennSichtbar(z);
  }

  private void ebene(Figur z, int ziel) {
    List<Figur> e = projekt.ebenen;
    if (!e.remove(z)) return;
    ziel = Math.max(0, Math.min(e.size(), ziel));
    e.add(ziel, z);
    zeichneWennSichtbar(z);
  }

  private void sage(Faden f, Figur z, String text, boolean denkt) {
    if (z.istBuehne) return;
    z.blase = text.isEmpty() ? null : text;
    z.denkt = denkt;
    z.blasenBesitzer = f;
    zeichneWennSichtbar(z);
  }

  // ============================================================== Klone

  private void erzeugeKlon(Figur z, String von) {
    Figur quelle = von.equals("_selbst_") ? z : projekt.figur(von);
    if (quelle == null || quelle.istBuehne) return;
    int anzahl = 0;
    for (Figur e : projekt.ebenen) if (e.istKlon) anzahl++;
    if (anzahl >= MAX_KLONE) return;
    Figur k = quelle.klon();
    int i = projekt.ebenen.indexOf(quelle);
    projekt.ebenen.add(Math.max(0, i), k);
    starteHuete("steuerung.klonStart", null, k, false);
    zeichneWennSichtbar(k);
  }

  private void loescheKlon(Figur z) {
    projekt.ebenen.remove(z);
    for (Faden f : faeden) if (f.ziel == z) f.fertig = true;
    neuZeichnen = true;
  }

  // ============================================================== Stift

  void stiftLoeschen() {
    stiftCanvas.drawColor(0, PorterDuff.Mode.CLEAR);
    neuZeichnen = true;
  }

  private void abdruck(Figur z) {
    if (!z.sichtbar) return;
    darstellung.zeichneFigur(stiftCanvas, z, STIFT_RES);
    neuZeichnen = true;
  }

  // ============================================================== Befehle

  private int ausfuehren(Faden f, Rahmen r) {
    Block b = r.block;
    Figur z = f.ziel;
    if (z.istBuehne && b.spec.nurFigur) return WEITER;
    switch (b.spec.op) {
      // -------------------------------------------------- Bewegung
      case "bewegung.gehe": {
        double s = zahl(b, 0, z), rad = Math.toRadians(90 - z.richtung);
        setzePosition(z, z.x + s * Math.cos(rad), z.y + s * Math.sin(rad));
        return WEITER;
      }
      case "bewegung.rechts": setzeRichtung(z, z.richtung + zahl(b, 0, z)); return WEITER;
      case "bewegung.links": setzeRichtung(z, z.richtung - zahl(b, 0, z)); return WEITER;
      case "bewegung.gehezu": {
        double[] p = position(text(b, 0, z));
        if (p != null) setzePosition(z, p[0], p[1]);
        return WEITER;
      }
      case "bewegung.gehezuxy": setzePosition(z, zahl(b, 0, z), zahl(b, 1, z)); return WEITER;
      case "bewegung.gleitezu":
      case "bewegung.gleitexy": {
        if (!r.begonnen) {
          r.begonnen = true;
          r.t0 = jetzt();
          r.dauer = zahl(b, 0, z);
          r.x0 = z.x;
          r.y0 = z.y;
          if (b.spec.op.equals("bewegung.gleitexy")) {
            r.x1 = zahl(b, 1, z);
            r.y1 = zahl(b, 2, z);
          } else {
            double[] p = position(text(b, 1, z));
            if (p == null) return WEITER;
            r.x1 = p[0];
            r.y1 = p[1];
          }
          if (r.dauer <= 0) { setzePosition(z, r.x1, r.y1); return WEITER; }
          return WARTEN;
        }
        double t = (jetzt() - r.t0) / r.dauer;
        if (t >= 1) { setzePosition(z, r.x1, r.y1); return WEITER; }
        setzePosition(z, r.x0 + (r.x1 - r.x0) * t, r.y0 + (r.y1 - r.y0) * t);
        return WARTEN;
      }
      case "bewegung.richtung": setzeRichtung(z, zahl(b, 0, z)); return WEITER;
      case "bewegung.drehezu": {
        double[] p = position(text(b, 0, z));
        if (p != null && (p[0] != z.x || p[1] != z.y))
          setzeRichtung(z, 90 - Math.toDegrees(Math.atan2(p[1] - z.y, p[0] - z.x)));
        return WEITER;
      }
      case "bewegung.aendereX": setzePosition(z, z.x + zahl(b, 0, z), z.y); return WEITER;
      case "bewegung.setzeX": setzePosition(z, zahl(b, 0, z), z.y); return WEITER;
      case "bewegung.aendereY": setzePosition(z, z.x, z.y + zahl(b, 0, z)); return WEITER;
      case "bewegung.setzeY": setzePosition(z, z.x, zahl(b, 0, z)); return WEITER;
      case "bewegung.abprallen": abprallen(z); return WEITER;
      case "bewegung.drehtyp": z.drehtyp = b.werte[0]; zeichneWennSichtbar(z); return WEITER;

      // -------------------------------------------------- Aussehen
      case "aussehen.sageZeit":
      case "aussehen.denkeZeit":
        if (!r.begonnen) {
          r.begonnen = true;
          sage(f, z, text(b, 0, z), b.spec.op.equals("aussehen.denkeZeit"));
          r.t0 = jetzt();
          r.dauer = zahl(b, 1, z);
          return WARTEN;
        }
        if (jetzt() - r.t0 < r.dauer) return WARTEN;
        if (z.blasenBesitzer == f) { z.blase = null; neuZeichnen = true; }
        return WEITER;
      case "aussehen.sage": sage(f, z, text(b, 0, z), false); return WEITER;
      case "aussehen.denke": sage(f, z, text(b, 0, z), true); return WEITER;
      case "aussehen.kostuem": wechsleKostuem(z, wert(b, 0, z)); return WEITER;
      case "aussehen.naechstesKostuem":
        if (!z.kostueme.isEmpty()) { z.kostuem = (z.kostuem + 1) % z.kostueme.size(); zeichneWennSichtbar(z); }
        return WEITER;
      case "aussehen.bild": {
        wechsleKostuem(projekt.buehne, wert(b, 0, z));
        neuZeichnen = true;
        bildGewechselt();
        return WEITER;
      }
      case "aussehen.naechstesBild": {
        Figur s = projekt.buehne;
        if (!s.kostueme.isEmpty()) s.kostuem = (s.kostuem + 1) % s.kostueme.size();
        neuZeichnen = true;
        bildGewechselt();
        return WEITER;
      }
      case "aussehen.aendereGroesse": groesse(z, z.groesse + zahl(b, 0, z)); return WEITER;
      case "aussehen.setzeGroesse": groesse(z, zahl(b, 0, z)); return WEITER;
      case "aussehen.aendereEffekt": effekt(z, b.werte[0], zahl(b, 1, z), true); return WEITER;
      case "aussehen.setzeEffekt": effekt(z, b.werte[0], zahl(b, 1, z), false); return WEITER;
      case "aussehen.effekteAus": z.effekteAus(); zeichneWennSichtbar(z); return WEITER;
      case "aussehen.zeige": z.sichtbar = true; neuZeichnen = true; return WEITER;
      case "aussehen.verstecke":
        if (z.sichtbar) { z.sichtbar = false; neuZeichnen = true; }
        return WEITER;
      case "aussehen.ebene":
        ebene(z, b.werte[0].equals("hinterste") ? 0 : projekt.ebenen.size());
        return WEITER;
      case "aussehen.ebenen": {
        int n = Werte.ganz(wert(b, 0, z));
        int i = projekt.ebenen.indexOf(z);
        if (i >= 0) ebene(z, b.werte[1].equals("zurueck") ? i - n : i + n);
        return WEITER;
      }

      // -------------------------------------------------- Klang
      case "klang.spieleGanz":
        if (!r.begonnen) {
          r.begonnen = true;
          r.t0 = jetzt();
          r.dauer = klang.spiele(klangName(text(b, 0, z)), z.lautstaerke);
          return WARTEN;
        }
        return jetzt() - r.t0 < r.dauer ? WARTEN : WEITER;
      case "klang.spiele": klang.spiele(klangName(text(b, 0, z)), z.lautstaerke); return WEITER;
      case "klang.note":
        if (!r.begonnen) {
          r.begonnen = true;
          r.t0 = jetzt();
          r.dauer = zahl(b, 1, z);
          if (r.dauer > 0) klang.note(z.instrument, zahl(b, 0, z), r.dauer, z.lautstaerke);
          return WARTEN;
        }
        return jetzt() - r.t0 < r.dauer ? WARTEN : WEITER;
      case "klang.instrument": z.instrument = b.werte[0]; return WEITER;
      case "klang.stoppe": klang.stoppeAlle(); return WEITER;
      case "klang.aendereLautstaerke":
        z.lautstaerke = Math.max(0, Math.min(100, z.lautstaerke + zahl(b, 0, z)));
        return WEITER;
      case "klang.setzeLautstaerke":
        z.lautstaerke = Math.max(0, Math.min(100, zahl(b, 0, z)));
        return WEITER;

      // -------------------------------------------------- Ereignisse
      case "ereignis.sende": {
        final String n = text(b, 0, z);
        starteHuete("ereignis.empfange", h -> h.werte[0].equalsIgnoreCase(n), null, true);
        return WEITER;
      }
      case "ereignis.sendeWarte": {
        if (!r.begonnen) {
          r.begonnen = true;
          final String n = text(b, 0, z);
          r.daten = starteHuete("ereignis.empfange", h -> h.werte[0].equalsIgnoreCase(n), null, true);
          return WARTEN;
        }
        @SuppressWarnings("unchecked") List<Faden> l = (List<Faden>) r.daten;
        for (Faden g : l) if (!g.fertig && faeden.contains(g)) return WARTEN;
        return WEITER;
      }

      // -------------------------------------------------- Steuerung
      case "steuerung.warte":
        if (!r.begonnen) {
          r.begonnen = true;
          r.t0 = jetzt();
          r.dauer = zahl(b, 0, z);
          return WARTEN;
        }
        return jetzt() - r.t0 < r.dauer ? WARTEN : WEITER;
      case "steuerung.wiederhole":
        if (!r.begonnen) {
          r.begonnen = true;
          r.zaehler = Werte.ganz(wert(b, 0, z));
        } else if (r.subFertig) {
          r.subFertig = false;
          return WARTEN;
        }
        if (r.zaehler <= 0) return WEITER;
        r.zaehler--;
        f.stapel.add(new Rahmen(b.sub[0]));
        return SUB;
      case "steuerung.fortlaufend":
        if (r.subFertig) {
          r.subFertig = false;
          return WARTEN;
        }
        r.begonnen = true;
        f.stapel.add(new Rahmen(b.sub[0]));
        return SUB;
      case "steuerung.wiederholeBis":
        if (r.subFertig) {
          r.subFertig = false;
          return WARTEN;
        }
        if (bedingung(b, 0, z)) return WEITER;
        f.stapel.add(new Rahmen(b.sub[0]));
        return SUB;
      case "steuerung.falls":
        if (r.begonnen) return WEITER;
        r.begonnen = true;
        if (bedingung(b, 0, z) && b.sub[0] != null) {
          f.stapel.add(new Rahmen(b.sub[0]));
          return SUB;
        }
        return WEITER;
      case "steuerung.fallsSonst": {
        if (r.begonnen) return WEITER;
        r.begonnen = true;
        Block zweig = bedingung(b, 0, z) ? b.sub[0] : b.sub[1];
        if (zweig != null) {
          f.stapel.add(new Rahmen(zweig));
          return SUB;
        }
        return WEITER;
      }
      case "steuerung.warteBis":
        return bedingung(b, 0, z) ? WEITER : WARTEN;
      case "steuerung.stoppe":
        if (b.werte[0].equals("alles")) {
          stoppeAlles();
          return ENDE;
        }
        return ENDE;
      case "steuerung.stoppeAndere":
        for (Faden g : faeden) if (g != f && g.ziel == z) g.fertig = true;
        return WEITER;
      case "steuerung.klon": erzeugeKlon(z, text(b, 0, z)); return WEITER;
      case "steuerung.loescheKlon":
        if (z.istKlon) { loescheKlon(z); return ENDE; }
        return WEITER;

      // -------------------------------------------------- Fühlen
      case "fuehlen.frage":
        if (!r.begonnen) {
          r.begonnen = true;
          r.daten = text(b, 0, z);
        }
        if (frager == null && !r.gefragt) {
          frager = f;
          r.gefragt = true;
          antwortDa = false;
          String frage = (String) r.daten;
          if (!z.istBuehne && z.sichtbar) {
            sage(f, z, frage, false);
            ansicht.frage("");
          } else {
            ansicht.frage(frage);
          }
          return WARTEN;
        }
        if (frager == f && antwortDa) {
          frager = null;
          antwortDa = false;
          if (z.blasenBesitzer == f) { z.blase = null; neuZeichnen = true; }
          return WEITER;
        }
        return WARTEN;
      case "fuehlen.stoppuhrNeu": stoppuhrStart = jetzt(); return WEITER;
      case "fuehlen.konsole":
        konsole.add(text(b, 0, z));
        while (konsole.size() > 200) konsole.remove(0);
        neuZeichnen = true;
        return WEITER;

      // -------------------------------------------------- Variablen
      case "var.setze":
        projekt.variablen.put(b.werte[0], wert(b, 1, z));
        return WEITER;
      case "var.aendere": {
        Object alt = projekt.variablen.get(b.werte[0]);
        projekt.variablen.put(b.werte[0], Werte.zahl(alt) + zahl(b, 1, z));
        return WEITER;
      }
      case "var.zeige":
        if (projekt.variablen.containsKey(b.werte[0])) projekt.monitore.add(b.werte[0]);
        neuZeichnen = true;
        return WEITER;
      case "var.verstecke":
        projekt.monitore.remove(b.werte[0]);
        neuZeichnen = true;
        return WEITER;

      // -------------------------------------------------- Stift
      case "stift.loesche": stiftLoeschen(); return WEITER;
      case "stift.abdruck": abdruck(z); return WEITER;
      case "stift.runter":
        z.stiftUnten = true;
        stiftLinie(z, z.x, z.y, z.x, z.y);
        return WEITER;
      case "stift.hoch": z.stiftUnten = false; return WEITER;
      case "stift.farbe": z.setzeStiftFarbe(farbe(b.werte[0])); return WEITER;
      case "stift.aendereFarbton": z.stiftH = ((z.stiftH + zahl(b, 0, z)) % 100 + 100) % 100; return WEITER;
      case "stift.setzeFarbton": z.stiftH = ((zahl(b, 0, z) % 100) + 100) % 100; return WEITER;
      case "stift.dicke": z.stiftDicke = Math.max(1, Math.min(1200, zahl(b, 0, z))); return WEITER;
      case "stift.aendereDicke": z.stiftDicke = Math.max(1, Math.min(1200, z.stiftDicke + zahl(b, 0, z))); return WEITER;

      default:
        // Hüte mitten im Stapel (kommt nicht vor) und Werteblöcke ignorieren
        if (b.spec.istWert()) auswerten(b, z);
        return WEITER;
    }
  }

  /** Klangnamen aus Werteblöcken: Name, Anzeige oder Nummer */
  private static String klangName(String s) {
    for (String[] k : Klang.KLAENGE) if (k[0].equalsIgnoreCase(s) || k[1].equalsIgnoreCase(s)) return k[0];
    Double n = Werte.alsZahlOderNull(s);
    if (n != null && !Double.isInfinite(n)) {
      int i = (int) Math.round(n) - 1, l = Klang.KLAENGE.length;
      return Klang.KLAENGE[((i % l) + l) % l][0];
    }
    return s;
  }
}
