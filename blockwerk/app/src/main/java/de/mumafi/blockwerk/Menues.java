package de.mumafi.blockwerk;

import java.util.ArrayList;
import java.util.List;

/** Die Auswahllisten der Blockfelder. Jeder Eintrag ist {Wert, Anzeige}. Werte
 *  mit Unterstrichen (_finger_, _rand_ …) sind feste Begriffe, alles andere
 *  sind Namen von Figuren, Kostümen, Variablen oder Nachrichten. */
final class Menues {
  private Menues() {}

  static final String NEU = "_neu_";

  static List<String[]> eintraege(String menue, Projekt p, Figur z) {
    List<String[]> l = new ArrayList<>();
    switch (menue) {
      case "taste":
        l.add(e("leertaste", "Leertaste"));
        l.add(e("oben", "Pfeil nach oben"));
        l.add(e("unten", "Pfeil nach unten"));
        l.add(e("links", "Pfeil nach links"));
        l.add(e("rechts", "Pfeil nach rechts"));
        l.add(e("beliebig", "beliebige"));
        for (char c = 'a'; c <= 'z'; c++) l.add(e(String.valueOf(c), String.valueOf(c)));
        for (char c = '0'; c <= '9'; c++) l.add(e(String.valueOf(c), String.valueOf(c)));
        break;
      case "nachricht":
        if (p == null) break;
        for (String n : p.nachrichten) l.add(e(n, n));
        l.add(e(NEU, "Neue Nachricht …"));
        break;
      case "variable":
        if (p == null) break;
        for (String n : p.variablen.keySet()) l.add(e(n, n));
        l.add(e(NEU, "Neue Variable …"));
        break;
      case "ziel":
        l.add(e("_zufall_", "Zufallsposition"));
        l.add(e("_finger_", "Finger"));
        andereFiguren(l, p, z);
        break;
      case "zielRichtung":
      case "entfernung":
        l.add(e("_finger_", "Finger"));
        andereFiguren(l, p, z);
        break;
      case "beruehrt":
        l.add(e("_finger_", "Finger"));
        l.add(e("_rand_", "Rand"));
        andereFiguren(l, p, z);
        break;
      case "klon":
        if (z != null && !z.istBuehne) l.add(e("_selbst_", "mir selbst"));
        andereFiguren(l, p, z);
        break;
      case "kostuem":
        if (z != null) for (Kostuem k : z.kostueme) l.add(e(k.name, k.name));
        break;
      case "buehnenbild":
        if (p != null) for (Kostuem k : p.buehne.kostueme) l.add(e(k.name, k.name));
        l.add(e("_naechstes_", "nächstes Bühnenbild"));
        l.add(e("_vorheriges_", "vorheriges Bühnenbild"));
        l.add(e("_zufall_", "zufälliges Bühnenbild"));
        break;
      case "effekt":
        l.add(e("farbe", "Farbe"));
        l.add(e("helligkeit", "Helligkeit"));
        l.add(e("geist", "Durchsichtigkeit"));
        break;
      case "ebene":
        l.add(e("vorderste", "vorderste"));
        l.add(e("hinterste", "hinterste"));
        break;
      case "ebenenRichtung":
        l.add(e("vor", "nach vorne"));
        l.add(e("zurueck", "nach hinten"));
        break;
      case "nummerName":
        l.add(e("nummer", "Nummer"));
        l.add(e("name", "Name"));
        break;
      case "klang":
        for (String[] k : Klang.KLAENGE) l.add(e(k[0], k[1]));
        break;
      case "instrument":
        for (String[] k : Klang.INSTRUMENTE) l.add(e(k[0], k[1]));
        break;
      case "stopp":
        l.add(e("alles", "alles"));
        l.add(e("skript", "dieses Skript"));
        break;
      case "drehtyp":
        l.add(e("links-rechts", "links-rechts"));
        l.add(e("nicht drehen", "nicht drehen"));
        l.add(e("rundherum", "rundherum"));
        break;
      case "neigung":
        l.add(e("lr", "links-rechts"));
        l.add(e("vz", "vor-zurück"));
        break;
      case "eigenschaft":
        l.add(e("x", "x-Position"));
        l.add(e("y", "y-Position"));
        l.add(e("richtung", "Richtung"));
        l.add(e("kostuemNr", "Kostümnummer"));
        l.add(e("kostuemName", "Kostümname"));
        l.add(e("groesse", "Größe"));
        l.add(e("lautstaerke", "Lautstärke"));
        break;
      case "objekt":
        if (p != null) for (Figur f : p.figuren) l.add(e(f.name, f.name));
        l.add(e("_buehne_", "Bühne"));
        break;
      case "zeit":
        l.add(e("jahr", "Jahr"));
        l.add(e("monat", "Monat"));
        l.add(e("tag", "Tag"));
        l.add(e("wochentag", "Wochentag"));
        l.add(e("stunde", "Stunde"));
        l.add(e("minute", "Minute"));
        l.add(e("sekunde", "Sekunde"));
        break;
      case "mathe":
        l.add(e("betrag", "Betrag"));
        l.add(e("ab", "abgerundet"));
        l.add(e("auf", "aufgerundet"));
        l.add(e("wurzel", "Wurzel"));
        l.add(e("sin", "sin"));
        l.add(e("cos", "cos"));
        l.add(e("tan", "tan"));
        l.add(e("asin", "asin"));
        l.add(e("acos", "acos"));
        l.add(e("atan", "atan"));
        l.add(e("ln", "ln"));
        l.add(e("log", "log"));
        l.add(e("e^", "e ^"));
        l.add(e("10^", "10 ^"));
        break;
      default:
        break;
    }
    return l;
  }

  private static void andereFiguren(List<String[]> l, Projekt p, Figur z) {
    if (p == null) return;
    for (Figur f : p.figuren) if (f != z && (z == null || f != z.original)) l.add(e(f.name, f.name));
  }

  private static String[] e(String wert, String anzeige) { return new String[]{wert, anzeige}; }

  static String erster(String menue, Projekt p, Figur z) {
    for (String[] e : eintraege(menue, p, z)) if (!e[0].equals(NEU)) return e[0];
    return "";
  }

  static String anzeige(String menue, String wert, Projekt p, Figur z) {
    if (wert == null) return "";
    switch (wert) {
      case "_finger_": return "Finger";
      case "_rand_": return "Rand";
      case "_selbst_": return "mir selbst";
      case "_buehne_": return "Bühne";
      case "_naechstes_": return "nächstes Bühnenbild";
      case "_vorheriges_": return "vorheriges Bühnenbild";
      case "_zufall_": return menue.equals("buehnenbild") ? "zufälliges Bühnenbild" : "Zufallsposition";
      default: break;
    }
    // Feste Begriffe ohne Projekt auflösen
    if (menue.equals("taste") || menue.equals("effekt") || menue.equals("klang")
        || menue.equals("instrument") || menue.equals("mathe") || menue.equals("zeit")
        || menue.equals("eigenschaft") || menue.equals("neigung") || menue.equals("stopp")
        || menue.equals("ebenenRichtung") || menue.equals("nummerName")) {
      for (String[] e : eintraege(menue, p, z)) if (e[0].equals(wert)) return e[1];
    }
    return wert;
  }
}
