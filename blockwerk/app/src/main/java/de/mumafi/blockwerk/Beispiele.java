package de.mumafi.blockwerk;

/** Fertige kleine Projekte zum Ausprobieren und Abschauen. */
final class Beispiele {
  private Beispiele() {}

  static final String[] NAMEN = {
      "Quadrat zeichnen", "Spirale", "Zahlenraten", "Fangspiel", "Pong", "Partikel (Klone)", "Melodie"
  };

  static Projekt erzeuge(int i) {
    switch (i) {
      case 1: return spirale();
      case 2: return zahlenraten();
      case 3: return fangspiel();
      case 4: return pong();
      case 5: return partikel();
      case 6: return melodie();
      default: return quadrat();
    }
  }

  // ------------------------------------------------------------- Bausteine

  /** Block mit Feldwerten; ein Block als Wert wird in das Feld gesteckt. */
  private static Block b(String op, Object... w) {
    Block x = new Block(op);
    for (int i = 0; i < w.length && i < x.werte.length; i++) {
      if (w[i] instanceof Block) x.args[i] = (Block) w[i];
      else x.werte[i] = String.valueOf(w[i]);
    }
    return x;
  }

  private static Block kette(Block... bs) {
    for (int i = 0; i + 1 < bs.length; i++) bs[i].next = bs[i + 1];
    return bs.length == 0 ? null : bs[0];
  }

  /** Schleife oder „falls“ mit Inhalt */
  private static Block mund(Block c, Block... innen) {
    c.sub[0] = kette(innen);
    return c;
  }

  /** falls … sonst mit zwei Innenstapeln */
  private static Block sonst(Block c, Block[] dann, Block[] sonst) {
    c.sub[0] = kette(dann);
    c.sub[1] = kette(sonst);
    return c;
  }

  private static Block v(String name) { return b("var.wert", name); }

  private static Block zufall(Object von, Object bis) { return b("op.zufall", von, bis); }

  private static Figur figur(String name, String... kostueme) {
    Figur f = new Figur(name, false);
    for (String k : kostueme) f.kostueme.add(Bibliothek.kostuem(k));
    return f;
  }

  private static Projekt projekt(String name, String bild) {
    Projekt p = new Projekt();
    p.name = name;
    p.buehne = new Figur("Bühne", true);
    p.buehne.kostueme.add(Bibliothek.kostuem(bild));
    p.nachrichten.add("Nachricht1");
    return p;
  }

  /** Stapelt die Skripte einer Figur untereinander. */
  private static void ordne(Figur f) {
    BlockMaler m = new BlockMaler();
    float y = 20;
    for (Block s : f.skripte) {
      s.x = 20;
      s.y = y;
      y += m.messeStapel(s) + 30;
    }
  }

  private static void skripte(Figur f, Block... s) {
    for (Block b : s) f.skripte.add(b);
    ordne(f);
  }

  // ------------------------------------------------------------- Beispiele

  private static Projekt quadrat() {
    Projekt p = projekt("Quadrat zeichnen", "gitter");
    Figur z = figur("Zeiger", "zeiger");
    z.groesse = 50;
    skripte(z,
        kette(b("ereignis.flagge"),
            b("stift.loesche"),
            b("stift.hoch"),
            b("bewegung.gehezuxy", -50, -50),
            b("bewegung.richtung", 90),
            b("stift.dicke", 3),
            b("stift.farbe", "#2563EB"),
            b("stift.runter"),
            mund(b("steuerung.wiederhole", 4),
                b("bewegung.gehe", 100),
                b("bewegung.links", 90),
                b("steuerung.warte", 0.3)),
            b("stift.hoch"),
            b("fuehlen.konsole", "Fertig: ein Quadrat mit Seitenlänge 100")));
    p.neueFigur(z);
    return p;
  }

