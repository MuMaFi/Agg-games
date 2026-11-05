package de.mumafi.blockwerk;

import static de.mumafi.blockwerk.Kategorie.*;
import static de.mumafi.blockwerk.Spec.Form.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Alle Blöcke, in der Reihenfolge, in der die Palette sie zeigt. */
final class Bloecke {
  private Bloecke() {}

  static final List<Spec> ALLE = new ArrayList<>();
  private static final Map<String, Spec> NACH_OP = new HashMap<>();

  static Spec spec(String op) { return NACH_OP.get(op); }

  private static Spec def(String op, Kategorie k, Spec.Form f, String text, String... vorgaben) {
    return def(op, k, f, 0, text, vorgaben);
  }

  private static Spec def(String op, Kategorie k, Spec.Form f, int muender, String text, String... vorgaben) {
    Spec s = new Spec(op, k, f, muender, text, vorgaben);
    ALLE.add(s);
    NACH_OP.put(op, s);
    return s;
  }

  static {
    // ---------------------------------------------------------- Bewegung
    def("bewegung.gehe", BEWEGUNG, BEFEHL, "gehe %n Schritte", "10").nurFigur();
    def("bewegung.rechts", BEWEGUNG, BEFEHL, "drehe dich @rechts um %n Grad", "15").nurFigur();
    def("bewegung.links", BEWEGUNG, BEFEHL, "drehe dich @links um %n Grad", "15").nurFigur();
    def("bewegung.gehezu", BEWEGUNG, BEFEHL, "gehe zu %D:ziel", "_zufall_").nurFigur();
    def("bewegung.gehezuxy", BEWEGUNG, BEFEHL, "gehe zu x: %n y: %n", "$x", "$y").nurFigur();
    def("bewegung.gleitezu", BEWEGUNG, BEFEHL, "gleite in %n Sek. zu %D:ziel", "1", "_zufall_").nurFigur();
    def("bewegung.gleitexy", BEWEGUNG, BEFEHL, "gleite in %n Sek. zu x: %n y: %n", "1", "$x", "$y").nurFigur();
    def("bewegung.richtung", BEWEGUNG, BEFEHL, "setze Richtung auf %n Grad", "90").nurFigur();
    def("bewegung.drehezu", BEWEGUNG, BEFEHL, "drehe dich zu %D:zielRichtung", "_finger_").nurFigur();
    def("bewegung.aendereX", BEWEGUNG, BEFEHL, "ändere x um %n", "10").nurFigur();
    def("bewegung.setzeX", BEWEGUNG, BEFEHL, "setze x auf %n", "0").nurFigur();
    def("bewegung.aendereY", BEWEGUNG, BEFEHL, "ändere y um %n", "10").nurFigur();
    def("bewegung.setzeY", BEWEGUNG, BEFEHL, "setze y auf %n", "0").nurFigur();
    def("bewegung.abprallen", BEWEGUNG, BEFEHL, "pralle vom Rand ab").nurFigur();
    def("bewegung.drehtyp", BEWEGUNG, BEFEHL, "setze Drehtyp auf %d:drehtyp", "links-rechts").nurFigur();
    def("bewegung.x", BEWEGUNG, WERT, "x-Position").nurFigur();
    def("bewegung.y", BEWEGUNG, WERT, "y-Position").nurFigur();
    def("bewegung.r", BEWEGUNG, WERT, "Richtung").nurFigur();

    // ---------------------------------------------------------- Aussehen
    def("aussehen.sageZeit", AUSSEHEN, BEFEHL, "sage %s für %n Sekunden", "Hallo!", "2").nurFigur();
    def("aussehen.sage", AUSSEHEN, BEFEHL, "sage %s", "Hallo!").nurFigur();
    def("aussehen.denkeZeit", AUSSEHEN, BEFEHL, "denke %s für %n Sekunden", "Hmm …", "2").nurFigur();
    def("aussehen.denke", AUSSEHEN, BEFEHL, "denke %s", "Hmm …").nurFigur();
    def("aussehen.kostuem", AUSSEHEN, BEFEHL, "wechsle zu Kostüm %D:kostuem", "$erste").nurFigur();
    def("aussehen.naechstesKostuem", AUSSEHEN, BEFEHL, "nächstes Kostüm").nurFigur();
    def("aussehen.bild", AUSSEHEN, BEFEHL, "wechsle zu Bühnenbild %D:buehnenbild", "$erste");
    def("aussehen.naechstesBild", AUSSEHEN, BEFEHL, "nächstes Bühnenbild");
    def("aussehen.aendereGroesse", AUSSEHEN, BEFEHL, "ändere Größe um %n", "10").nurFigur();
    def("aussehen.setzeGroesse", AUSSEHEN, BEFEHL, "setze Größe auf %n %", "100").nurFigur();
    def("aussehen.aendereEffekt", AUSSEHEN, BEFEHL, "ändere Effekt %d:effekt um %n", "farbe", "25");
    def("aussehen.setzeEffekt", AUSSEHEN, BEFEHL, "setze Effekt %d:effekt auf %n", "farbe", "0");
    def("aussehen.effekteAus", AUSSEHEN, BEFEHL, "schalte Grafikeffekte aus");
    def("aussehen.zeige", AUSSEHEN, BEFEHL, "zeige dich").nurFigur();
    def("aussehen.verstecke", AUSSEHEN, BEFEHL, "verstecke dich").nurFigur();
    def("aussehen.ebene", AUSSEHEN, BEFEHL, "gehe zur %d:ebene Ebene", "vorderste").nurFigur();
    def("aussehen.ebenen", AUSSEHEN, BEFEHL, "gehe %n Ebenen %d:ebenenRichtung", "1", "vor").nurFigur();
    def("aussehen.kostuemWert", AUSSEHEN, WERT, "Kostüm %d:nummerName", "nummer").nurFigur();
    def("aussehen.bildWert", AUSSEHEN, WERT, "Bühnenbild %d:nummerName", "nummer");
    def("aussehen.groesse", AUSSEHEN, WERT, "Größe").nurFigur();

    // ---------------------------------------------------------- Klang
    def("klang.spieleGanz", KLANG, BEFEHL, "spiele Klang %D:klang ganz", "plopp");
    def("klang.spiele", KLANG, BEFEHL, "spiele Klang %D:klang", "plopp");
    def("klang.note", KLANG, BEFEHL, "spiele Note %n für %n Sekunden", "60", "0.5");
    def("klang.instrument", KLANG, BEFEHL, "setze Instrument auf %d:instrument", "klavier");
    def("klang.stoppe", KLANG, BEFEHL, "stoppe alle Klänge");
    def("klang.aendereLautstaerke", KLANG, BEFEHL, "ändere Lautstärke um %n", "-10");
    def("klang.setzeLautstaerke", KLANG, BEFEHL, "setze Lautstärke auf %n %", "100");
    def("klang.lautstaerke", KLANG, WERT, "Lautstärke");

    // ---------------------------------------------------------- Ereignisse
    def("ereignis.flagge", EREIGNISSE, HUT, "Wenn @flagge angeklickt");
    def("ereignis.taste", EREIGNISSE, HUT, "Wenn Taste %d:taste gedrückt", "leertaste");
    def("ereignis.figurAngetippt", EREIGNISSE, HUT, "Wenn diese Figur angetippt").nurFigur();
    def("ereignis.buehneAngetippt", EREIGNISSE, HUT, "Wenn Bühne angetippt").nurBuehne();
    def("ereignis.bildWechsel", EREIGNISSE, HUT, "Wenn Bühnenbild zu %d:buehnenbild wechselt", "$erste");
    def("ereignis.empfange", EREIGNISSE, HUT, "Wenn ich %d:nachricht empfange", "$erste");
    def("ereignis.sende", EREIGNISSE, BEFEHL, "sende %D:nachricht an alle", "$erste");
    def("ereignis.sendeWarte", EREIGNISSE, BEFEHL, "sende %D:nachricht an alle und warte", "$erste");

    // ---------------------------------------------------------- Steuerung
    def("steuerung.warte", STEUERUNG, BEFEHL, "warte %n Sekunden", "1");
    def("steuerung.wiederhole", STEUERUNG, BEFEHL, 1, "wiederhole %n mal", "10");
    def("steuerung.fortlaufend", STEUERUNG, KAPPE, 1, "wiederhole fortlaufend");
    def("steuerung.falls", STEUERUNG, BEFEHL, 1, "falls %b dann");
    def("steuerung.fallsSonst", STEUERUNG, BEFEHL, 2, "falls %b dann | sonst");
    def("steuerung.warteBis", STEUERUNG, BEFEHL, "warte bis %b");
    def("steuerung.wiederholeBis", STEUERUNG, BEFEHL, 1, "wiederhole bis %b");
    def("steuerung.stoppe", STEUERUNG, KAPPE, "stoppe %d:stopp", "alles");
    def("steuerung.stoppeAndere", STEUERUNG, BEFEHL, "stoppe andere Skripte der Figur");
    def("steuerung.klonStart", STEUERUNG, HUT, "Wenn ich als Klon entstehe").nurFigur();
    def("steuerung.klon", STEUERUNG, BEFEHL, "erzeuge Klon von %D:klon", "_selbst_");
    def("steuerung.loescheKlon", STEUERUNG, KAPPE, "lösche diesen Klon").nurFigur();

    // ---------------------------------------------------------- Fühlen
    def("fuehlen.beruehrt", FUEHLEN, BOOL, "wird %D:beruehrt berührt?", "_finger_").nurFigur();
    def("fuehlen.farbe", FUEHLEN, BOOL, "wird Farbe %f berührt?", "#E8303A").nurFigur();
    def("fuehlen.entfernung", FUEHLEN, WERT, "Entfernung von %D:entfernung", "_finger_").nurFigur();
    def("fuehlen.frage", FUEHLEN, BEFEHL, "frage %s und warte", "Wie heißt du?");
    def("fuehlen.antwort", FUEHLEN, WERT, "Antwort");
    def("fuehlen.taste", FUEHLEN, BOOL, "Taste %D:taste gedrückt?", "leertaste");
    def("fuehlen.fingerUnten", FUEHLEN, BOOL, "Finger auf der Bühne?");
    def("fuehlen.fingerX", FUEHLEN, WERT, "Finger x");
    def("fuehlen.fingerY", FUEHLEN, WERT, "Finger y");
    def("fuehlen.neigung", FUEHLEN, WERT, "Neigung %d:neigung", "lr");
    def("fuehlen.stoppuhr", FUEHLEN, WERT, "Stoppuhr");
    def("fuehlen.stoppuhrNeu", FUEHLEN, BEFEHL, "starte Stoppuhr neu");
    def("fuehlen.eigenschaft", FUEHLEN, WERT, "%d:eigenschaft von %d:objekt", "x", "$erste");
    def("fuehlen.zeit", FUEHLEN, WERT, "aktuelle(s) %d:zeit", "jahr");

    // ---------------------------------------------------------- Operatoren
    def("op.plus", OPERATOREN, WERT, "%n + %n");
    def("op.minus", OPERATOREN, WERT, "%n - %n");
    def("op.mal", OPERATOREN, WERT, "%n * %n");
    def("op.durch", OPERATOREN, WERT, "%n / %n");
    def("op.zufall", OPERATOREN, WERT, "Zufallszahl von %n bis %n", "1", "10");
    def("op.groesser", OPERATOREN, BOOL, "%s > %s", "", "50");
    def("op.kleiner", OPERATOREN, BOOL, "%s < %s", "", "50");
    def("op.gleich", OPERATOREN, BOOL, "%s = %s", "", "50");
    def("op.und", OPERATOREN, BOOL, "%b und %b");
    def("op.oder", OPERATOREN, BOOL, "%b oder %b");
    def("op.nicht", OPERATOREN, BOOL, "nicht %b");
    def("op.verbinde", OPERATOREN, WERT, "verbinde %s und %s", "Apfel ", "Banane");
    def("op.zeichen", OPERATOREN, WERT, "Zeichen %n von %s", "1", "Apfel");
    def("op.laenge", OPERATOREN, WERT, "Länge von %s", "Apfel");
    def("op.enthaelt", OPERATOREN, BOOL, "%s enthält %s ?", "Apfel", "a");
    def("op.mod", OPERATOREN, WERT, "%n mod %n");
    def("op.runde", OPERATOREN, WERT, "%n gerundet");
    def("op.mathe", OPERATOREN, WERT, "%d:mathe von %n", "betrag");

    // ---------------------------------------------------------- Variablen
    def("var.wert", VARIABLEN, WERT, "%v");
    def("var.setze", VARIABLEN, BEFEHL, "setze %d:variable auf %s", "$erste", "0");
    def("var.aendere", VARIABLEN, BEFEHL, "ändere %d:variable um %n", "$erste", "1");
    def("var.zeige", VARIABLEN, BEFEHL, "zeige Variable %d:variable", "$erste");
    def("var.verstecke", VARIABLEN, BEFEHL, "verstecke Variable %d:variable", "$erste");

    // ---------------------------------------------------------- Stift
    def("stift.loesche", STIFT, BEFEHL, "lösche alles");
    def("stift.abdruck", STIFT, BEFEHL, "hinterlasse Abdruck").nurFigur();
    def("stift.runter", STIFT, BEFEHL, "Stift runter").nurFigur();
    def("stift.hoch", STIFT, BEFEHL, "Stift hoch").nurFigur();
    def("stift.farbe", STIFT, BEFEHL, "setze Stiftfarbe auf %f", "#3E8EF7").nurFigur();
    def("stift.aendereFarbton", STIFT, BEFEHL, "ändere Stift-Farbton um %n", "10").nurFigur();
    def("stift.setzeFarbton", STIFT, BEFEHL, "setze Stift-Farbton auf %n", "50").nurFigur();
    def("stift.dicke", STIFT, BEFEHL, "setze Stiftdicke auf %n", "1").nurFigur();
    def("stift.aendereDicke", STIFT, BEFEHL, "ändere Stiftdicke um %n", "1").nurFigur();
  }
}
