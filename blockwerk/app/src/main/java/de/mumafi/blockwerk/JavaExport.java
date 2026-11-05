package de.mumafi.blockwerk;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Übersetzt ein Projekt in ein Java-Programm.
 *
 *  Jede Figur wird eine Klasse, jeder Startblock ein Lambda, Schleifen werden
 *  for und while, Variablen werden statische Felder vom Typ double oder
 *  String. Hinter das Programm kommen die Bilder als PNG-Text und die
 *  Laufzeit aus assets/laufzeit.java — so läuft die Datei für sich allein:
 *  {@code java Projekt.java}. */
final class JavaExport {

  private static final Set<String> SCHLUESSELWOERTER = new HashSet<>(Arrays.asList(
      "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue",
      "default", "do", "double", "else", "enum", "extends", "final", "finally", "float", "for", "goto", "if",
      "implements", "import", "instanceof", "int", "interface", "long", "native", "new", "package", "private",
      "protected", "public", "return", "short", "static", "strictfp", "super", "switch", "synchronized", "this",
      "throw", "throws", "transient", "try", "void", "volatile", "while", "true", "false", "null", "var",
      "record", "yield", "sealed", "permits", "args"));

  /** Namen, die schon die Laufzeit oder java.lang benutzt */
  private static final Set<String> BELEGT = new HashSet<>(Arrays.asList(
      "Welt", "Ziel", "Figur", "Buehne", "Hintergrund", "Kostuem", "Skript", "Stopp", "Hut", "Wert", "Klaenge",
      "Bilder", "Object", "String", "Math", "System", "Thread", "Runnable", "Override", "Integer", "Double",
      "Boolean", "Character", "Exception", "Error", "List", "Map", "Color", "Image", "Graphics", "Font",
      "Random", "Arrays", "Long", "Float", "Number", "Class", "Void", "Iterable"));

  private static final char Z = 'Z', T = 'T', W = 'W', X = 'X';

  /** Ein Java-Ausdruck mit seinem Typ: Z Zahl, T Text, W Wahrheitswert */
  private static final class A {
    final String code;
    final char typ;
    final boolean atom;
    A(String code, char typ, boolean atom) { this.code = code; this.typ = typ; this.atom = atom; }
  }

  private final Projekt p;
  final String klasse;
  private final LinkedHashMap<String, String> varName = new LinkedHashMap<>();
  private final HashMap<String, Character> varTyp = new HashMap<>();
  private final LinkedHashMap<Figur, String> figurKlasse = new LinkedHashMap<>();
  private final IdentityHashMap<Kostuem, String> bildKonstante = new IdentityHashMap<>();
  private final LinkedHashMap<String, Kostuem> bilder = new LinkedHashMap<>();
  private final Set<Kostuem> buehnenbilder = java.util.Collections.newSetFromMap(new IdentityHashMap<>());

  private StringBuilder sb;
  private int tiefe, schleifen;
  private Figur ziel;

  JavaExport(Projekt p) {
    this.p = p;
    klasse = eindeutig(klassenName(p.name, "Programm"), new HashSet<>());
    namenVergeben();
  }

  // ============================================================== Namen

  /** Zerlegt in ASCII-Wörter: Umlaute werden ae, oe, ue, ß wird ss. */
  static List<String> woerter(String s) {
    StringBuilder t = new StringBuilder();
    for (char c : s.toCharArray()) {
      switch (c) {
        case 'ä': t.append("ae"); break;
        case 'ö': t.append("oe"); break;
        case 'ü': t.append("ue"); break;
        case 'Ä': t.append("Ae"); break;
        case 'Ö': t.append("Oe"); break;
        case 'Ü': t.append("Ue"); break;
        case 'ß': t.append("ss"); break;
        default: t.append(c < 128 && Character.isLetterOrDigit(c) ? c : ' ');
      }
    }
    List<String> l = new ArrayList<>();
    for (String w : t.toString().trim().split("\\s+")) if (!w.isEmpty()) l.add(w);
    return l;
  }

