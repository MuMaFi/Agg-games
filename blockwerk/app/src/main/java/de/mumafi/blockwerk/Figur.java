package de.mumafi.blockwerk;

import android.graphics.Color;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;

/** Eine Figur auf der Bühne — oder die Bühne selbst, die ebenfalls Skripte
 *  und Bilder hat, aber sich nicht bewegt. Klone teilen sich Skripte und
 *  Kostüme mit ihrem Original. */
final class Figur {
  String name;
  final boolean istBuehne;
  ArrayList<Kostuem> kostueme = new ArrayList<>();
  ArrayList<Block> skripte = new ArrayList<>();
  int kostuem;

  double x, y, richtung = 90, groesse = 100;
  boolean sichtbar = true;
  /** "rundherum", "links-rechts" oder "nicht drehen" */
  String drehtyp = "rundherum";
  double effektFarbe, effektHelligkeit, effektGeist;
  double lautstaerke = 100;
  String instrument = "klavier";

  // Stift: Farbe als Farbton/Sättigung/Helligkeit, je 0 bis 100
  boolean stiftUnten;
  double stiftH = 60, stiftS = 75, stiftV = 97;
  double stiftDicke = 1;

  // Sprech- oder Denkblase
  String blase;
  boolean denkt;
  Object blasenBesitzer;

  // Klone
  Figur original;
  boolean istKlon;

  /** Lage im Skriptbereich, damit beim Wechsel der Figur nichts springt */
  float panX = Float.NaN, panY, zoom = 1;

  Figur(String name, boolean istBuehne) {
    this.name = name;
    this.istBuehne = istBuehne;
  }

  Kostuem aktuell() {
    if (kostueme.isEmpty()) return null;
    if (kostuem < 0 || kostuem >= kostueme.size()) kostuem = 0;
    return kostueme.get(kostuem);
  }

  int stiftFarbe() {
    float[] hsv = {(float) (stiftH * 3.6), (float) (stiftS / 100), (float) (stiftV / 100)};
    return Color.HSVToColor(hsv);
  }

  void setzeStiftFarbe(int farbe) {
    float[] hsv = new float[3];
    Color.colorToHSV(farbe, hsv);
    stiftH = hsv[0] / 3.6;
    stiftS = hsv[1] * 100;
    stiftV = hsv[2] * 100;
  }

  void effekteAus() {
    effektFarbe = effektHelligkeit = effektGeist = 0;
  }

  Figur klon() {
    Figur k = new Figur(name, false);
    Figur o = original != null ? original : this;
    k.original = o;
    k.istKlon = true;
    k.kostueme = kostueme;
    k.skripte = o.skripte;
    k.kostuem = kostuem;
    k.x = x; k.y = y; k.richtung = richtung; k.groesse = groesse;
    k.sichtbar = sichtbar;
    k.drehtyp = drehtyp;
    k.effektFarbe = effektFarbe; k.effektHelligkeit = effektHelligkeit; k.effektGeist = effektGeist;
    k.lautstaerke = lautstaerke;
    k.instrument = instrument;
    k.stiftUnten = stiftUnten;
    k.stiftH = stiftH; k.stiftS = stiftS; k.stiftV = stiftV; k.stiftDicke = stiftDicke;
    return k;
  }

  /** Eigenständige Kopie für „Duplizieren“ im Figurenbereich */
  Figur duplikat(String neuerName) {
    Figur d = new Figur(neuerName, false);
    for (Kostuem k : kostueme) d.kostueme.add(k.kopie());
    for (Block b : skripte) d.skripte.add(b.kopie(true));
    d.kostuem = kostuem;
    d.x = x + 20; d.y = y - 20; d.richtung = richtung; d.groesse = groesse;
    d.sichtbar = sichtbar; d.drehtyp = drehtyp;
    return d;
  }

  JSONObject json() throws JSONException {
    JSONObject o = new JSONObject();
    o.put("name", name);
    o.put("kostuem", kostuem);
    JSONArray ks = new JSONArray();
    for (Kostuem k : kostueme) ks.put(k.json());
    o.put("kostueme", ks);
    JSONArray ss = new JSONArray();
    for (Block b : skripte) ss.put(b.json(true));
    o.put("skripte", ss);
    if (!istBuehne) {
      o.put("x", x);
      o.put("y", y);
      o.put("richtung", richtung);
      o.put("groesse", groesse);
      o.put("sichtbar", sichtbar);
      o.put("drehtyp", drehtyp);
    }
    o.put("lautstaerke", lautstaerke);
    return o;
  }

  static Figur ausJson(JSONObject o, boolean istBuehne) {
    Figur f = new Figur(o.optString("name", istBuehne ? "Bühne" : "Figur"), istBuehne);
    JSONArray ks = o.optJSONArray("kostueme");
    if (ks != null) for (int i = 0; i < ks.length(); i++) {
      JSONObject ko = ks.optJSONObject(i);
      Kostuem k = ko == null ? null : Kostuem.ausJson(ko);
      if (k != null) f.kostueme.add(k);
    }
    if (f.kostueme.isEmpty()) f.kostueme.add(Bibliothek.kostuem(istBuehne ? "weiss" : "ball"));
    f.kostuem = Math.max(0, Math.min(f.kostueme.size() - 1, o.optInt("kostuem", 0)));
    JSONArray ss = o.optJSONArray("skripte");
    if (ss != null) for (int i = 0; i < ss.length(); i++) {
      JSONObject so = ss.optJSONObject(i);
      Block b = so == null ? null : Block.ausJson(so);
      if (b != null) f.skripte.add(b);
    }
    f.x = o.optDouble("x", 0);
    f.y = o.optDouble("y", 0);
    f.richtung = o.optDouble("richtung", 90);
    f.groesse = o.optDouble("groesse", 100);
    f.sichtbar = o.optBoolean("sichtbar", true);
    f.drehtyp = o.optString("drehtyp", "rundherum");
    f.lautstaerke = o.optDouble("lautstaerke", 100);
    return f;
  }
}
