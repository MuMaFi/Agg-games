package de.mumafi.blockwerk;

import java.util.ArrayList;
import java.util.List;

/** Die Bauart eines Blocks: was er heißt, wie er aussieht, welche Felder er hat.
 *
 *  Die Beschriftung ist eine Folge von Wörtern. Daraus werden Felder:
 *  <pre>
 *    %n   Zahlenfeld            %s   Textfeld
 *    %b   Bedingungsfeld        %f   Farbfeld
 *    %d:m Auswahl aus Menü m    %D:m Auswahl, nimmt auch Werteblöcke auf
 *    %v   Name einer Variable (nur Anzeige)
 *    @x   Symbol (flagge, rechts, links)
 *    |    neue Zeile — bei Blöcken mit zwei Mündern (falls … sonst)
 *  </pre> */
final class Spec {

  enum Form { HUT, BEFEHL, KAPPE, WERT, BOOL }

  static final int TEXT = 0, SLOT = 1, SYMBOL = 2;

  static final class Teil {
    final int art;
    final String text;
    final int slot;
    Teil(int art, String text, int slot) { this.art = art; this.text = text; this.slot = slot; }
  }

  final String op;
  final Kategorie kat;
  final Form form;
  final int muender;
  final String[] vorgaben;
  final List<Teil[]> zeilen = new ArrayList<>();
  final char[] slotArt;
  final String[] slotMenue;
  boolean nurFigur, nurBuehne;

  Spec(String op, Kategorie kat, Form form, int muender, String text, String... vorgaben) {
    this.op = op;
    this.kat = kat;
    this.form = form;
    this.muender = muender;

    List<Character> arten = new ArrayList<>();
    List<String> menues = new ArrayList<>();
    List<Teil> zeile = new ArrayList<>();
    StringBuilder wort = new StringBuilder();
    for (String t : text.split(" ")) {
      if (t.isEmpty()) continue;
      if (t.equals("|")) {
        textAbschliessen(zeile, wort);
        zeilen.add(zeile.toArray(new Teil[0]));
        zeile = new ArrayList<>();
      } else if (t.length() > 1 && t.charAt(0) == '%') {
        textAbschliessen(zeile, wort);
        char art = t.charAt(1);
        String menue = t.length() > 3 && t.charAt(2) == ':' ? t.substring(3) : null;
        zeile.add(new Teil(SLOT, null, arten.size()));
        arten.add(art);
        menues.add(menue);
      } else if (t.length() > 1 && t.charAt(0) == '@') {
        textAbschliessen(zeile, wort);
        zeile.add(new Teil(SYMBOL, t.substring(1), -1));
      } else {
        if (wort.length() > 0) wort.append(' ');
        wort.append(t);
      }
    }
    textAbschliessen(zeile, wort);
    zeilen.add(zeile.toArray(new Teil[0]));

    slotArt = new char[arten.size()];
    slotMenue = new String[arten.size()];
    for (int i = 0; i < slotArt.length; i++) { slotArt[i] = arten.get(i); slotMenue[i] = menues.get(i); }
    String[] v = new String[slotArt.length];
    for (int i = 0; i < v.length; i++) v[i] = i < vorgaben.length ? vorgaben[i] : "";
    this.vorgaben = v;
  }

  private static void textAbschliessen(List<Teil> zeile, StringBuilder wort) {
    if (wort.length() > 0) { zeile.add(new Teil(TEXT, wort.toString(), -1)); wort.setLength(0); }
  }

  Spec nurFigur() { nurFigur = true; return this; }
  Spec nurBuehne() { nurBuehne = true; return this; }

  int slots() { return slotArt.length; }
  boolean istHut() { return form == Form.HUT; }
  boolean istKappe() { return form == Form.KAPPE; }
  boolean istWert() { return form == Form.WERT || form == Form.BOOL; }
  boolean istBefehl() { return !istWert(); }

  /** Nimmt das Feld einen hineingezogenen Werteblock auf? */
  boolean nimmtBlock(int slot, Spec reporter) {
    char a = slotArt[slot];
    if (a == 'b') return reporter.form == Form.BOOL;
    return a == 'n' || a == 's' || a == 'D';
  }
}