  static String klassenName(String s, String ersatz) {
    StringBuilder b = new StringBuilder();
    for (String w : woerter(s)) b.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1));
    String n = b.length() == 0 ? ersatz : b.toString();
    if (Character.isDigit(n.charAt(0))) n = ersatz + n;
    return n;
  }

  static String variablenName(String s) {
    StringBuilder b = new StringBuilder();
    for (String w : woerter(s)) {
      if (b.length() == 0) b.append(Character.toLowerCase(w.charAt(0))).append(w.substring(1));
      else b.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1));
    }
    String n = b.length() == 0 ? "wert" : b.toString();
    if (Character.isDigit(n.charAt(0))) n = "v" + n;
    if (SCHLUESSELWOERTER.contains(n)) n = n + "Wert";
    return n;
  }

  static String konstantenName(String s) {
    StringBuilder b = new StringBuilder();
    for (String w : woerter(s)) {
      if (b.length() > 0) b.append('_');
      b.append(w.toUpperCase(java.util.Locale.ROOT));
    }
    String n = b.length() == 0 ? "BILD" : b.toString();
    if (Character.isDigit(n.charAt(0))) n = "BILD_" + n;
    return n;
  }

  private static String eindeutig(String n, Set<String> vergeben) {
    String k = n;
    for (int i = 2; vergeben.contains(k); i++) k = n + i;
    vergeben.add(k);
    return k;
  }

  private void namenVergeben() {
    Set<String> klassen = new HashSet<>(BELEGT);
    klassen.add(klasse);
    for (Figur f : p.figuren) {
      String n = klassenName(f.name, "Figur");
      if (BELEGT.contains(n) || n.equals(klasse)) n = n + "Figur";
      figurKlasse.put(f, eindeutig(n, klassen));
    }

    // Variablen: alle aus dem Projekt und alle, die in Skripten vorkommen
    LinkedHashMap<String, Object> alle = new LinkedHashMap<>(p.variablen);
    for (Figur f : alleZiele()) for (Block b : f.skripte) sammleVariablen(b, alle);
    Set<String> felder = new HashSet<>();
    for (String v : alle.keySet()) {
      varName.put(v, eindeutig(variablenName(v), felder));
      Object w = alle.get(v);
      varTyp.put(v, w instanceof Double || Werte.alsZahlOderNull(w) != null || w == null ? Z : T);
    }
    // Typ aus den Zuweisungen ableiten: ein einziger Text macht die Variable zum String
    for (Figur f : alleZiele()) for (Block b : f.skripte) typenAbleiten(b);

    // Bilder
    Set<String> konst = new HashSet<>();
    for (Figur f : alleZiele()) {
      for (Kostuem k : f.kostueme) {
        if (bildKonstante.containsKey(k)) continue;
        String n = eindeutig(konstantenName((f.istBuehne ? "Bild " : "") + k.name), konst);
        bildKonstante.put(k, n);
        bilder.put(n, k);
        if (f.istBuehne) buehnenbilder.add(k);
      }
    }
  }

  private List<Figur> alleZiele() {
    List<Figur> l = new ArrayList<>();
    l.add(p.buehne);
    l.addAll(p.figuren);
    return l;
  }

  private static void sammleVariablen(Block b, Map<String, Object> alle) {
    for (; b != null; b = b.next) {
      String op = b.spec.op;
      if (op.startsWith("var.") && b.werte.length > 0 && !alle.containsKey(b.werte[0])) alle.put(b.werte[0], 0.0);
      for (Block a : b.args) if (a != null) sammleVariablen(a, alle);
      for (Block s : b.sub) if (s != null) sammleVariablen(s, alle);
    }
  }

  private void typenAbleiten(Block b) {
    for (; b != null; b = b.next) {
      if (b.spec.op.equals("var.setze")) {
        char t;
        if (b.args[1] != null) {
          t = typ(b.args[1]);
        } else {
          t = Werte.alsZahlOderNull(b.werte[1]) != null ? Z : T;
        }
        if (t != Z) varTyp.put(b.werte[0], T);
      }
      for (Block a : b.args) if (a != null) typenAbleiten(a);
      for (Block s : b.sub) if (s != null) typenAbleiten(s);
    }
  }

  /** Statischer Typ eines Werteblocks */
  private char typ(Block r) {
    switch (r.spec.op) {
      case "var.wert": { Character t = varTyp.get(r.werte[0]); return t == null ? Z : t; }
      case "op.verbinde": case "op.zeichen": case "fuehlen.antwort": return T;
      case "aussehen.kostuemWert": case "aussehen.bildWert": return r.werte[0].equals("name") ? T : Z;
      case "fuehlen.eigenschaft": return r.werte[0].equals("kostuemName") ? T : Z;
      default: return r.spec.form == Spec.Form.BOOL ? W : Z;
    }
  }

  // ============================================================== Ausgabe

  /** Nur das Programm, ohne Bilder und Laufzeit — für die Code-Ansicht. */
  String programm() {
    sb = new StringBuilder();
    tiefe = 0;
    schreibeProgramm();
    return sb.toString();
  }

  /** Die vollständige Datei zum Speichern. */
  String datei(String laufzeit) {
    sb = new StringBuilder();
    tiefe = 0;
    zeile("// " + kommentar(p.name));
    zeile("//");
    zeile("// Erzeugt mit Blockwerk. Starten mit einem JDK ab Version 11:");
    zeile("//");
    zeile("//     java " + klasse + ".java");
    zeile("//");
    zeile("// oder übersetzen und starten:  javac " + klasse + ".java  &&  java " + klasse);
    zeile("//");
    zeile("// Die Datei ist UTF-8 (Standard ab Java 18). Mit älterem Java unter Windows:");
    zeile("//     javac -encoding UTF-8 " + klasse + ".java  &&  java " + klasse);
    zeile("//");
    zeile("// Oben steht das Programm. Darunter folgen die Bilder (als PNG-Text) und");
    zeile("// die Laufzeit mit Fenster, Bühne, Figuren und Klängen.");
    zeile("");
    for (String i : new String[]{"java.awt.*", "java.awt.event.*", "java.awt.geom.*", "java.awt.image.BufferedImage",
        "java.io.*", "java.util.*", "java.util.List", "java.util.function.*", "javax.imageio.ImageIO",
        "javax.sound.sampled.*", "javax.swing.*"}) {
      zeile("import " + i + ";");
    }
    zeile("");
    schreibeProgramm();
    zeile("");
    schreibeBilder();
    sb.append(laufzeit);
    return sb.toString();
  }

  private void zeile(String s) {
    if (!s.isEmpty()) for (int i = 0; i < tiefe; i++) sb.append("  ");
    sb.append(s).append('\n');
  }

  private void schreibeProgramm() {
    zeile("public class " + klasse + " {");
    tiefe++;
    if (!varName.isEmpty()) {
      zeile("");
      zeile("// Variablen – für alle Figuren sichtbar");
      for (Map.Entry<String, String> e : varName.entrySet()) {
        char t = varTyp.get(e.getKey());
        Object start = p.variablen.get(e.getKey());
        String wert = t == Z ? zahlLiteral(Werte.zahl(start)).code : literal(start == null ? "" : Werte.text(start));
        zeile("static " + (t == Z ? "double " : "String ") + e.getValue() + " = " + wert + ";");
      }
    }

    zeile("");
    zeile("public static void main(String[] args) {");
    tiefe++;
    for (Map.Entry<String, String> e : varName.entrySet()) {
      zeile("Welt.variable(" + literal(e.getKey()) + ", () -> " + e.getValue() + ");");
    }
    for (String m : p.monitore) if (varName.containsKey(m)) zeile("Welt.zeigeVariable(" + literal(m) + ");");
    StringBuilder start = new StringBuilder("Welt.starte(" + literal(p.name) + ", new Hintergrund()");
    for (Figur f : p.ebenen) if (!f.istKlon && figurKlasse.containsKey(f)) start.append(", new ").append(figurKlasse.get(f)).append("()");
    zeile(start + ");");
    tiefe--;
    zeile("}");

    schreibeZiel(p.buehne);
    for (Figur f : p.figuren) schreibeZiel(f);
    tiefe--;
    zeile("}");
  }

  private void schreibeZiel(Figur f) {
    ziel = f;
    String name = f.istBuehne ? "Hintergrund" : figurKlasse.get(f);
    zeile("");
    zeile(f.istBuehne ? "/** Die Bühne */" : "/** Figur „" + kommentar(f.name) + "“ */");
    zeile("static class " + name + " extends " + (f.istBuehne ? "Buehne" : "Figur") + " {");
    tiefe++;
    zeile(name + "() {");
    tiefe++;
    if (!f.istBuehne) zeile("super(" + literal(f.name) + ");");
    for (Kostuem k : f.kostueme) {
      double res = f.istBuehne ? 1 : k.aufloesung;
      double mx = f.istBuehne ? k.mx / k.aufloesung : k.mx, my = f.istBuehne ? k.my / k.aufloesung : k.my;
      zeile("fuegeKostuemHinzu(" + literal(k.name) + ", Bilder." + bildKonstante.get(k) + ", "
          + zahlLiteral(Math.round(mx * 100) / 100.0).code + ", " + zahlLiteral(Math.round(my * 100) / 100.0).code + ", "
          + zahlLiteral(res).code + ");");
    }
    if (f.kostuem != 0) zeile("kostuem = " + f.kostuem + ";");
    if (!f.istBuehne) {
      zeile("x = " + zahlLiteral(Math.round(f.x * 100) / 100.0).code + ";");
      zeile("y = " + zahlLiteral(Math.round(f.y * 100) / 100.0).code + ";");
      if (f.richtung != 90) zeile("richtung = " + zahlLiteral(f.richtung).code + ";");
      if (f.groesse != 100) zeile("groesse = " + zahlLiteral(Math.round(f.groesse * 100) / 100.0).code + ";");
      if (!f.sichtbar) zeile("sichtbar = false;");
      if (!f.drehtyp.equals("rundherum")) zeile("drehtyp = " + literal(f.drehtyp) + ";");
    }
    if (f.lautstaerke != 100) zeile("lautstaerke = " + zahlLiteral(f.lautstaerke).code + ";");
    tiefe--;
    zeile("}");

    List<Block> mitHut = new ArrayList<>(), ohneHut = new ArrayList<>();
    for (Block b : sortiert(f.skripte)) {
      if (b.spec.istHut()) mitHut.add(b);
      else if (b.spec.istBefehl()) ohneHut.add(b);
    }
    if (!mitHut.isEmpty()) {
      zeile("");
      zeile("@Override void skripte() {");
      tiefe++;
      boolean erstes = true;
      for (Block h : mitHut) {
        if (!erstes) zeile("");
        erstes = false;
        hut(h);
      }
      tiefe--;
      zeile("}");
    }
    int n = 1;
    for (Block b : ohneHut) {
      zeile("");
      zeile("/** Ein Stapel ohne Startblock – er wird nie aufgerufen. */");
      zeile("void stapel" + (n++) + "() {");
      tiefe++;
      schleifen = 0;
      stapel(b);
      tiefe--;
      zeile("}");
    }
    tiefe--;
    zeile("}");
  }

  /** Skripte von oben nach unten, wie sie auf der Fläche liegen */
  private static List<Block> sortiert(List<Block> l) {
    List<Block> s = new ArrayList<>(l);
    s.sort((a, b) -> a.y != b.y ? Float.compare(a.y, b.y) : Float.compare(a.x, b.x));
    return s;
  }

  private void hut(Block h) {
    String kopf;
    switch (h.spec.op) {
      case "ereignis.flagge": kopf = "wennProgrammStartet("; break;
      case "ereignis.taste": kopf = "wennTasteGedrueckt(" + literal(h.werte[0]) + ", "; break;
      case "ereignis.figurAngetippt":
      case "ereignis.buehneAngetippt": kopf = "wennAngeklickt("; break;
      case "ereignis.bildWechsel": kopf = "wennBuehnenbildWechseltZu(" + literal(h.werte[0]) + ", "; break;
      case "ereignis.empfange": kopf = "wennIchEmpfange(" + literal(h.werte[0]) + ", "; break;
      case "steuerung.klonStart": kopf = "wennIchAlsKlonEntstehe("; break;
      default: kopf = "wennProgrammStartet("; break;
    }
    zeile(kopf + "() -> {");
    tiefe++;
    schleifen = 0;
    stapel(h.next);
    tiefe--;
    zeile("});");
  }

  // ============================================================== Anweisungen

  private void stapel(Block b) {
    for (; b != null; b = b.next) {
      befehl(b);
      if (!kannEnden(b) && b.next != null) {
        zeile("// (die Blöcke darunter werden nie erreicht)");
        return;
      }
    }
  }

  /** Kann Java nach diesem Block weitermachen? (wiederhole fortlaufend: nein) */
  private static boolean kannEnden(Block b) {
    switch (b.spec.op) {
      case "steuerung.fortlaufend": return false;
      case "steuerung.fallsSonst": return stapelKannEnden(b.sub[0]) || stapelKannEnden(b.sub[1]);
      default: return true;
    }
  }

  private static boolean stapelKannEnden(Block b) {
    for (; b != null; b = b.next) if (!kannEnden(b)) return false;
    return true;
  }

  private void innen(Block b, boolean schleife) {
    tiefe++;
    stapel(b);
    if (schleife && stapelKannEnden(b)) zeile("warteAufBild();");
    tiefe--;
  }

  private static final String[] ZAEHLER = {"i", "j", "k", "l", "m", "n"};

  private String zaehler() {
    String v = schleifen < ZAEHLER.length ? ZAEHLER[schleifen] : "i" + schleifen;
    schleifen++;
    return v;
  }

  private void befehl(Block b) {
    String op = b.spec.op;
    if (ziel.istBuehne && b.spec.nurFigur) {
      zeile("// (" + op + " gibt es nur für Figuren)");
      return;
    }
    switch (op) {
      // ------------------------------------------------ Bewegung
      case "bewegung.gehe": zeile("gehe(" + zahl(b, 0) + ");"); break;
      case "bewegung.rechts": zeile("dreheRechts(" + zahl(b, 0) + ");"); break;
      case "bewegung.links": zeile("dreheLinks(" + zahl(b, 0) + ");"); break;
      case "bewegung.gehezu":
        zeile(ortAufruf(b, 0, "geheZu", "geheZuZufallsposition", "geheZuMaus", null));
        break;
      case "bewegung.gehezuxy": zeile("geheZu(" + zahl(b, 0) + ", " + zahl(b, 1) + ");"); break;
      case "bewegung.gleitezu":
        zeile(ortAufruf(b, 1, "gleiteZu", "gleiteZuZufallsposition", "gleiteZuMaus", zahl(b, 0)));
        break;
      case "bewegung.gleitexy": zeile("gleiteZu(" + zahl(b, 0) + ", " + zahl(b, 1) + ", " + zahl(b, 2) + ");"); break;
      case "bewegung.richtung": zeile("setzeRichtung(" + zahl(b, 0) + ");"); break;
      case "bewegung.drehezu":
        if (b.args[0] == null && b.werte[0].equals("_finger_")) zeile("dreheDichZuMaus();");
        else zeile("dreheDichZu(" + text(b, 0) + ");");
        break;
      case "bewegung.aendereX": zeile("aendereX(" + zahl(b, 0) + ");"); break;
      case "bewegung.setzeX": zeile("setzeX(" + zahl(b, 0) + ");"); break;
      case "bewegung.aendereY": zeile("aendereY(" + zahl(b, 0) + ");"); break;
      case "bewegung.setzeY": zeile("setzeY(" + zahl(b, 0) + ");"); break;
      case "bewegung.abprallen": zeile("pralleVomRandAb();"); break;
      case "bewegung.drehtyp": zeile("setzeDrehtyp(" + literal(b.werte[0]) + ");"); break;

      // ------------------------------------------------ Aussehen
      case "aussehen.sageZeit": zeile("sage(" + text(b, 0) + ", " + zahl(b, 1) + ");"); break;
      case "aussehen.sage": zeile("sage(" + text(b, 0) + ");"); break;
      case "aussehen.denkeZeit": zeile("denke(" + text(b, 0) + ", " + zahl(b, 1) + ");"); break;
      case "aussehen.denke": zeile("denke(" + text(b, 0) + ");"); break;
      case "aussehen.kostuem":
        if (b.args[0] != null && typ(b.args[0]) == Z) zeile("wechsleZuKostuem(" + zahl(b, 0) + ");");
        else zeile("wechsleZuKostuem(" + text(b, 0) + ");");
        break;
      case "aussehen.naechstesKostuem": zeile("naechstesKostuem();"); break;
      case "aussehen.bild":
        if (b.args[0] != null) {
          zeile(typ(b.args[0]) == Z ? "wechsleZuBuehnenbild(" + zahl(b, 0) + ");" : "wechsleZuBuehnenbild(" + text(b, 0) + ");");
        } else {
          switch (b.werte[0]) {
            case "_naechstes_": zeile("naechstesBuehnenbild();"); break;
            case "_vorheriges_": zeile("vorherigesBuehnenbild();"); break;
            case "_zufall_": zeile("zufaelligesBuehnenbild();"); break;
            default: zeile("wechsleZuBuehnenbild(" + literal(b.werte[0]) + ");"); break;
          }
        }
        break;
      case "aussehen.naechstesBild": zeile("naechstesBuehnenbild();"); break;
      case "aussehen.aendereGroesse": zeile("aendereGroesse(" + zahl(b, 0) + ");"); break;
      case "aussehen.setzeGroesse": zeile("setzeGroesse(" + zahl(b, 0) + ");"); break;
      case "aussehen.aendereEffekt": zeile("aendereEffekt(" + literal(b.werte[0]) + ", " + zahl(b, 1) + ");"); break;
      case "aussehen.setzeEffekt": zeile("setzeEffekt(" + literal(b.werte[0]) + ", " + zahl(b, 1) + ");"); break;
      case "aussehen.effekteAus": zeile("schalteGrafikeffekteAus();"); break;
      case "aussehen.zeige": zeile("zeigeDich();"); break;
      case "aussehen.verstecke": zeile("versteckeDich();"); break;
      case "aussehen.ebene":
        zeile(b.werte[0].equals("hinterste") ? "geheZurHinterstenEbene();" : "geheZurVorderstenEbene();");
        break;
      case "aussehen.ebenen":
        zeile((b.werte[1].equals("zurueck") ? "geheEbenenNachHinten(" : "geheEbenenNachVorne(") + zahl(b, 0) + ");");
        break;

      // ------------------------------------------------ Klang
      case "klang.spieleGanz": zeile("spieleKlangGanz(" + text(b, 0) + ");"); break;
      case "klang.spiele": zeile("spieleKlang(" + text(b, 0) + ");"); break;
      case "klang.note": zeile("spieleNote(" + zahl(b, 0) + ", " + zahl(b, 1) + ");"); break;
      case "klang.instrument": zeile("setzeInstrument(" + literal(b.werte[0]) + ");"); break;
      case "klang.stoppe": zeile("stoppeAlleKlaenge();"); break;
      case "klang.aendereLautstaerke": zeile("aendereLautstaerke(" + zahl(b, 0) + ");"); break;
      case "klang.setzeLautstaerke": zeile("setzeLautstaerke(" + zahl(b, 0) + ");"); break;

      // ------------------------------------------------ Ereignisse
      case "ereignis.sende": zeile("sende(" + text(b, 0) + ");"); break;
      case "ereignis.sendeWarte": zeile("sendeUndWarte(" + text(b, 0) + ");"); break;

      // ------------------------------------------------ Steuerung
      case "steuerung.warte": zeile("warte(" + zahl(b, 0) + ");"); break;
      case "steuerung.wiederhole": {
        String v = zaehler();
        if (b.args[0] == null) {
          zeile("for (int " + v + " = 0; " + v + " < " + Werte.ganz(b.werte[0]) + "; " + v + "++) {");
        } else {
          zeile("for (int " + v + " = 0, " + v + "Bis = Wert.ganz(" + zahl(b, 0) + "); " + v + " < " + v + "Bis; " + v + "++) {");
        }
        innen(b.sub[0], true);
        zeile("}");
        schleifen--;
        break;
      }
      case "steuerung.fortlaufend":
        zeile("while (true) {");
        innen(b.sub[0], true);
        zeile("}");
        break;
      case "steuerung.wiederholeBis":
        zeile("while (" + nicht(bedingung(b, 0)) + ") {");
        innen(b.sub[0], true);
        zeile("}");
        break;
      case "steuerung.falls":
        zeile("if (" + bedingung(b, 0).code + ") {");
        innen(b.sub[0], false);
        zeile("}");
        break;
      case "steuerung.fallsSonst":
        zeile("if (" + bedingung(b, 0).code + ") {");
        innen(b.sub[0], false);
        zeile("} else {");
        innen(b.sub[1], false);
        zeile("}");
        break;
      case "steuerung.warteBis": zeile("warteBis(() -> " + bedingung(b, 0).code + ");"); break;
      case "steuerung.stoppe":
        zeile(b.werte[0].equals("alles") ? "stoppeAlles();" : "stoppeDiesesSkript();");
        break;
      case "steuerung.stoppeAndere": zeile("stoppeAndereSkripte();"); break;
      case "steuerung.klon":
        if (b.args[0] == null && b.werte[0].equals("_selbst_") && !ziel.istBuehne) zeile("erzeugeKlon();");
        else zeile("erzeugeKlonVon(" + text(b, 0) + ");");
        break;
      case "steuerung.loescheKlon": zeile("loescheDiesenKlon();"); break;

      // ------------------------------------------------ Fühlen
      case "fuehlen.frage": zeile("frage(" + text(b, 0) + ");"); break;
      case "fuehlen.konsole": zeile("System.out.println(" + text(b, 0) + ");"); break;
      case "fuehlen.stoppuhrNeu": zeile("starteStoppuhrNeu();"); break;

      // ------------------------------------------------ Variablen
      case "var.setze": {
        String v = feld(b.werte[0]);
        char t = varTyp.get(b.werte[0]);
        zeile(v + " = " + slot(b, 1, t).code + ";");
        break;
      }
      case "var.aendere": {
        String v = feld(b.werte[0]);
        if (varTyp.get(b.werte[0]) == Z) zeile(v + " += " + zahl(b, 1) + ";");
        else zeile(v + " = Wert.text(Wert.zahl(" + v + ") + " + operand(slot(b, 1, Z)) + ");");
        break;
      }
      case "var.zeige": zeile("zeigeVariable(" + literal(b.werte[0]) + ");"); break;
      case "var.verstecke": zeile("versteckeVariable(" + literal(b.werte[0]) + ");"); break;

      // ------------------------------------------------ Stift
      case "stift.loesche": zeile("loescheAlles();"); break;
      case "stift.abdruck": zeile("hinterlasseAbdruck();"); break;
      case "stift.runter": zeile("stiftRunter();"); break;
      case "stift.hoch": zeile("stiftHoch();"); break;
      case "stift.farbe": zeile("setzeStiftfarbe(" + farbLiteral(b.werte[0]) + ");"); break;
      case "stift.aendereFarbton": zeile("aendereStiftFarbton(" + zahl(b, 0) + ");"); break;
      case "stift.setzeFarbton": zeile("setzeStiftFarbton(" + zahl(b, 0) + ");"); break;
      case "stift.dicke": zeile("setzeStiftdicke(" + zahl(b, 0) + ");"); break;
      case "stift.aendereDicke": zeile("aendereStiftdicke(" + zahl(b, 0) + ");"); break;

      default:
        if (b.spec.istWert()) zeile("// (ein einzelner Werteblock tut nichts)");
        else zeile("// (unbekannter Block " + op + ")");
        break;
    }
  }

  /** gehe zu / gleite zu: Zufallsposition, Maus oder eine Figur */
  private String ortAufruf(Block b, int slot, String figur, String zufall, String maus, String sekunden) {
    String vorn = sekunden == null ? "" : sekunden;
    if (b.args[slot] == null) {
      if (b.werte[slot].equals("_zufall_")) return zufall + "(" + vorn + ");";
      if (b.werte[slot].equals("_finger_")) return maus + "(" + vorn + ");";
    }
    return figur + "(" + (vorn.isEmpty() ? "" : vorn + ", ") + text(b, slot) + ");";
  }

  private String feld(String variable) {
    String n = varName.get(variable);
    return klasse + "." + n;
  }

  // ============================================================== Ausdrücke

  private String zahl(Block b, int i) { return slot(b, i, Z).code; }
  private String text(Block b, int i) { return slot(b, i, T).code; }
  private A bedingung(Block b, int i) { return slot(b, i, W); }

  private static String nicht(A a) {
    if (a.code.startsWith("!") && a.atom) return a.code.substring(1);
    return "!" + (a.atom ? a.code : "(" + a.code + ")");
  }

  private static String operand(A a) { return a.atom ? a.code : "(" + a.code + ")"; }

  private A slot(Block b, int i, char erwartet) {
    if (b.args[i] != null) return umwandeln(wert(b.args[i]), erwartet);
    String w = b.werte[i] == null ? "" : b.werte[i];
    switch (b.spec.slotArt[i]) {
      case 'b':
        return umwandeln(new A("false", W, true), erwartet);
      case 'n': {
        if (erwartet == T) return new A(literal(Werte.zahlText(Werte.zahl(w))), T, true);
        return umwandeln(zahlLiteral(Werte.zahl(w)), erwartet);
      }
      case 'f':
        return new A(farbLiteral(w), Z, true);
      default: {
        Double d = Werte.alsZahlOderNull(w);
        if (erwartet == T) return new A(literal(w), T, true);
        if (erwartet == Z) return zahlLiteral(d == null ? 0 : d);
        if (erwartet == W) return new A(Werte.wahr(w) ? "true" : "false", W, true);
        return d != null ? zahlLiteral(d) : new A(literal(w), T, true);
      }
    }
  }

  private static A umwandeln(A a, char ziel) {
    if (ziel == X || a.typ == ziel) return a;
    switch (ziel) {
      case T: return new A("Wert.text(" + a.code + ")", T, true);
      case Z: return new A("Wert.zahl(" + a.code + ")", Z, true);
      default: return new A("Wert.wahr(" + a.code + ")", W, true);
    }
  }

  private static A zahlLiteral(double d) {
    String s;
    if (Double.isNaN(d)) s = "0";
    else if (Double.isInfinite(d)) s = d > 0 ? "Double.POSITIVE_INFINITY" : "Double.NEGATIVE_INFINITY";
    else if (d == Math.rint(d) && Math.abs(d) < 1e9) s = Long.toString((long) d);
    else s = Double.toString(d);
    return new A(s, Z, true);
  }

  private static String farbLiteral(String hex) {
    return String.format("0x%06X", Motor.farbe(hex) & 0xFFFFFF);
  }

  private A rechnen(Block r, String zeichen) {
    A a = slot(r, 0, Z), b = slot(r, 1, Z);
    String links = operand(a);
    // 1 / 2 wäre in Java ganzzahlig — dann die linke Zahl als Kommazahl schreiben
    if (zeichen.equals(" / ") && a.code.matches("-?\\d+") && b.code.matches("-?\\d+")) {
      links = a.code + ".0";
    }
    return new A(links + zeichen + operand(b), Z, false);
  }

  private A vergleich(Block r, String zeichen) {
    A a = slot(r, 0, X), b = slot(r, 1, X);
    if (a.typ == Z && b.typ == Z) return new A(operand(a) + " " + zeichen + " " + operand(b), W, false);
    if (zeichen.equals("==")) return new A("Wert.gleich(" + a.code + ", " + b.code + ")", W, true);
    return new A("Wert.vergleiche(" + a.code + ", " + b.code + ") " + zeichen + " 0", W, false);
  }

  private A wert(Block r) {
    String op = r.spec.op;
    boolean buehne = ziel.istBuehne;
    switch (op) {
      case "bewegung.x": return new A("xPosition()", Z, true);
      case "bewegung.y": return new A("yPosition()", Z, true);
      case "bewegung.r": return new A("richtung()", Z, true);
      case "aussehen.kostuemWert":
        return r.werte[0].equals("name") ? new A("kostuemName()", T, true) : new A("kostuemNummer()", Z, true);
      case "aussehen.bildWert":
        return r.werte[0].equals("name") ? new A("bildName()", T, true) : new A("bildNummer()", Z, true);
      case "aussehen.groesse": return new A("groesse()", Z, true);
      case "klang.lautstaerke": return new A("lautstaerke()", Z, true);
      case "fuehlen.beruehrt":
        if (buehne) return new A("false", W, true);
        if (r.args[0] == null && r.werte[0].equals("_finger_")) return new A("beruehrtMaus()", W, true);
        if (r.args[0] == null && r.werte[0].equals("_rand_")) return new A("beruehrtRand()", W, true);
        return new A("beruehrt(" + text(r, 0) + ")", W, true);
      case "fuehlen.farbe":
        if (buehne) return new A("false", W, true);
        return new A("beruehrtFarbe(" + farbLiteral(r.werte[0]) + ")", W, true);
      case "fuehlen.entfernung":
        if (buehne) return new A("0", Z, true);
        if (r.args[0] == null && r.werte[0].equals("_finger_")) return new A("entfernungZuMaus()", Z, true);
        return new A("entfernungZu(" + text(r, 0) + ")", Z, true);
      case "fuehlen.antwort": return new A("antwort()", T, true);
      case "fuehlen.taste": return new A("tasteGedrueckt(" + text(r, 0) + ")", W, true);
      case "fuehlen.fingerUnten": return new A("mausGedrueckt()", W, true);
      case "fuehlen.fingerX": return new A("mausX()", Z, true);
      case "fuehlen.fingerY": return new A("mausY()", Z, true);
      case "fuehlen.neigung": return new A("neigung(" + literal(r.werte[0]) + ")", Z, true);
      case "fuehlen.stoppuhr": return new A("stoppuhr()", Z, true);
      case "fuehlen.eigenschaft": {
        String obj = "figur(" + literal(r.werte[1]) + ")";
        switch (r.werte[0]) {
          case "x": return new A(obj + ".xPosition()", Z, true);
          case "y": return new A(obj + ".yPosition()", Z, true);
          case "richtung": return new A(obj + ".richtung()", Z, true);
          case "kostuemNr": return new A(obj + ".kostuemNummer()", Z, true);
          case "kostuemName": return new A(obj + ".kostuemName()", T, true);
          case "groesse": return new A(obj + ".groesse()", Z, true);
          default: return new A(obj + ".lautstaerke()", Z, true);
        }
      }
      case "fuehlen.zeit": return new A("Wert.zeit(" + literal(r.werte[0]) + ")", Z, true);
      case "op.plus": return rechnen(r, " + ");
      case "op.minus": return rechnen(r, " - ");
      case "op.mal": return rechnen(r, " * ");
      case "op.durch": return rechnen(r, " / ");
      case "op.zufall": return new A("Wert.zufall(" + zahl(r, 0) + ", " + zahl(r, 1) + ")", Z, true);
      case "op.groesser": return vergleich(r, ">");
      case "op.kleiner": return vergleich(r, "<");
      case "op.gleich": return vergleich(r, "==");
      case "op.und": return new A(operand(bedingung(r, 0)) + " && " + operand(bedingung(r, 1)), W, false);
      case "op.oder": return new A(operand(bedingung(r, 0)) + " || " + operand(bedingung(r, 1)), W, false);
      case "op.nicht": return new A(nicht(bedingung(r, 0)), W, true);
      case "op.verbinde": return new A(operand(slot(r, 0, T)) + " + " + operand(slot(r, 1, T)), T, false);
      case "op.zeichen": return new A("Wert.zeichen(" + zahl(r, 0) + ", " + text(r, 1) + ")", T, true);
      case "op.laenge": return new A("Wert.laenge(" + text(r, 0) + ")", Z, true);
      case "op.enthaelt": return new A("Wert.enthaelt(" + text(r, 0) + ", " + text(r, 1) + ")", W, true);
      case "op.mod": return new A("Wert.mod(" + zahl(r, 0) + ", " + zahl(r, 1) + ")", Z, true);
      case "op.runde": return new A("Wert.runde(" + zahl(r, 0) + ")", Z, true);
      case "op.mathe": {
        String a = zahl(r, 1);
        switch (r.werte[0]) {
          case "betrag": return new A("Math.abs(" + a + ")", Z, true);
          case "ab": return new A("Math.floor(" + a + ")", Z, true);
          case "auf": return new A("Math.ceil(" + a + ")", Z, true);
          case "wurzel": return new A("Math.sqrt(" + a + ")", Z, true);
          case "sin": case "cos": case "tan": case "asin": case "acos": case "atan":
            return new A("Wert." + r.werte[0] + "(" + a + ")", Z, true);
          case "ln": return new A("Math.log(" + a + ")", Z, true);
          case "log": return new A("Math.log10(" + a + ")", Z, true);
          case "e^": return new A("Math.exp(" + a + ")", Z, true);
          default: return new A("Math.pow(10, " + a + ")", Z, true);
        }
      }
      case "var.wert": {
        Character t = varTyp.get(r.werte[0]);
        return new A(feld(r.werte[0]), t == null ? Z : t, true);
      }
      default:
        return new A("0", Z, true);
    }
  }

  // ============================================================== Text

  /** Java-Textliteral. Umlaute bleiben lesbar — die Datei ist UTF-8, wie es
   *  Java ab Version 18 für Quelltexte annimmt. */
  static String literal(String s) {
    StringBuilder b = new StringBuilder("\"");
    for (char c : s.toCharArray()) {
      switch (c) {
        case '"': b.append("\\\""); break;
        case '\\': b.append("\\\\"); break;
        case '\n': b.append("\\n"); break;
        case '\r': b.append("\\r"); break;
        case '\t': b.append("\\t"); break;
        default:
          if (c < 32 || (c >= 0x7F && c < 0xA0) || Character.isSurrogate(c)) b.append(String.format("\\u%04x", (int) c));
          else b.append(c);
      }
    }
    return b.append('"').toString();
  }

  /** Für Kommentare: nichts, was einen Kommentar beendet oder Zeilen bricht. */
  static String kommentar(String s) {
    return s.replace("*/", "* /").replace('\n', ' ').replace('\r', ' ');
  }

  /** Umlaute ausschreiben, Rest durch ? ersetzen. */
  static String ascii(String s) {
    StringBuilder b = new StringBuilder();
    for (char c : s.toCharArray()) {
      switch (c) {
        case 'ä': b.append("ae"); break;
        case 'ö': b.append("oe"); break;
        case 'ü': b.append("ue"); break;
        case 'Ä': b.append("Ae"); break;
        case 'Ö': b.append("Oe"); break;
        case 'Ü': b.append("Ue"); break;
        case 'ß': b.append("ss"); break;
        case '„': case '“': case '”': b.append('"'); break;
        default: b.append(c >= 32 && c < 127 ? c : '?');
      }
    }
    return b.toString().replace("*/", "* /");
  }

  // ============================================================== Bilder

  private void schreibeBilder() {
    zeile("/** Die Bilder der Figuren und der Bühne als PNG, Base64-kodiert. */");
    zeile("final class Bilder {");
    tiefe++;
    zeile("private Bilder() {}");
    for (Map.Entry<String, Kostuem> e : bilder.entrySet()) {
      Kostuem k = e.getValue();
      Bitmap b = buehnenbilder.contains(k) ? halbiert(k) : k.bild;
      ByteArrayOutputStream aus = new ByteArrayOutputStream();
      b.compress(Bitmap.CompressFormat.PNG, 100, aus);
      String daten = Base64.encodeToString(aus.toByteArray(), Base64.NO_WRAP);
      zeile("");
      zeile("static final String[] " + e.getKey() + " = {");
      tiefe++;
      for (int i = 0; i < daten.length(); i += 2000) {
        zeile("\"" + daten.substring(i, Math.min(daten.length(), i + 2000)) + "\",");
      }
      tiefe--;
      zeile("};");
    }
    tiefe--;
    zeile("}");
  }

  /** Bühnenbilder in einfacher Auflösung (480 × 360) — halb so viel Text. */
  private static Bitmap halbiert(Kostuem k) {
    Bitmap b = Bitmap.createBitmap(480, 360, Bitmap.Config.ARGB_8888);
    Canvas c = new Canvas(b);
    c.scale(1 / k.aufloesung, 1 / k.aufloesung);
    c.drawBitmap(k.bild, 240 * k.aufloesung - k.mx, 180 * k.aufloesung - k.my, new Paint(Paint.FILTER_BITMAP_FLAG));
    return b;
  }
}
