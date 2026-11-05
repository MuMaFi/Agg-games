
// ==========================================================================
//  Laufzeit
//
//  Blockwerk haengt diese Klassen an jedes exportierte Programm an, damit
//  die Datei fuer sich allein laeuft. Sie stellen Fenster, Buehne, Figuren,
//  Stift, Klaenge und das Abwechseln der Skripte bereit; das Programm oben
//  benutzt sie nur.
//
//  Jedes Skript (jeder "wenn ..."-Block) laeuft in einem eigenen Thread.
//  Es laeuft aber immer nur eines zur Zeit: am Ende jedes Schleifen-
//  durchlaufs (warteAufBild) und beim Warten gibt ein Skript an das naechste
//  ab. Rund 30-mal je Sekunde wird die Buehne neu gezeichnet.
//
//  Ohne Bildschirm (java -Dblockwerk.kopflos=3 ...) laeuft das Programm drei
//  Sekunden lang ohne Fenster und gibt danach Variablen und Figuren aus.
// ==========================================================================

/** Ein Startblock: was ihn ausloest und was dann passiert. */
final class Hut {
  static final int START = 0, TASTE = 1, KLICK = 2, NACHRICHT = 3, BUEHNENBILD = 4, KLON = 5;
  final int art;
  final String wert;
  final Runnable aktion;

  Hut(int art, String wert, Runnable aktion) {
    this.art = art;
    this.wert = wert;
    this.aktion = aktion;
  }
}

/** Beendet ein Skript von innen heraus (stoppe ..., loesche diesen Klon). */
final class Stopp extends Error {
  Stopp() { super(null, null, false, false); }
}

/** Ein laufendes Skript mit eigenem Thread. */
final class Skript {
  final Ziel ziel;
  final Hut hut;
  private Thread faden;
  private final java.util.concurrent.Semaphore los = new java.util.concurrent.Semaphore(0);
  private final java.util.concurrent.Semaphore zurueck = new java.util.concurrent.Semaphore(0);
  volatile boolean beendet, abbrechen;

  Skript(Ziel ziel, Hut hut) {
    this.ziel = ziel;
    this.hut = hut;
  }

  /** Vom Takt aufgerufen: laesst das Skript bis zur naechsten Pause laufen. */
  void schritt() {
    if (beendet) return;
    if (faden == null) {
      faden = new Thread(null, this::lauf, "Skript " + ziel.name, 1 << 20);
      faden.setDaemon(true);
      faden.start();
      Welt.fortschritt = true;
    }
    Skript vorher = Welt.aktuell;
    Welt.aktuell = this;
    los.release();
    zurueck.acquireUninterruptibly();
    Welt.aktuell = vorher;
  }

  private void lauf() {
    los.acquireUninterruptibly();
    try {
      if (!abbrechen) hut.aktion.run();
    } catch (Stopp s) {
      // regulaer beendet
    } catch (Throwable t) {
      System.err.println("Fehler in einem Skript von " + ziel.name + ":");
      t.printStackTrace();
    } finally {
      beendet = true;
      Welt.fortschritt = true;
      zurueck.release();
    }
  }

  /** Im Skript-Thread: Pause bis zum naechsten Durchgang. */
  void abgeben(boolean fortschritt) {
    if (fortschritt) Welt.fortschritt = true;
    zurueck.release();
    los.acquireUninterruptibly();
    if (abbrechen) throw new Stopp();
  }

  /** Beendet ein Skript, das gerade nicht laeuft. */
  void abbrechen() {
    if (beendet) return;
    abbrechen = true;
    if (this == Welt.aktuell) return; // wirft beim naechsten abgeben()
    if (faden == null) {
      beendet = true;
      return;
    }
    Skript vorher = Welt.aktuell;
    Welt.aktuell = this;
    los.release();
    zurueck.acquireUninterruptibly();
    Welt.aktuell = vorher;
  }
}

/** Ein Kostuem oder Buehnenbild: Bild, Drehpunkt und Aufloesung. */
final class Kostuem {
  private static final Map<String[], BufferedImage> GELADEN = new IdentityHashMap<>();

  final String name;
  final BufferedImage bild;
  final double mx, my, aufloesung;
  private int[] pixel;
  private BufferedImage gefiltert;
  private double filterFarbe, filterHell;

  Kostuem(String name, String[] png, double mx, double my, double aufloesung) {
    this.name = name;
    this.bild = laden(png);
    this.mx = mx;
    this.my = my;
    this.aufloesung = aufloesung;
  }

  private static BufferedImage laden(String[] png) {
    synchronized (GELADEN) {
      BufferedImage b = GELADEN.get(png);
      if (b != null) return b;
      try {
        byte[] daten = Base64.getDecoder().decode(String.join("", png));
        BufferedImage roh = ImageIO.read(new ByteArrayInputStream(daten));
        b = new BufferedImage(roh.getWidth(), roh.getHeight(), BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = b.createGraphics();
        g.drawImage(roh, 0, 0, null);
        g.dispose();
      } catch (Exception e) {
        b = new BufferedImage(2, 2, BufferedImage.TYPE_INT_ARGB);
      }
      GELADEN.put(png, b);
      return b;
    }
  }

  double breite() { return bild.getWidth() / aufloesung; }
  double hoehe() { return bild.getHeight() / aufloesung; }

  boolean deckend(int px, int py) {
    int w = bild.getWidth(), h = bild.getHeight();
    if (px < 0 || py < 0 || px >= w || py >= h) return false;
    if (pixel == null) pixel = bild.getRGB(0, 0, w, h, null, 0, w);
    return (pixel[py * w + px] >>> 24) > 40;
  }

  /** Das Bild mit Farb- und Helligkeitseffekt (zwischengespeichert). */
  BufferedImage mitEffekt(double farbe, double hell) {
    if (farbe == 0 && hell == 0) return bild;
    if (gefiltert != null && filterFarbe == farbe && filterHell == hell) return gefiltert;
    int w = bild.getWidth(), h = bild.getHeight();
    int[] px = bild.getRGB(0, 0, w, h, null, 0, w);
    double a = Math.toRadians((((farbe % 200) + 200) % 200) * 1.8);
    double co = Math.cos(a), si = Math.sin(a);
    double[] m = {
        0.213 + co * 0.787 - si * 0.213, 0.715 - co * 0.715 - si * 0.715, 0.072 - co * 0.072 + si * 0.928,
        0.213 - co * 0.213 + si * 0.143, 0.715 + co * 0.285 + si * 0.140, 0.072 - co * 0.072 - si * 0.283,
        0.213 - co * 0.213 - si * 0.787, 0.715 - co * 0.715 + si * 0.715, 0.072 + co * 0.928 + si * 0.072};
    double o = Math.max(-100, Math.min(100, hell)) * 2.55;
    for (int i = 0; i < px.length; i++) {
      int c = px[i];
      int r = (c >> 16) & 0xFF, g = (c >> 8) & 0xFF, b = c & 0xFF;
      int nr = klemme(m[0] * r + m[1] * g + m[2] * b + o);
      int ng = klemme(m[3] * r + m[4] * g + m[5] * b + o);
      int nb = klemme(m[6] * r + m[7] * g + m[8] * b + o);
      px[i] = (c & 0xFF000000) | (nr << 16) | (ng << 8) | nb;
    }
    BufferedImage neu = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
    neu.setRGB(0, 0, w, h, px, 0, w);
    gefiltert = neu;
    filterFarbe = farbe;
    filterHell = hell;
    return neu;
  }

  private static int klemme(double v) { return v < 0 ? 0 : v > 255 ? 255 : (int) v; }
}

/** Gemeinsames von Buehne und Figuren. */
abstract class Ziel {
  final String name;
  List<Kostuem> kostueme = new ArrayList<>();
  int kostuem;
  double effektFarbe, effektHelligkeit, effektGeist;
  double lautstaerke = 100;
  String instrument = "klavier";
  final List<Hut> huete = new ArrayList<>();

  Ziel(String name) { this.name = name; }

  /** Hier meldet das Programm die Skripte an. */
  void skripte() {}

  boolean istBuehne() { return false; }

  protected void fuegeKostuemHinzu(String name, String[] png, double mx, double my, double aufloesung) {
    kostueme.add(new Kostuem(name, png, mx, my, aufloesung));
  }

  Kostuem aktuell() {
    if (kostueme.isEmpty()) return null;
    if (kostuem < 0 || kostuem >= kostueme.size()) kostuem = 0;
    return kostueme.get(kostuem);
  }

  // ------------------------------------------------------------ Startbloecke