  private static Projekt spirale() {
    Projekt p = projekt("Spirale", "weiss");
    p.variablen.put("Länge", 0.0);
    Figur z = figur("Zeiger", "zeiger");
    z.groesse = 50;
    skripte(z,
        kette(b("ereignis.flagge"),
            b("stift.loesche"),
            b("stift.hoch"),
            b("bewegung.gehezuxy", 0, 0),
            b("bewegung.richtung", 90),
            b("stift.dicke", 3),
            b("stift.setzeFarbton", 0),
            b("var.setze", "Länge", 2),
            b("stift.runter"),
            mund(b("steuerung.wiederhole", 120),
                b("bewegung.gehe", v("Länge")),
                b("bewegung.rechts", 91),
                b("var.aendere", "Länge", 2),
                b("stift.aendereFarbton", 1)),
            b("stift.hoch"),
            b("fuehlen.konsole", b("op.verbinde", "Letzte Länge: ", v("Länge")))));
    p.neueFigur(z);
    return p;
  }

  private static Projekt zahlenraten() {
    Projekt p = projekt("Zahlenraten", "weiss");
    p.variablen.put("geheim", 0.0);
    p.variablen.put("Versuche", 0.0);
    p.monitore.add("Versuche");
    Figur f = figur("Person", "person1", "person2");
    f.x = -150;
    f.y = -60;
    skripte(f,
        kette(b("ereignis.flagge"),
            b("var.setze", "geheim", zufall(1, 100)),
            b("var.setze", "Versuche", 1),
            b("fuehlen.frage", "Ich denke mir eine Zahl von 1 bis 100. Welche?"),
            mund(b("steuerung.wiederholeBis", b("op.gleich", b("fuehlen.antwort"), v("geheim"))),
                b("var.aendere", "Versuche", 1),
                sonst(b("steuerung.fallsSonst", b("op.kleiner", b("fuehlen.antwort"), v("geheim"))),
                    new Block[]{b("fuehlen.frage", "Zu klein. Noch ein Versuch?")},
                    new Block[]{b("fuehlen.frage", "Zu groß. Noch ein Versuch?")})),
            b("aussehen.sage", b("op.verbinde", "Richtig! Versuche: ", v("Versuche"))),
            b("fuehlen.konsole", b("op.verbinde", "Geraten in Versuchen: ", v("Versuche")))));
    p.neueFigur(f);
    return p;
  }

  private static Projekt fangspiel() {
    Projekt p = projekt("Fangspiel", "dunkel");
    p.variablen.put("Punkte", 0.0);
    p.monitore.add("Punkte");
    Figur s = figur("Schläger", "schlaeger");
    s.y = -150;
    skripte(s,
        kette(b("ereignis.flagge"),
            b("var.setze", "Punkte", 0),
            b("bewegung.gehezuxy", 0, -150),
            mund(b("steuerung.fortlaufend"),
                mund(b("steuerung.falls", b("fuehlen.taste", "rechts")),
                    b("bewegung.aendereX", 9)),
                mund(b("steuerung.falls", b("fuehlen.taste", "links")),
                    b("bewegung.aendereX", -9)),
                b("bewegung.aendereX", b("op.durch", b("fuehlen.neigung", "lr"), 3)))));
    p.neueFigur(s);

    Figur st = figur("Stern", "stern");
    st.groesse = 70;
    st.y = 170;
    skripte(st,
        kette(b("ereignis.flagge"),
            b("bewegung.gehezuxy", zufall(-220, 220), 180),
            mund(b("steuerung.fortlaufend"),
                b("bewegung.aendereY", -5),
                mund(b("steuerung.falls", b("fuehlen.beruehrt", "Schläger")),
                    b("var.aendere", "Punkte", 1),
                    b("klang.spiele", "muenze"),
                    b("bewegung.gehezuxy", zufall(-220, 220), 180)),
                mund(b("steuerung.falls", b("op.kleiner", b("bewegung.y"), -170)),
                    b("fuehlen.konsole", b("op.verbinde", "Verpasst bei Punkten: ", v("Punkte"))),
                    b("bewegung.gehezuxy", zufall(-220, 220), 180)))));
    p.neueFigur(st);
    return p;
  }

