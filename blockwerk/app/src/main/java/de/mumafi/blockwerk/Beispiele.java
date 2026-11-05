package de.mumafi.blockwerk;

/** Fertige kleine Projekte zum Ausprobieren und Abschauen. */
final class Beispiele {
  private Beispiele() {}

  static final String[] NAMEN = {
      "Hallo Robbi", "Malroboter", "Sternenfänger (Spiel)", "Ballspiel", "Aquarium (Klone)", "Alle meine Entchen"
  };

  static Projekt erzeuge(int i) {
    switch (i) {
      case 1: return malroboter();
      case 2: return sternenfaenger();
      case 3: return ballspiel();
      case 4: return aquarium();
      case 5: return entchen();
      default: return halloRobbi();
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

  private static Projekt halloRobbi() {
    Projekt p = projekt("Hallo Robbi", "himmel");
    Figur r = figur("Robbi", "robbi1", "robbi2");
    skripte(r,
        kette(b("ereignis.flagge"),
            b("bewegung.gehezuxy", 0, -40),
            b("aussehen.effekteAus"),
            b("aussehen.sageZeit", "Hallo! Tippe mich an.", 3),
            mund(b("steuerung.fortlaufend"),
                b("aussehen.naechstesKostuem"),
                b("steuerung.warte", 0.4))),
        kette(b("ereignis.figurAngetippt"),
            b("klang.spiele", "boing"),
            mund(b("steuerung.wiederhole", 12),
                b("bewegung.rechts", 30),
                b("aussehen.aendereEffekt", "farbe", 25)),
            b("aussehen.sageZeit", "Huii!", 1)));
    p.neueFigur(r);
    return p;
  }

  private static Projekt malroboter() {
    Projekt p = projekt("Malroboter", "weiss");
    p.variablen.put("Länge", 0.0);
    Figur r = figur("Robbi", "robbi1", "robbi2");
    r.groesse = 40;
    skripte(r,
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
            b("aussehen.sageZeit", "Fertig!", 2)));
    p.neueFigur(r);
    return p;
  }

  private static Projekt sternenfaenger() {
    Projekt p = projekt("Sternenfänger", "weltraum");
    p.variablen.put("Punkte", 0.0);
    p.monitore.add("Punkte");
    Figur r = figur("Robbi", "robbi1", "robbi2");
    r.groesse = 60;
    r.y = -130;
    skripte(r,
        kette(b("ereignis.flagge"),
            b("var.setze", "Punkte", 0),
            b("bewegung.gehezuxy", 0, -130),
            b("bewegung.drehtyp", "links-rechts"),
            mund(b("steuerung.fortlaufend"),
                mund(b("steuerung.falls", b("fuehlen.taste", "rechts")),
                    b("bewegung.richtung", 90),
                    b("bewegung.aendereX", 8),
                    b("aussehen.naechstesKostuem")),
                mund(b("steuerung.falls", b("fuehlen.taste", "links")),
                    b("bewegung.richtung", -90),
                    b("bewegung.aendereX", -8),
                    b("aussehen.naechstesKostuem")),
                b("bewegung.aendereX", b("op.durch", b("fuehlen.neigung", "lr"), 3)))),
        kette(b("ereignis.flagge"),
            b("aussehen.sageZeit", "Fang die Sterne! Pfeiltasten oder Handy kippen.", 3)));
    p.neueFigur(r);

    Figur s = figur("Stern", "stern");
    s.groesse = 70;
    s.y = 170;
    skripte(s,
        kette(b("ereignis.flagge"),
            b("bewegung.gehezuxy", zufall(-220, 220), 180),
            mund(b("steuerung.fortlaufend"),
                b("bewegung.aendereY", -5),
                b("bewegung.rechts", 4),
                mund(b("steuerung.falls", b("fuehlen.beruehrt", "Robbi")),
                    b("var.aendere", "Punkte", 1),
                    b("klang.spiele", "muenze"),
                    b("bewegung.gehezuxy", zufall(-220, 220), 180)),
                mund(b("steuerung.falls", b("op.kleiner", b("bewegung.y"), -170)),
                    b("bewegung.gehezuxy", zufall(-220, 220), 180)))));
    p.neueFigur(s);
    return p;
  }

  private static Projekt ballspiel() {
    Projekt p = projekt("Ballspiel", "wiese");
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
                    b("aussehen.sageZeit", "Daneben!", 1),
                    b("var.setze", "Treffer", 0),
                    b("bewegung.gehezuxy", 0, 100),
                    b("bewegung.richtung", zufall(150, 210))))),
        kette(b("ereignis.flagge"),
            b("aussehen.sageZeit", "Wische unten über die Bühne!", 2)));
    p.neueFigur(ball);
    return p;
  }

  private static Projekt aquarium() {
    Projekt p = projekt("Aquarium", "unterwasser");
    Figur f = figur("Fisch", "fisch");
    skripte(f,
        kette(b("ereignis.flagge"),
            b("aussehen.verstecke"),
            mund(b("steuerung.wiederhole", 7),
                b("steuerung.klon", "_selbst_"),
                b("steuerung.warte", 0.3))),
        kette(b("steuerung.klonStart"),
            b("bewegung.gehezu", "_zufall_"),
            b("aussehen.setzeEffekt", "farbe", zufall(0, 200)),
            b("aussehen.setzeGroesse", zufall(45, 100)),
            b("bewegung.drehtyp", "links-rechts"),
            b("bewegung.richtung", zufall(-180, 180)),
            b("aussehen.zeige"),
            mund(b("steuerung.fortlaufend"),
                b("bewegung.gehe", 2),
                b("bewegung.abprallen"),
                mund(b("steuerung.falls", b("op.gleich", zufall(1, 50), 1)),
                    b("bewegung.rechts", zufall(-40, 40))))),
        kette(b("ereignis.figurAngetippt"),
            b("klang.spiele", "tropfen"),
            b("aussehen.sageZeit", "Blubb!", 1)));
    p.neueFigur(f);
    return p;
  }

  private static Projekt entchen() {
    Projekt p = projekt("Alle meine Entchen", "strand");
    Figur r = figur("Robbi", "robbi1", "robbi2");
    double[][] lied = {
        {60, .35}, {62, .35}, {64, .35}, {65, .35}, {67, .7}, {67, .7},
        {69, .35}, {69, .35}, {69, .35}, {69, .35}, {67, 1.2},
        {69, .35}, {69, .35}, {69, .35}, {69, .35}, {67, 1.2},
        {65, .35}, {65, .35}, {65, .35}, {65, .35}, {64, .7}, {64, .7},
        {62, .35}, {62, .35}, {62, .35}, {62, .35}, {60, 1.2},
    };
    Block[] noten = new Block[lied.length + 3];
    noten[0] = b("ereignis.flagge");
    noten[1] = b("klang.instrument", "klavier");
    noten[2] = b("aussehen.sage", "♪");
    for (int i = 0; i < lied.length; i++) noten[i + 3] = b("klang.note", Werte.zahlText(lied[i][0]), Werte.zahlText(lied[i][1]));
    Block tanz = kette(b("ereignis.flagge"),
        mund(b("steuerung.wiederhole", 37),
            b("aussehen.naechstesKostuem"),
            b("steuerung.warte", 0.35)),
        b("aussehen.sageZeit", "Noch mal? Tippe die Flagge!", 2));
    skripte(r, kette(noten), tanz,
        kette(b("ereignis.taste", "leertaste"), b("klang.spiele", "trommel")));
    r.y = -60;
    p.neueFigur(r);
    return p;
  }
}