  protected void wennProgrammStartet(Runnable r) { huete.add(new Hut(Hut.START, null, r)); }
  protected void wennTasteGedrueckt(String taste, Runnable r) { huete.add(new Hut(Hut.TASTE, taste, r)); }
  protected void wennAngeklickt(Runnable r) { huete.add(new Hut(Hut.KLICK, null, r)); }
  protected void wennIchEmpfange(String nachricht, Runnable r) { huete.add(new Hut(Hut.NACHRICHT, nachricht, r)); }
  protected void wennBuehnenbildWechseltZu(String bild, Runnable r) { huete.add(new Hut(Hut.BUEHNENBILD, bild, r)); }
  protected void wennIchAlsKlonEntstehe(Runnable r) { huete.add(new Hut(Hut.KLON, null, r)); }

  // ------------------------------------------------------------ Steuerung

  /** Ende eines Schleifendurchlaufs: die anderen Skripte sind dran. */
  protected void warteAufBild() {
    if (Welt.aktuell != null) Welt.aktuell.abgeben(true);
  }

  static void pause() {
    if (Welt.aktuell != null) Welt.aktuell.abgeben(false);
  }

  protected void warte(double sekunden) {
    double ende = Welt.zeit() + sekunden;
    do pause(); while (Welt.zeit() < ende);
  }

  protected void warteBis(BooleanSupplier bedingung) {
    while (!bedingung.getAsBoolean()) pause();
  }

  protected void stoppeAlles() {
    Welt.stoppeAlles();
    throw new Stopp();
  }

  protected void stoppeDiesesSkript() { throw new Stopp(); }

  protected void stoppeAndereSkripte() {
    for (Skript s : new ArrayList<>(Welt.skripte)) if (s.ziel == this && s != Welt.aktuell) s.abbrechen();
  }

  protected void erzeugeKlonVon(String name) {
    Figur f = Welt.original(name);
    if (f != null) Welt.erzeugeKlon(f);
  }

  protected void sende(String nachricht) {
    Welt.starteHuete(Hut.NACHRICHT, nachricht, null, true);
  }

  protected void sendeUndWarte(String nachricht) {
    List<Skript> l = Welt.starteHuete(Hut.NACHRICHT, nachricht, null, true);
    pause();
    while (true) {
      boolean fertig = true;
      for (Skript s : l) if (!s.beendet) fertig = false;
      if (fertig) return;
      pause();
    }
  }

  // ------------------------------------------------------------ Aussehen

  protected void wechsleZuBuehnenbild(String name) {
    Buehne b = Welt.buehne;
    if (!b.waehle(name)) {
      Double n = Wert.zahlOderNull(name);
      if (n != null) b.waehle(n);
    }
    Welt.bildGewechselt();
  }

  protected void wechsleZuBuehnenbild(double nummer) {
    Welt.buehne.waehle(nummer);
    Welt.bildGewechselt();
  }

  protected void naechstesBuehnenbild() { wechsleZuBuehnenbild(Welt.buehne.kostuem + 2); }
  protected void vorherigesBuehnenbild() { wechsleZuBuehnenbild(Welt.buehne.kostuem); }

  protected void zufaelligesBuehnenbild() {
    int n = Welt.buehne.kostueme.size();
    if (n > 1) {
      int neu;
      do neu = Welt.zufall.nextInt(n); while (neu == Welt.buehne.kostuem);
      wechsleZuBuehnenbild(neu + 1);
    }
  }

  boolean waehle(String name) {
    for (int i = 0; i < kostueme.size(); i++) {
      if (kostueme.get(i).name.equals(name)) {
        kostuem = i;
        Welt.neuZeichnen = true;
        return true;
      }
    }
    return false;
  }

  void waehle(double nummer) {
    int n = kostueme.size();
    if (n == 0 || Double.isNaN(nummer) || Double.isInfinite(nummer)) return;
    int i = (int) Math.round(nummer) - 1;
    kostuem = ((i % n) + n) % n;
    Welt.neuZeichnen = true;
  }

  protected void aendereEffekt(String effekt, double wert) { effekt(effekt, wert, true); }
  protected void setzeEffekt(String effekt, double wert) { effekt(effekt, wert, false); }

  private void effekt(String effekt, double wert, boolean aendern) {
    switch (effekt) {
      case "farbe": effektFarbe = aendern ? effektFarbe + wert : wert; break;
      case "helligkeit": effektHelligkeit = Math.max(-100, Math.min(100, aendern ? effektHelligkeit + wert : wert)); break;
      case "geist": effektGeist = Math.max(0, Math.min(100, aendern ? effektGeist + wert : wert)); break;
      default: break;
    }
    Welt.neuZeichnen = true;
  }

  protected void schalteGrafikeffekteAus() {
    effektFarbe = effektHelligkeit = effektGeist = 0;
    Welt.neuZeichnen = true;
  }

  protected double bildNummer() { return Welt.buehne.kostuem + 1; }
  protected String bildName() { Kostuem k = Welt.buehne.aktuell(); return k == null ? "" : k.name; }

  // ------------------------------------------------------------ Klang

  protected void spieleKlang(String klang) { Klaenge.spiele(klang, lautstaerke); }

  protected void spieleKlangGanz(String klang) { warte(Klaenge.spiele(klang, lautstaerke)); }

  protected void spieleNote(double note, double sekunden) {
    if (sekunden > 0) Klaenge.note(instrument, note, sekunden, lautstaerke);
    warte(sekunden);
  }

  protected void setzeInstrument(String instrument) { this.instrument = instrument; }
  protected void stoppeAlleKlaenge() { Klaenge.stoppeAlle(); }
  protected void aendereLautstaerke(double wert) { lautstaerke = Math.max(0, Math.min(100, lautstaerke + wert)); }
  protected void setzeLautstaerke(double wert) { lautstaerke = Math.max(0, Math.min(100, wert)); }
  protected double lautstaerke() { return lautstaerke; }

  // ------------------------------------------------------------ Fuehlen

  protected void frage(String frage) { Welt.frage(this, frage); }
  protected String antwort() { return Welt.antwort; }
  protected boolean tasteGedrueckt(String taste) {
    return taste.equals("beliebig") ? !Welt.tasten.isEmpty() : Welt.tasten.contains(taste);
  }
  protected boolean mausGedrueckt() { return Welt.mausUnten; }
  protected double mausX() { return Math.round(Welt.mausX); }
  protected double mausY() { return Math.round(Welt.mausY); }
  /** Ein Computer hat keinen Neigungssensor. */
  protected double neigung(String richtung) { return 0; }
  protected double stoppuhr() { return Math.round((Welt.zeit() - Welt.stoppuhrStart) * 1000) / 1000.0; }
  protected void starteStoppuhrNeu() { Welt.stoppuhrStart = Welt.zeit(); }
  protected Ziel figur(String name) { return name.equals("_buehne_") ? Welt.buehne : Welt.original(name); }

  // ------------------------------------------------------------ Variablen und Stift

  protected void zeigeVariable(String name) { Welt.monitore.add(name); Welt.neuZeichnen = true; }
  protected void versteckeVariable(String name) { Welt.monitore.remove(name); Welt.neuZeichnen = true; }
  protected void loescheAlles() { Welt.stiftLoeschen(); }

  // ------------------------------------------------------------ Eigenschaften

  protected double xPosition() { return 0; }
  protected double yPosition() { return 0; }
  protected double richtung() { return 90; }
  protected double groesse() { return 100; }
  protected double kostuemNummer() { return kostuem + 1; }
  protected String kostuemName() { Kostuem k = aktuell(); return k == null ? "" : k.name; }
}

/** Die Buehne: Buehnenbilder und Skripte, aber keine Bewegung. */
class Buehne extends Ziel {
  Buehne() { super("Buehne"); }
  @Override boolean istBuehne() { return true; }
}

/** Eine Figur auf der Buehne. 480 x 360 Einheiten, (0|0) in der Mitte. */
class Figur extends Ziel {
  double x, y, richtung = 90, groesse = 100;
  boolean sichtbar = true;
  String drehtyp = "rundherum";
  boolean istKlon;
  Figur original;
  boolean stiftUnten;
  double stiftH = 62, stiftS = 84, stiftV = 92, stiftDicke = 1;
  String blase;
  boolean denkt;
  Object blasenBesitzer;

  Figur(String name) { super(name); }

  // ------------------------------------------------------------ Bewegung

  protected void gehe(double schritte) {
    double rad = Math.toRadians(90 - richtung);
    setzePosition(x + schritte * Math.cos(rad), y + schritte * Math.sin(rad));
  }

  protected void dreheRechts(double grad) { setzeRichtung(richtung + grad); }
  protected void dreheLinks(double grad) { setzeRichtung(richtung - grad); }
  protected void geheZu(double nx, double ny) { setzePosition(nx, ny); }

  protected void geheZu(String figur) {
    Figur f = Welt.original(figur);
    if (f != null) setzePosition(f.x, f.y);
  }