  private static Projekt pong() {
    Projekt p = projekt("Pong", "dunkel");
    p.variablen.put("Treffer", 0.0);
    p.monitore.add("Treffer");
    Figur s = figur("Schläger", "schlaeger");
    s.y = -150;
    skripte(s,
        kette(b("ereignis.flagge"),
            b("bewegung.gehezuxy", 0, -150),
            mund(b("steuerung.fortlaufend"),
                b("bewegung.setzeX", b("fuehlen.fingerX")))));
    p.neueFigur(s);

    Figur ball = figur("Ball", "ball");
    ball.groesse = 60;
    ball.y = 100;
    skripte(ball,
        kette(b("ereignis.flagge"),
            b("var.setze", "Treffer", 0),
            b("bewegung.gehezuxy", 0, 100),
            b("bewegung.richtung", zufall(150, 210)),
            mund(b("steuerung.fortlaufend"),
                b("bewegung.gehe", 7),
                b("bewegung.abprallen"),
                mund(b("steuerung.falls", b("fuehlen.beruehrt", "Schläger")),
                    b("klang.spiele", "plopp"),
                    b("var.aendere", "Treffer", 1),
                    b("bewegung.richtung", b("op.minus", 180, b("bewegung.r"))),
                    b("bewegung.gehe", 10)),
                mund(b("steuerung.falls", b("op.kleiner", b("bewegung.y"), -165)),
                    b("klang.spiele", "laser"),
                    b("fuehlen.konsole", b("op.verbinde", "Treffer: ", v("Treffer"))),
                    b("var.setze", "Treffer", 0),
                    b("bewegung.gehezuxy", 0, 100),
                    b("bewegung.richtung", zufall(150, 210))))));
    p.neueFigur(ball);
    return p;
  }

  private static Projekt partikel() {
    Projekt p = projekt("Partikel", "dunkel");
    Figur k = figur("Kreis", "kreis");
    skripte(k,
        kette(b("ereignis.flagge"),
            b("aussehen.verstecke"),
            mund(b("steuerung.wiederhole", 12),
                b("steuerung.klon", "_selbst_"),
                b("steuerung.warte", 0.15))),
        kette(b("steuerung.klonStart"),
            b("bewegung.gehezu", "_zufall_"),
            b("aussehen.setzeEffekt", "farbe", zufall(0, 200)),
            b("aussehen.setzeGroesse", zufall(30, 80)),
            b("bewegung.richtung", zufall(-180, 180)),
            b("aussehen.zeige"),
            mund(b("steuerung.fortlaufend"),
                b("bewegung.gehe", 3),
                b("bewegung.abprallen"))),
        kette(b("ereignis.figurAngetippt"),
            b("klang.spiele", "tropfen"),
            b("steuerung.loescheKlon")));
    p.neueFigur(k);
    return p;
  }

  private static Projekt melodie() {
    Projekt p = projekt("Melodie", "weiss");
    Figur f = figur("Person", "person1", "person2");
    double[][] lied = {
        {60, .35}, {62, .35}, {64, .35}, {65, .35}, {67, .7}, {67, .7},
        {69, .35}, {69, .35}, {69, .35}, {69, .35}, {67, 1.2},
        {69, .35}, {69, .35}, {69, .35}, {69, .35}, {67, 1.2},
        {65, .35}, {65, .35}, {65, .35}, {65, .35}, {64, .7}, {64, .7},
        {62, .35}, {62, .35}, {62, .35}, {62, .35}, {60, 1.2},
    };
    Block[] noten = new Block[lied.length + 2];
    noten[0] = b("ereignis.flagge");
    noten[1] = b("klang.instrument", "klavier");
    for (int i = 0; i < lied.length; i++) noten[i + 2] = b("klang.note", Werte.zahlText(lied[i][0]), Werte.zahlText(lied[i][1]));
    Block gehen = kette(b("ereignis.flagge"),
        mund(b("steuerung.wiederhole", 37),
            b("aussehen.naechstesKostuem"),
            b("steuerung.warte", 0.35)));
    skripte(f, kette(noten), gehen,
        kette(b("ereignis.taste", "leertaste"), b("klang.spiele", "trommel")));
    f.y = -40;
    p.neueFigur(f);
    return p;
  }
}