  protected void geheZuZufallsposition() {
    setzePosition(Math.round(Welt.zufall.nextDouble() * 480 - 240), Math.round(Welt.zufall.nextDouble() * 360 - 180));
  }

  protected void geheZuMaus() { setzePosition(Welt.mausX, Welt.mausY); }

  protected void gleiteZu(double sekunden, double zx, double zy) {
    double x0 = x, y0 = y, start = Welt.zeit();
    if (sekunden <= 0) {
      setzePosition(zx, zy);
      return;
    }
    while (true) {
      pause();
      double t = (Welt.zeit() - start) / sekunden;
      if (t >= 1) {
        setzePosition(zx, zy);
        return;
      }
      setzePosition(x0 + (zx - x0) * t, y0 + (zy - y0) * t);
    }
  }

  protected void gleiteZu(double sekunden, String figur) {
    Figur f = Welt.original(figur);
    if (f != null) gleiteZu(sekunden, f.x, f.y);
  }

  protected void gleiteZuZufallsposition(double sekunden) {
    gleiteZu(sekunden, Math.round(Welt.zufall.nextDouble() * 480 - 240), Math.round(Welt.zufall.nextDouble() * 360 - 180));
  }

  protected void gleiteZuMaus(double sekunden) { gleiteZu(sekunden, Welt.mausX, Welt.mausY); }

  protected void setzeRichtung(double r) {
    if (Double.isNaN(r) || Double.isInfinite(r)) return;
    richtung = ((r + 179) % 360 + 360) % 360 - 179;
    if (sichtbar) Welt.neuZeichnen = true;
  }

  protected void dreheDichZu(String figur) {
    Figur f = Welt.original(figur);
    if (f != null) dreheZu(f.x, f.y);
  }

  protected void dreheDichZuMaus() { dreheZu(Welt.mausX, Welt.mausY); }

  private void dreheZu(double zx, double zy) {
    if (zx != x || zy != y) setzeRichtung(90 - Math.toDegrees(Math.atan2(zy - y, zx - x)));
  }

  protected void aendereX(double d) { setzePosition(x + d, y); }
  protected void setzeX(double nx) { setzePosition(nx, y); }
  protected void aendereY(double d) { setzePosition(x, y + d); }
  protected void setzeY(double ny) { setzePosition(x, ny); }
  protected void setzeDrehtyp(String typ) { drehtyp = typ; if (sichtbar) Welt.neuZeichnen = true; }

  protected void pralleVomRandAb() {
    double[] g = Welt.grenzen(this);
    double links = Math.max(0, 240 + g[0]), oben = Math.max(0, 180 - g[3]);
    double rechts = Math.max(0, 240 - g[1]), unten = Math.max(0, 180 + g[2]);
    int nah = 0;
    double min = links;
    if (oben < min) { min = oben; nah = 1; }
    if (rechts < min) { min = rechts; nah = 2; }
    if (unten < min) { min = unten; nah = 3; }
    if (min > 0) return;
    double rad = Math.toRadians(90 - richtung);
    double dx = Math.cos(rad), dy = -Math.sin(rad);
    switch (nah) {
      case 0: dx = Math.max(0.2, Math.abs(dx)); break;
      case 1: dy = Math.max(0.2, Math.abs(dy)); break;
      case 2: dx = -Math.max(0.2, Math.abs(dx)); break;
      default: dy = -Math.max(0.2, Math.abs(dy)); break;
    }
    setzeRichtung(Math.toDegrees(Math.atan2(dy, dx)) + 90);
    g = Welt.grenzen(this);
    double sx = 0, sy = 0;
    if (g[0] < -240) sx = -240 - g[0];
    if (g[1] > 240) sx = 240 - g[1];
    if (g[2] < -180) sy = -180 - g[2];
    if (g[3] > 180) sy = 180 - g[3];
    setzePosition(x + sx, y + sy);
  }

  /** Setzt die Position, laesst die Figur aber nie ganz von der Buehne. */
  void setzePosition(double nx, double ny) {
    double ax = x, ay = y;
    x = nx;
    y = ny;
    double[] g = Welt.grenzen(this);
    double rand = Math.floor(Math.min(15, Math.min((g[1] - g[0]) / 2, (g[3] - g[2]) / 2)));
    if (g[1] < -240 + rand) x += -240 + rand - g[1];
    if (g[0] > 240 - rand) x += 240 - rand - g[0];
    if (g[3] < -180 + rand) y += -180 + rand - g[3];
    if (g[2] > 180 - rand) y += 180 - rand - g[2];
    if (stiftUnten) Welt.stiftLinie(this, ax, ay, x, y);
    if (sichtbar) Welt.neuZeichnen = true;
  }

  // ------------------------------------------------------------ Aussehen

  protected void sage(String text, double sekunden) {
    Object ich = sprich(text, false);
    warte(sekunden);
    if (blasenBesitzer == ich) { blase = null; Welt.neuZeichnen = true; }
  }

  protected void sage(String text) { sprich(text, false); }

  protected void denke(String text, double sekunden) {
    Object ich = sprich(text, true);
    warte(sekunden);
    if (blasenBesitzer == ich) { blase = null; Welt.neuZeichnen = true; }
  }

  protected void denke(String text) { sprich(text, true); }

  Object sprich(String text, boolean denken) {
    blase = text.isEmpty() ? null : text;
    denkt = denken;
    blasenBesitzer = Welt.aktuell != null ? Welt.aktuell : new Object();
    Welt.neuZeichnen = true;
    return blasenBesitzer;
  }

  protected void wechsleZuKostuem(String name) {
    if (!waehle(name)) {
      Double n = Wert.zahlOderNull(name);
      if (n != null) waehle(n);
    }
  }

  protected void wechsleZuKostuem(double nummer) { waehle(nummer); }

  protected void naechstesKostuem() { waehle(kostuem + 2); }

  protected void aendereGroesse(double d) { setzeGroesse(groesse + d); }

  protected void setzeGroesse(double g) {
    Kostuem k = aktuell();
    double min = 5, max = 500;
    if (k != null) {
      double kurz = Math.min(k.breite(), k.hoehe()), lang = Math.max(k.breite(), k.hoehe());
      min = Math.min(100, 5 / Math.max(0.01, kurz) * 100);
      max = Math.max(100, Math.min(1.5 * 480 / Math.max(0.01, lang), 1.5 * 360 / Math.max(0.01, lang)) * 100);
    }
    groesse = Math.max(min, Math.min(max, g));
    setzePosition(x, y);
  }

  protected void zeigeDich() { sichtbar = true; Welt.neuZeichnen = true; }
  protected void versteckeDich() { sichtbar = false; Welt.neuZeichnen = true; }
  protected void geheZurVorderstenEbene() { Welt.ebene(this, Welt.ebenen.size()); }
  protected void geheZurHinterstenEbene() { Welt.ebene(this, 0); }
  protected void geheEbenenNachVorne(double n) { Welt.ebene(this, Welt.ebenen.indexOf(this) + (int) Math.round(n)); }
  protected void geheEbenenNachHinten(double n) { Welt.ebene(this, Welt.ebenen.indexOf(this) - (int) Math.round(n)); }

  // ------------------------------------------------------------ Fuehlen

  protected boolean beruehrtMaus() {
    return sichtbar && Welt.deckend(this, Welt.mausX, Welt.mausY);
  }

  protected boolean beruehrtRand() {
    if (!sichtbar) return false;
    double[] g = Welt.grenzen(this);
    return g[0] < -240 || g[1] > 240 || g[2] < -180 || g[3] > 180;
  }

  protected boolean beruehrt(String figur) {
    if (!sichtbar) return false;
    Figur o = Welt.original(figur);
    if (o == null) return false;
    for (Figur e : new ArrayList<>(Welt.ebenen)) {
      if (e == this || !e.sichtbar) continue;
      if ((e == o || e.original == o) && Welt.ueberlappen(this, e)) return true;
    }
    return false;
  }

  protected boolean beruehrtFarbe(int farbe) { return sichtbar && Welt.beruehrtFarbe(this, farbe); }

  protected double entfernungZu(String figur) {
    Figur f = Welt.original(figur);
    return f == null ? 10000 : Math.hypot(f.x - x, f.y - y);
  }

  protected double entfernungZuMaus() { return Math.hypot(Welt.mausX - x, Welt.mausY - y); }

  // ------------------------------------------------------------ Klone

  protected void erzeugeKlon() { Welt.erzeugeKlon(this); }

  protected void loescheDiesenKlon() {
    if (!istKlon) return;
    Welt.loescheKlon(this);
    throw new Stopp();
  }

  // ------------------------------------------------------------ Stift

  protected void stiftRunter() { stiftUnten = true; Welt.stiftLinie(this, x, y, x, y); }
  protected void stiftHoch() { stiftUnten = false; }

  protected void setzeStiftfarbe(int rgb) {
    float[] hsb = java.awt.Color.RGBtoHSB((rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF, null);
    stiftH = hsb[0] * 100;
    stiftS = hsb[1] * 100;
    stiftV = hsb[2] * 100;
  }

  protected void aendereStiftFarbton(double d) { stiftH = ((stiftH + d) % 100 + 100) % 100; }
  protected void setzeStiftFarbton(double h) { stiftH = ((h % 100) + 100) % 100; }
  protected void setzeStiftdicke(double d) { stiftDicke = Math.max(1, Math.min(1200, d)); }
  protected void aendereStiftdicke(double d) { setzeStiftdicke(stiftDicke + d); }
  protected void hinterlasseAbdruck() { if (sichtbar) Welt.abdruck(this); }

  java.awt.Color stiftFarbe() {
    return new java.awt.Color(java.awt.Color.HSBtoRGB((float) (stiftH / 100), (float) (stiftS / 100), (float) (stiftV / 100)));
  }

  // ------------------------------------------------------------ Eigenschaften

  @Override protected double xPosition() { return Math.round(x * 100) / 100.0; }
  @Override protected double yPosition() { return Math.round(y * 100) / 100.0; }
  @Override protected double richtung() { return richtung; }
  @Override protected double groesse() { return Math.round(groesse); }
}

/** Umwandeln und Vergleichen von Werten, wie Blockwerk es tut. */
final class Wert {
  private Wert() {}

  static Double zahlOderNull(Object o) {
    if (o instanceof Double) return (Double) o;
    if (o instanceof Number) return ((Number) o).doubleValue();
    if (o == null || o instanceof Boolean) return null;
    String s = o.toString().trim();
    if (!s.matches("[+-]?(\\d+([.,]\\d*)?|[.,]\\d+)([eE][+-]?\\d+)?")) return null;
    try {
      return Double.parseDouble(s.replace(',', '.'));
    } catch (NumberFormatException e) {
      return null;
    }
  }

  static double zahl(String s) { Double d = zahlOderNull(s); return d == null ? 0 : d; }
  static double zahl(boolean b) { return b ? 1 : 0; }
  static double zahl(double d) { return d; }

  static String text(double d) {
    if (Double.isNaN(d)) return "0";
    if (Double.isInfinite(d)) return d > 0 ? "Infinity" : "-Infinity";
    if (d == Math.rint(d) && Math.abs(d) < 1e15) return Long.toString((long) d);
    return Double.toString(d);
  }

  static String text(boolean b) { return b ? "wahr" : "falsch"; }
  static String text(String s) { return s; }

  static boolean wahr(double d) { return d != 0 && !Double.isNaN(d); }
  static boolean wahr(boolean b) { return b; }
  static boolean wahr(String s) {
    String t = s.trim().toLowerCase();
    return !(t.isEmpty() || t.equals("0") || t.equals("falsch") || t.equals("false"));
  }

  static String alsText(Object o) {
    if (o instanceof Double) return text((Double) o);
    if (o instanceof Boolean) return text((Boolean) o);
    return String.valueOf(o);
  }

  /** Zahlen werden als Zahlen verglichen, alles andere als Text ohne Gross und klein. */
  static int vergleiche(Object a, Object b) {
    Double x = zahlOderNull(a), y = zahlOderNull(b);
    if (x != null && y != null) return x.doubleValue() == y.doubleValue() ? 0 : x < y ? -1 : 1;
    return alsText(a).toLowerCase().compareTo(alsText(b).toLowerCase());
  }

  static boolean gleich(Object a, Object b) { return vergleiche(a, b) == 0; }

  /** Ganze Zahlen, wenn beide Grenzen ganz sind, sonst Kommazahlen. */
  static double zufall(double von, double bis) {
    double lo = Math.min(von, bis), hi = Math.max(von, bis);
    if (lo == Math.rint(lo) && hi == Math.rint(hi)) return lo + Math.floor(Welt.zufall.nextDouble() * (hi - lo + 1));
    return lo + Welt.zufall.nextDouble() * (hi - lo);
  }

  static String zeichen(double nummer, String text) {
    int i = (int) Math.round(nummer);
    return i >= 1 && i <= text.length() ? String.valueOf(text.charAt(i - 1)) : "";
  }

  static double laenge(String text) { return text.length(); }
  static boolean enthaelt(String text, String teil) { return text.toLowerCase().contains(teil.toLowerCase()); }
  static double mod(double n, double m) { return n - Math.floor(n / m) * m; }
  static double runde(double d) { return Math.round(d); }
  static int ganz(double d) { return (int) Math.round(d); }
  static double sin(double grad) { return Math.round(Math.sin(Math.toRadians(grad)) * 1e10) / 1e10; }
  static double cos(double grad) { return Math.round(Math.cos(Math.toRadians(grad)) * 1e10) / 1e10; }
  static double tan(double grad) { return Math.round(Math.tan(Math.toRadians(grad)) * 1e10) / 1e10; }
  static double asin(double d) { return Math.toDegrees(Math.asin(d)); }
  static double acos(double d) { return Math.toDegrees(Math.acos(d)); }
  static double atan(double d) { return Math.toDegrees(Math.atan(d)); }

  static double zeit(String was) {
    Calendar c = Calendar.getInstance();
    switch (was) {
      case "monat": return c.get(Calendar.MONTH) + 1;
      case "tag": return c.get(Calendar.DAY_OF_MONTH);
      case "wochentag": return c.get(Calendar.DAY_OF_WEEK);
      case "stunde": return c.get(Calendar.HOUR_OF_DAY);
      case "minute": return c.get(Calendar.MINUTE);
      case "sekunde": return c.get(Calendar.SECOND);
      default: return c.get(Calendar.YEAR);
    }
  }
}

/** Buehne, Takt, Zeichnen, Fenster und Eingaben. */
final class Welt {
  private Welt() {}

  static final int B = 480, H = 360, STIFT = 2;
  static final Random zufall = new Random();

  static Buehne buehne;
  static final List<Figur> ebenen = new ArrayList<>();
  static final List<Figur> originale = new ArrayList<>();
  static final List<Skript> skripte = new ArrayList<>();
  static final Map<String, Supplier<Object>> variablen = new LinkedHashMap<>();
  static final Set<String> monitore = new LinkedHashSet<>();
  static final BufferedImage stift = new BufferedImage(B * STIFT, H * STIFT, BufferedImage.TYPE_INT_ARGB);
  static final Set<String> tasten = java.util.concurrent.ConcurrentHashMap.newKeySet();
  static final java.util.concurrent.ConcurrentLinkedQueue<Runnable> eingaben = new java.util.concurrent.ConcurrentLinkedQueue<>();
  static volatile double mausX, mausY;
  static volatile boolean mausUnten;
  static String antwort = "";
  static volatile String eingabe;
  static Skript frager;
  static double stoppuhrStart;
  static volatile boolean neuZeichnen, fortschritt;
  static volatile Skript aktuell;
  private static long bildNummer, farbBild = -1;
  private static Figur farbOhne;
  private static int[] farbPixel;
  private static volatile BufferedImage fertig;
  private static JComponent flaeche;
  private static JFrame fenster;
  private static final long START = System.nanoTime();

  static double zeit() { return (System.nanoTime() - START) / 1e9; }

  /** Meldet eine Variable fuer die Anzeige auf der Buehne an. */
  static void variable(String name, Supplier<Object> wert) { variablen.put(name, wert); }
  static void zeigeVariable(String name) { monitore.add(name); }

  // ------------------------------------------------------------ Start

  static void starte(String titel, Buehne b, Figur... figuren) {
    buehne = b;
    for (Figur f : figuren) {
      ebenen.add(f);
      originale.add(f);
    }
    buehne.skripte();
    for (Figur f : figuren) f.skripte();

    String kopflos = System.getProperty("blockwerk.kopflos");
    if (kopflos != null || GraphicsEnvironment.isHeadless()) {
      double sekunden = kopflos == null ? 5 : Wert.zahl(kopflos);
      starteProgramm();
      double ende = zeit() + sekunden;
      while (zeit() < ende) {
        long t = System.nanoTime();
        schritt();
        schlafe(33 - (System.nanoTime() - t) / 1_000_000);
      }
      bericht();
      System.exit(0);
      return;
    }

    Klaenge.start();
    try {
      SwingUtilities.invokeAndWait(() -> fensterBauen(titel));
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
    starteProgramm();
    while (true) {
      long t = System.nanoTime();
      schritt();
      zeichneBild();
      flaeche.repaint();
      schlafe(33 - (System.nanoTime() - t) / 1_000_000);
    }
  }

  private static void schlafe(long ms) {
    if (ms <= 0) return;
    try {
      Thread.sleep(ms);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  static void starteProgramm() {
    stoppeAlles();
    stoppuhrStart = zeit();
    starteHuete(Hut.START, null, null, true);
  }

  /** Ein Bild weiter: alle Skripte kommen dran, bis sich etwas Sichtbares aendert. */
  static void schritt() {
    bildNummer++;
    Runnable r;
    while ((r = eingaben.poll()) != null) r.run();
    long beginn = System.nanoTime();
    neuZeichnen = false;
    int runden = 0;
    do {
      fortschritt = false;
      for (Skript s : new ArrayList<>(skripte)) if (!s.beendet) s.schritt();
      skripte.removeIf(s -> s.beendet);
    } while (fortschritt && !skripte.isEmpty() && !neuZeichnen && ++runden < 2000
        && System.nanoTime() - beginn < 25_000_000L);
  }

  static List<Ziel> ziele() {
    List<Ziel> l = new ArrayList<>();
    l.add(buehne);
    for (int i = ebenen.size() - 1; i >= 0; i--) l.add(ebenen.get(i));
    return l;
  }

  static List<Skript> starteHuete(int art, String wert, Ziel nur, boolean neustarten) {
    List<Skript> neu = new ArrayList<>();
    for (Ziel z : nur != null ? Collections.singletonList(nur) : ziele()) {
      for (Hut h : new ArrayList<>(z.huete)) {
        if (h.art != art) continue;
        if (wert != null && !h.wert.equalsIgnoreCase(wert) && !(art == Hut.TASTE && h.wert.equals("beliebig"))) continue;
        Skript alt = null;
        for (Skript s : skripte) if (s.ziel == z && s.hut == h && !s.beendet && !s.abbrechen) alt = s;
        if (alt != null) {
          if (!neustarten) continue;
          alt.abbrechen();
          skripte.remove(alt);
        }
        Skript s = new Skript(z, h);
        skripte.add(s);
        neu.add(s);
      }
    }
    return neu;
  }

  static void stoppeAlles() {
    for (Skript s : new ArrayList<>(skripte)) s.abbrechen();
    skripte.clear();
    ebenen.removeIf(f -> f.istKlon);
    for (Figur f : ebenen) {
      f.blase = null;
      f.effektFarbe = f.effektHelligkeit = f.effektGeist = 0;
    }
    buehne.effektFarbe = buehne.effektHelligkeit = buehne.effektGeist = 0;
    frager = null;
    Klaenge.stoppeAlle();
    neuZeichnen = true;
  }

  static void bildGewechselt() {
    Kostuem k = buehne.aktuell();
    if (k != null) starteHuete(Hut.BUEHNENBILD, k.name, null, true);
  }

  static Figur original(String name) {
    for (Figur f : originale) if (f.name.equals(name)) return f;
    return null;
  }

  static void ebene(Figur f, int ziel) {
    if (!ebenen.remove(f)) return;
    ebenen.add(Math.max(0, Math.min(ebenen.size(), ziel)), f);
    neuZeichnen = true;
  }

  // ------------------------------------------------------------ Klone

  static void erzeugeKlon(Figur quelle) {
    int anzahl = 0;
    for (Figur e : ebenen) if (e.istKlon) anzahl++;
    if (anzahl >= 300) return;
    Figur k;
    try {
      java.lang.reflect.Constructor<? extends Figur> c = quelle.getClass().getDeclaredConstructor();
      c.setAccessible(true);
      k = c.newInstance();
    } catch (Exception e) {
      return;
    }
    k.kostueme = quelle.kostueme;
    k.kostuem = quelle.kostuem;
    k.x = quelle.x; k.y = quelle.y; k.richtung = quelle.richtung; k.groesse = quelle.groesse;
    k.sichtbar = quelle.sichtbar; k.drehtyp = quelle.drehtyp;
    k.effektFarbe = quelle.effektFarbe; k.effektHelligkeit = quelle.effektHelligkeit; k.effektGeist = quelle.effektGeist;
    k.lautstaerke = quelle.lautstaerke; k.instrument = quelle.instrument;
    k.stiftUnten = quelle.stiftUnten; k.stiftH = quelle.stiftH; k.stiftS = quelle.stiftS; k.stiftV = quelle.stiftV;
    k.stiftDicke = quelle.stiftDicke;
    k.istKlon = true;
    k.original = quelle.original != null ? quelle.original : quelle;
    k.huete.clear();
    k.skripte();
    ebenen.add(Math.max(0, ebenen.indexOf(quelle)), k);
    starteHuete(Hut.KLON, null, k, false);
    neuZeichnen = true;
  }

  static void loescheKlon(Figur k) {
    ebenen.remove(k);
    for (Skript s : new ArrayList<>(skripte)) if (s.ziel == k) s.abbrechen();
    neuZeichnen = true;
  }

  // ------------------------------------------------------------ Fragen

  static void frage(Ziel z, String text) {
    Skript ich = aktuell;
    while (frager != null && frager != ich) Ziel.pause();
    frager = ich;
    eingabe = null;
    boolean blase = z instanceof Figur && ((Figur) z).sichtbar;
    if (blase) ((Figur) z).sprich(text, false);
    if (fenster == null) {
      // Ohne Fenster: auf der Konsole fragen
      System.out.println(text);
      try {
        String zeile = new BufferedReader(new InputStreamReader(System.in)).readLine();
        eingabe = zeile == null ? "" : zeile;
      } catch (IOException e) {
        eingabe = "";
      }
    } else {
      SwingUtilities.invokeLater(() -> {
        String a = JOptionPane.showInputDialog(fenster, blase ? "" : text, "Frage", JOptionPane.QUESTION_MESSAGE);
        eingabe = a == null ? "" : a;
        flaeche.requestFocusInWindow();
      });
    }
    while (eingabe == null) Ziel.pause();
    antwort = eingabe;
    frager = null;
    if (blase) {
      ((Figur) z).blase = null;
      neuZeichnen = true;
    }
  }

  // ------------------------------------------------------------ Stift

  static void stiftLoeschen() {
    Graphics2D g = stift.createGraphics();
    g.setComposite(AlphaComposite.Clear);
    g.fillRect(0, 0, stift.getWidth(), stift.getHeight());
    g.dispose();
    neuZeichnen = true;
  }

  static void stiftLinie(Figur f, double x0, double y0, double x1, double y1) {
    Graphics2D g = stift.createGraphics();
    g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
    g.setColor(f.stiftFarbe());
    float d = (float) (f.stiftDicke * STIFT);
    g.setStroke(new BasicStroke(d, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
    double ax = (x0 + 240) * STIFT, ay = (180 - y0) * STIFT, bx = (x1 + 240) * STIFT, by = (180 - y1) * STIFT;
    if (ax == bx && ay == by) g.fill(new Ellipse2D.Double(ax - d / 2, ay - d / 2, d, d));
    else g.draw(new Line2D.Double(ax, ay, bx, by));
    g.dispose();
    neuZeichnen = true;
  }

  static void abdruck(Figur f) {
    Graphics2D g = stift.createGraphics();
    zeichneFigur(g, f, STIFT);
    g.dispose();
    neuZeichnen = true;
  }

  // ------------------------------------------------------------ Geometrie

  /** Umriss einer Figur: {links, rechts, unten, oben}. */
  static double[] grenzen(Figur f) {
    Kostuem k = f.aktuell();
    if (k == null) return new double[]{f.x, f.x, f.y, f.y};
    double s = f.groesse / 100.0, res = k.aufloesung;
    double l = -k.mx / res, re = (k.bild.getWidth() - k.mx) / res;
    double o = k.my / res, u = -(k.bild.getHeight() - k.my) / res;
    if (f.drehtyp.equals("links-rechts") && f.richtung < 0) { double t = l; l = -re; re = -t; }
    double w = f.drehtyp.equals("rundherum") ? Math.toRadians(f.richtung - 90) : 0;
    double co = Math.cos(w), si = Math.sin(w);
    double minX = Double.MAX_VALUE, maxX = -Double.MAX_VALUE, minY = Double.MAX_VALUE, maxY = -Double.MAX_VALUE;
    double[][] ecken = {{l, o}, {re, o}, {l, u}, {re, u}};
    for (double[] e : ecken) {
      double x = (e[0] * co + e[1] * si) * s, y = (-e[0] * si + e[1] * co) * s;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return new double[]{f.x + minX, f.x + maxX, f.y + minY, f.y + maxY};
  }

  static boolean deckend(Figur f, double px, double py) {
    Kostuem k = f.aktuell();
    if (k == null || f.groesse <= 0) return false;
    double s = f.groesse / 100.0;
    double dx = (px - f.x) / s, dy = (py - f.y) / s, lx = dx, ly = dy;
    if (f.drehtyp.equals("rundherum")) {
      double a = Math.toRadians(f.richtung - 90), co = Math.cos(a), si = Math.sin(a);
      lx = dx * co - dy * si;
      ly = dx * si + dy * co;
    } else if (f.drehtyp.equals("links-rechts") && f.richtung < 0) {
      lx = -lx;
    }
    return k.deckend((int) Math.floor(k.mx + lx * k.aufloesung), (int) Math.floor(k.my - ly * k.aufloesung));
  }

  static boolean ueberlappen(Figur a, Figur b) {
    double[] ga = grenzen(a), gb = grenzen(b);
    double l = Math.max(ga[0], gb[0]), r = Math.min(ga[1], gb[1]);
    double u = Math.max(ga[2], gb[2]), o = Math.min(ga[3], gb[3]);
    if (l >= r || u >= o) return false;
    double schritt = Math.max(1, Math.sqrt((r - l) * (o - u) / 4000));
    for (double y = u + schritt / 2; y < o; y += schritt)
      for (double x = l + schritt / 2; x < r; x += schritt)
        if (deckend(a, x, y) && deckend(b, x, y)) return true;
    return false;
  }

  static boolean beruehrtFarbe(Figur f, int farbe) {
    if (farbBild != bildNummer || farbOhne != f || farbPixel == null) {
      BufferedImage b = new BufferedImage(B, H, BufferedImage.TYPE_INT_ARGB);
      Graphics2D g = b.createGraphics();
      zeichne(g, 1, f, false);
      g.dispose();
      farbPixel = b.getRGB(0, 0, B, H, null, 0, B);
      farbBild = bildNummer;
      farbOhne = f;
    }
    double[] gr = grenzen(f);
    int x0 = (int) Math.max(-240, Math.floor(gr[0])), x1 = (int) Math.min(239, Math.ceil(gr[1]));
    int y0 = (int) Math.max(-179, Math.floor(gr[2])), y1 = (int) Math.min(180, Math.ceil(gr[3]));
    int fr = (farbe >> 16) & 0xFF, fg = (farbe >> 8) & 0xFF, fb = farbe & 0xFF;
    for (int y = y0; y <= y1; y++) {
      for (int x = x0; x <= x1; x++) {
        if (!deckend(f, x + 0.5, y - 0.5)) continue;
        int c = farbPixel[(180 - y) * B + (x + 240)];
        if (Math.abs(((c >> 16) & 0xFF) - fr) <= 12 && Math.abs(((c >> 8) & 0xFF) - fg) <= 12
            && Math.abs((c & 0xFF) - fb) <= 12) return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------ Zeichnen

  static void zeichne(Graphics2D g, double m, Figur ohne, boolean extras) {
    g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
    g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
    g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
    g.setColor(java.awt.Color.WHITE);
    g.fill(new Rectangle2D.Double(0, 0, B * m, H * m));
    Kostuem bild = buehne.aktuell();
    if (bild != null) {
      AffineTransform t = new AffineTransform();
      t.scale(m / bild.aufloesung, m / bild.aufloesung);
      t.translate(B / 2.0 * bild.aufloesung - bild.mx, H / 2.0 * bild.aufloesung - bild.my);
      g.drawImage(bild.mitEffekt(buehne.effektFarbe, buehne.effektHelligkeit), t, null);
    }
    AffineTransform st = new AffineTransform();
    st.scale(m / STIFT, m / STIFT);
    g.drawImage(stift, st, null);
    for (Figur f : new ArrayList<>(ebenen)) if (f != ohne && f.sichtbar) zeichneFigur(g, f, m);
    if (!extras) return;
    for (Figur f : new ArrayList<>(ebenen)) if (f.sichtbar && f.blase != null) zeichneBlase(g, f, m);
    zeichneMonitore(g, m);
  }

  static void zeichneFigur(Graphics2D g, Figur f, double m) {
    Kostuem k = f.aktuell();
    if (k == null) return;
    double s = f.groesse / 100.0;
    AffineTransform t = new AffineTransform();
    t.translate((f.x + B / 2.0) * m, (H / 2.0 - f.y) * m);
    double sx = s * m / k.aufloesung, sy = sx;
    if (f.drehtyp.equals("rundherum")) t.rotate(Math.toRadians(f.richtung - 90));
    else if (f.drehtyp.equals("links-rechts") && f.richtung < 0) sx = -sx;
    t.scale(sx, sy);
    t.translate(-k.mx, -k.my);
    java.awt.Composite alt = g.getComposite();
    float alpha = (float) (1 - Math.max(0, Math.min(100, f.effektGeist)) / 100);
    if (alpha < 1) g.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, alpha));
    g.drawImage(k.mitEffekt(f.effektFarbe, f.effektHelligkeit), t, null);
    g.setComposite(alt);
  }

  private static void zeichneBlase(Graphics2D g, Figur f, double m) {
    Graphics2D h = (Graphics2D) g.create();
    h.scale(m, m);
    h.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 12));
    FontMetrics fm = h.getFontMetrics();
    String text = f.blase.length() > 330 ? f.blase.substring(0, 330) + "..." : f.blase;
    List<String> zeilen = new ArrayList<>();
    StringBuilder z = new StringBuilder();
    for (String wort : text.split(" ")) {
      String probe = z.length() == 0 ? wort : z + " " + wort;
      if (fm.stringWidth(probe) > 150 && z.length() > 0) {
        zeilen.add(z.toString());
        z.setLength(0);
        z.append(wort);
      } else {
        z.setLength(0);
        z.append(probe);
      }
    }
    zeilen.add(z.toString());
    int breit = 0;
    for (String zeile : zeilen) breit = Math.max(breit, fm.stringWidth(zeile));
    double pad = 8, zh = 15, bw = Math.max(36, breit + 2 * pad), bh = zeilen.size() * zh + 2 * pad - 3;
    double[] gr = grenzen(f);
    double sx = gr[1] + 240 - 4, sy = 180 - gr[3] + 2, bx = sx, by = sy - bh - 12;
    boolean rechts = true;
    if (bx + bw > B) { rechts = false; sx = gr[0] + 240 + 4; bx = sx - bw; }
    bx = Math.max(2, Math.min(B - bw - 2, bx));
    by = Math.max(2, Math.min(H - bh - 2, by));
    sy = Math.max(by + bh + 4, Math.min(H - 2, sy));
    java.awt.geom.Area form = new java.awt.geom.Area(new RoundRectangle2D.Double(bx, by, bw, bh, f.denkt ? 16 : 10, f.denkt ? 16 : 10));
    if (!f.denkt) {
      double ax = rechts ? bx + 12 : bx + bw - 28;
      Path2D spitze = new Path2D.Double();
      spitze.moveTo(ax, by + bh - 1);
      spitze.lineTo(sx, sy);
      spitze.lineTo(ax + 16, by + bh - 1);
      spitze.closePath();
      form.add(new java.awt.geom.Area(spitze));
    }
    h.setColor(java.awt.Color.WHITE);
    h.fill(form);
    h.setColor(new java.awt.Color(0x9CA3AF));
    h.setStroke(new BasicStroke(1.4f));
    h.draw(form);
    if (f.denkt) {
      double ax = rechts ? bx + 14 : bx + bw - 14;
      for (int i = 1; i <= 2; i++) {
        double t = i / 3.0, r = 4.5 - i * 1.4;
        Ellipse2D e = new Ellipse2D.Double(ax + (sx - ax) * t - r, by + bh + (sy - by - bh) * t + 2 - r, 2 * r, 2 * r);
        h.setColor(java.awt.Color.WHITE);
        h.fill(e);
        h.setColor(new java.awt.Color(0x9CA3AF));
        h.draw(e);
      }
    }
    h.setColor(new java.awt.Color(0x111827));
    double y = by + pad + 11;
    for (String zeile : zeilen) {
      h.drawString(zeile, (float) (bx + pad), (float) y);
      y += zh;
    }
    h.dispose();
  }

  private static void zeichneMonitore(Graphics2D g, double m) {
    Graphics2D h = (Graphics2D) g.create();
    h.scale(m, m);
    h.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 11));
    FontMetrics fm = h.getFontMetrics();
    double y = 5;
    for (String name : new ArrayList<>(monitore)) {
      Supplier<Object> q = variablen.get(name);
      if (q == null) continue;
      String wert = Wert.alsText(q.get());
      if (wert.length() > 40) wert = wert.substring(0, 40) + "...";
      double nw = fm.stringWidth(name), ww = Math.max(26, fm.stringWidth(wert) + 12);
      double bw = nw + ww + 16;
      h.setColor(new java.awt.Color(0xF3F4F6));
      h.fill(new RoundRectangle2D.Double(5, y, bw, 22, 6, 6));
      h.setColor(new java.awt.Color(0xD1D5DB));
      h.draw(new RoundRectangle2D.Double(5, y, bw, 22, 6, 6));
      h.setColor(new java.awt.Color(0x374151));
      h.drawString(name, 11f, (float) (y + 15));
      h.setColor(new java.awt.Color(0xC0653A));
      h.fill(new RoundRectangle2D.Double(16 + nw, y + 3, ww, 16, 6, 6));
      h.setColor(java.awt.Color.WHITE);
      h.drawString(wert, (float) (16 + nw + (ww - fm.stringWidth(wert)) / 2), (float) (y + 15));
      y += 26;
      if (y > H - 20) break;
    }
    h.dispose();
  }

  // ------------------------------------------------------------ Fenster

  private static void zeichneBild() {
    int w = Math.max(1, flaeche.getWidth()), h = Math.max(1, flaeche.getHeight());
    double m = Math.min(w / (double) B, h / (double) H);
    int bw = Math.max(1, (int) Math.round(B * m)), bh = Math.max(1, (int) Math.round(H * m));
    BufferedImage b = new BufferedImage(bw, bh, BufferedImage.TYPE_INT_RGB);
    Graphics2D g = b.createGraphics();
    zeichne(g, m, null, true);
    g.dispose();
    fertig = b;
  }

  private static double buehneX(MouseEvent e) {
    double m = Math.min(flaeche.getWidth() / (double) B, flaeche.getHeight() / (double) H);
    double ox = (flaeche.getWidth() - B * m) / 2;
    return Math.max(-240, Math.min(240, (e.getX() - ox) / m - 240));
  }

  private static double buehneY(MouseEvent e) {
    double m = Math.min(flaeche.getWidth() / (double) B, flaeche.getHeight() / (double) H);
    double oy = (flaeche.getHeight() - H * m) / 2;
    return Math.max(-180, Math.min(180, 180 - (e.getY() - oy) / m));
  }

  private static void fensterBauen(String titel) {
    fenster = new JFrame(titel);
    fenster.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
    flaeche = new JComponent() {
      @Override protected void paintComponent(Graphics g) {
        g.setColor(new java.awt.Color(0x1F2329));
        g.fillRect(0, 0, getWidth(), getHeight());
        BufferedImage b = fertig;
        if (b != null) g.drawImage(b, (getWidth() - b.getWidth()) / 2, (getHeight() - b.getHeight()) / 2, null);
      }
    };
    flaeche.setPreferredSize(new Dimension(B * 3 / 2, H * 3 / 2));
    flaeche.setFocusable(true);
    flaeche.addMouseMotionListener(new MouseMotionAdapter() {
      @Override public void mouseMoved(MouseEvent e) { mausX = buehneX(e); mausY = buehneY(e); }
      @Override public void mouseDragged(MouseEvent e) { mausX = buehneX(e); mausY = buehneY(e); }
    });
    flaeche.addMouseListener(new MouseAdapter() {
      @Override public void mousePressed(MouseEvent e) {
        flaeche.requestFocusInWindow();
        double x = buehneX(e), y = buehneY(e);
        mausX = x;
        mausY = y;
        mausUnten = true;
        eingaben.add(() -> {
          for (int i = ebenen.size() - 1; i >= 0; i--) {
            Figur f = ebenen.get(i);
            if (f.sichtbar && deckend(f, x, y)) {
              starteHuete(Hut.KLICK, null, f, true);
              return;
            }
          }
          starteHuete(Hut.KLICK, null, buehne, true);
        });
      }

      @Override public void mouseReleased(MouseEvent e) { mausUnten = false; }
    });
    flaeche.addKeyListener(new KeyAdapter() {
      @Override public void keyPressed(KeyEvent e) {
        String t = taste(e);
        if (t == null) return;
        tasten.add(t);
        eingaben.add(() -> starteHuete(Hut.TASTE, t, null, false));
      }

      @Override public void keyReleased(KeyEvent e) {
        String t = taste(e);
        if (t != null) tasten.remove(t);
      }
    });
    JButton start = new JButton("▶  Start");
    start.setForeground(new java.awt.Color(0x15803D));
    start.addActionListener(e -> { eingaben.add(Welt::starteProgramm); flaeche.requestFocusInWindow(); });
    JButton stopp = new JButton("■  Stopp");
    stopp.setForeground(new java.awt.Color(0xB91C1C));
    stopp.addActionListener(e -> { eingaben.add(Welt::stoppeAlles); flaeche.requestFocusInWindow(); });
    JPanel leiste = new JPanel(new FlowLayout(FlowLayout.LEFT));
    leiste.add(start);
    leiste.add(stopp);
    fenster.getContentPane().add(leiste, BorderLayout.NORTH);
    fenster.getContentPane().add(flaeche, BorderLayout.CENTER);
    fenster.pack();
    fenster.setLocationRelativeTo(null);
    fenster.setVisible(true);
    flaeche.requestFocusInWindow();
  }

  private static String taste(KeyEvent e) {
    int c = e.getKeyCode();
    if (c >= KeyEvent.VK_A && c <= KeyEvent.VK_Z) return String.valueOf((char) ('a' + c - KeyEvent.VK_A));
    if (c >= KeyEvent.VK_0 && c <= KeyEvent.VK_9) return String.valueOf((char) ('0' + c - KeyEvent.VK_0));
    switch (c) {
      case KeyEvent.VK_SPACE: return "leertaste";
      case KeyEvent.VK_UP: return "oben";
      case KeyEvent.VK_DOWN: return "unten";
      case KeyEvent.VK_LEFT: return "links";
      case KeyEvent.VK_RIGHT: return "rechts";
      default: return null;
    }
  }

  /** Ohne Fenster: Stand nach dem Lauf ausgeben (und auf Wunsch ein Bild speichern). */
  private static void bericht() {
    System.out.println("== Stand nach dem Lauf");
    for (Map.Entry<String, Supplier<Object>> e : variablen.entrySet())
      System.out.println("Variable " + e.getKey() + " = " + Wert.alsText(e.getValue().get()));
    int klone = 0;
    for (Figur f : ebenen) {
      if (f.istKlon) { klone++; continue; }
      System.out.printf(Locale.ROOT, "Figur %s x=%.1f y=%.1f richtung=%.1f kostuem=%d sichtbar=%b%n",
          f.name, f.x, f.y, f.richtung, f.kostuem + 1, f.sichtbar);
    }
    System.out.println("Klone " + klone);
    String datei = System.getProperty("blockwerk.bild");
    if (datei != null) {
      BufferedImage b = new BufferedImage(B * 2, H * 2, BufferedImage.TYPE_INT_RGB);
      Graphics2D g = b.createGraphics();
      zeichne(g, 2, null, true);
      g.dispose();
      try {
        ImageIO.write(b, "png", new File(datei));
      } catch (IOException e) {
        System.err.println(e);
      }
    }
  }
}

/** Klaenge und Noten, synthetisch erzeugt und gemischt abgespielt. */
final class Klaenge implements Runnable {
  static final int RATE = 22050;
  private static final List<float[]> STIMMEN_DATEN = new ArrayList<>();
  private static final List<int[]> STIMMEN_POS = new ArrayList<>();
  private static final List<Float> STIMMEN_VOL = new ArrayList<>();
  private static final Map<String, float[]> VORRAT = new HashMap<>();
  private static boolean an;

  private Klaenge() {}

  static void start() {
    if (an) return;
    an = true;
    Thread t = new Thread(new Klaenge(), "Klaenge");
    t.setDaemon(true);
    t.start();
  }

  static void stoppeAlle() {
    synchronized (STIMMEN_DATEN) {
      STIMMEN_DATEN.clear();
      STIMMEN_POS.clear();
      STIMMEN_VOL.clear();
    }
  }

  private static void abspielen(float[] d, double lautstaerke) {
    float v = (float) Math.max(0, Math.min(1, lautstaerke / 100));
    if (v <= 0 || !an) return;
    synchronized (STIMMEN_DATEN) {
      if (STIMMEN_DATEN.size() > 24) {
        STIMMEN_DATEN.remove(0);
        STIMMEN_POS.remove(0);
        STIMMEN_VOL.remove(0);
      }
      STIMMEN_DATEN.add(d);
      STIMMEN_POS.add(new int[1]);
      STIMMEN_VOL.add(v);
    }
  }

  static double spiele(String id, double lautstaerke) {
    float[] d;
    synchronized (VORRAT) {
      d = VORRAT.get("k|" + id);
      if (d == null) {
        d = klang(id);
        if (d == null) return 0;
        VORRAT.put("k|" + id, d);
      }
    }
    abspielen(d, lautstaerke);
    return d.length / (double) RATE;
  }

  static void note(String instrument, double note, double sek, double lautstaerke) {
    sek = Math.max(0.02, Math.min(8, sek));
    note = Math.max(0, Math.min(130, note));
    abspielen(erzeugeNote(instrument, 440 * Math.pow(2, (note - 69) / 12.0), sek), lautstaerke);
  }

  @Override public void run() {
    SourceDataLine linie;
    try {
      AudioFormat f = new AudioFormat(RATE, 16, 1, true, false);
      linie = AudioSystem.getSourceDataLine(f);
      linie.open(f, 4096);
      linie.start();
    } catch (Exception e) {
      an = false;
      return;
    }
    byte[] aus = new byte[1024];
    float[] mix = new float[512];
    while (true) {
      boolean aktiv;
      synchronized (STIMMEN_DATEN) {
        aktiv = !STIMMEN_DATEN.isEmpty();
        if (aktiv) {
          Arrays.fill(mix, 0);
          for (int i = STIMMEN_DATEN.size() - 1; i >= 0; i--) {
            float[] d = STIMMEN_DATEN.get(i);
            int[] pos = STIMMEN_POS.get(i);
            float v = STIMMEN_VOL.get(i);
            int n = Math.min(mix.length, d.length - pos[0]);
            for (int j = 0; j < n; j++) mix[j] += d[pos[0] + j] * v;
            pos[0] += n;
            if (pos[0] >= d.length) {
              STIMMEN_DATEN.remove(i);
              STIMMEN_POS.remove(i);
              STIMMEN_VOL.remove(i);
            }
          }
        }
      }
      if (!aktiv) {
        try { Thread.sleep(8); } catch (InterruptedException e) { return; }
        continue;
      }
      for (int i = 0; i < mix.length; i++) {
        float m = Math.max(-1, Math.min(1, mix[i] * 0.8f));
        short s = (short) (m * 32000);
        aus[2 * i] = (byte) s;
        aus[2 * i + 1] = (byte) (s >> 8);
      }
      linie.write(aus, 0, aus.length);
    }
  }

  private static double huelle(double t, double dauer, double an, double ab) {
    if (t < an) return t / an;
    if (t > dauer - ab) return Math.max(0, (dauer - t) / ab);
    return 1;
  }

  private static float[] klang(String id) {
    Random z = new Random(3);
    float[] d;
    double ph = 0;
    switch (id) {
      case "plopp":
        d = new float[(int) (0.16 * RATE)];
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          ph += 2 * Math.PI * (250 + 650 * Math.exp(-t * 40)) / RATE;
          d[i] = (float) (Math.sin(ph) * Math.exp(-t * 22) * Math.min(1, t * 800));
        }
        return d;
      case "piep":
        d = new float[(int) (0.18 * RATE)];
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          ph += 2 * Math.PI * 1046 / RATE;
          d[i] = (float) ((Math.sin(ph) + 0.25 * Math.sin(3 * ph)) * 0.6 * huelle(t, 0.18, 0.004, 0.04));
        }
        return d;
      case "sprung":
        d = new float[(int) (0.28 * RATE)];
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          ph += 2 * Math.PI * (280 + 900 * t / 0.28) / RATE;
          d[i] = (float) (Math.signum(Math.sin(ph)) * 0.3 * huelle(t, 0.28, 0.005, 0.08));
        }
        return d;
      case "muenze":
        d = new float[(int) (0.42 * RATE)];
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          ph += 2 * Math.PI * (t < 0.08 ? 988 : 1319) / RATE;
          double e = t < 0.08 ? 1 : Math.exp(-(t - 0.08) * 9);
          d[i] = (float) ((Math.sin(ph) > 0 ? 0.28 : -0.28) * e * Math.min(1, t * 1000));
        }
        return d;
      case "trommel":
        d = new float[(int) (0.4 * RATE)];
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          ph += 2 * Math.PI * (52 + 110 * Math.exp(-t * 25)) / RATE;
          d[i] = (float) (Math.sin(ph) * Math.exp(-t * 9) + (z.nextFloat() * 2 - 1) * 0.35 * Math.exp(-t * 45));
        }
        return d;
      case "becken": {
        d = new float[RATE];
        float alt = 0;
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          float n = z.nextFloat() * 2 - 1;
          d[i] = (float) ((n - alt) * 0.45 * Math.exp(-t * 4) * Math.min(1, t * 2000));
          alt = n;
        }
        return d;
      }
      case "klatschen":
        d = new float[(int) (0.25 * RATE)];
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE, e = 0;
          for (double s : new double[]{0, 0.011, 0.022}) if (t >= s) e += Math.exp(-(t - s) * 70);
          e += 0.25 * Math.exp(-t * 14);
          d[i] = (float) ((z.nextFloat() * 2 - 1) * 0.45 * Math.min(1.2, e));
        }
        return d;
      case "glocke":
        d = new float[(int) (1.6 * RATE)];
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE, w = 2 * Math.PI * 784 * t;
          d[i] = (float) ((Math.sin(w) * Math.exp(-t * 2.2) + 0.5 * Math.sin(w * 2.76) * Math.exp(-t * 3.5)
              + 0.25 * Math.sin(w * 5.4) * Math.exp(-t * 6)) * 0.55 * Math.min(1, t * 1500));
        }
        return d;
      case "laser":
        d = new float[(int) (0.35 * RATE)];
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          ph += 2 * Math.PI * (200 + 1700 * Math.exp(-t * 9)) / RATE;
          d[i] = (float) (Math.signum(Math.sin(ph)) * 0.28 * huelle(t, 0.35, 0.003, 0.1));
        }
        return d;
      case "tropfen":
        d = new float[(int) (0.2 * RATE)];
        for (int i = 0; i < d.length; i++) {
          double t = i / (double) RATE;
          ph += 2 * Math.PI * (500 + 1300 * (1 - Math.exp(-t * 30))) / RATE;
          d[i] = (float) (Math.sin(ph) * Math.exp(-t * 20) * Math.min(1, t * 1500));
        }
        return d;
      default:
        return null;
    }
  }

  private static float[] erzeugeNote(String instrument, double f, double sek) {
    float[] d = new float[(int) (sek * RATE)];
    double aus = Math.min(0.04, sek / 4);
    if (instrument.equals("gitarre")) {
      int n = Math.max(2, (int) Math.round(RATE / f));
      float[] ring = new float[n];
      Random z = new Random(11);
      for (int i = 0; i < n; i++) ring[i] = z.nextFloat() * 2 - 1;
      int p = 0;
      for (int i = 0; i < d.length; i++) {
        float v = ring[p];
        int q = (p + 1) % n;
        ring[p] = 0.497f * (v + ring[q]);
        p = q;
        double t = i / (double) RATE;
        d[i] = (float) (v * 0.7 * (t > sek - aus ? (sek - t) / aus : 1));
      }
      return d;
    }
    double ph = 0;
    for (int i = 0; i < d.length; i++) {
      double t = i / (double) RATE, rel = t > sek - aus ? Math.max(0, (sek - t) / aus) : 1, s;
      switch (instrument) {
        case "orgel":
          ph += 2 * Math.PI * f / RATE;
          s = (Math.sin(ph) + 0.6 * Math.sin(2 * ph) + 0.35 * Math.sin(3 * ph) + 0.2 * Math.sin(4 * ph)) * 0.38 * Math.min(1, t * 80);
          break;
        case "floete":
          ph += 2 * Math.PI * f * (1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t)) / RATE;
          s = (Math.sin(ph) + 0.12 * Math.sin(2 * ph)) * 0.7 * Math.min(1, t * 18);
          break;
        case "bass": {
          ph += 2 * Math.PI * f / RATE;
          double x = (ph / (2 * Math.PI)) % 1.0;
          s = (4 * Math.abs(x - 0.5) - 1) * 0.9 * Math.exp(-t * 1.8) * Math.min(1, t * 400);
          break;
        }
        case "synth":
          ph += 2 * Math.PI * f / RATE;
          s = (Math.sin(ph) > 0 ? 0.3 : -0.3) * Math.exp(-t * 1.2) * Math.min(1, t * 400);
          break;
        case "glocken": {
          double w = 2 * Math.PI * f * t;
          s = (Math.sin(w) * Math.exp(-t * 3) + 0.4 * Math.sin(w * 3.98) * Math.exp(-t * 7)) * 0.6 * Math.min(1, t * 1500);
          break;
        }
        default:
          ph += 2 * Math.PI * f / RATE;
          s = (Math.sin(ph) + 0.45 * Math.sin(2 * ph) + 0.2 * Math.sin(3 * ph) + 0.1 * Math.sin(4 * ph)) * 0.5
              * Math.exp(-t * 2.6) * Math.min(1, t * 600);
          break;
      }
      d[i] = (float) (s * rel);
    }
    return d;
  }
}
