package de.mumafi.blockwerk;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;

/** Alles, was gespeichert wird: Bühne, Figuren, Variablen, Nachrichten. */
final class Projekt {
  String name = "Mein Projekt";
  Figur buehne;
  /** Figuren in der Reihenfolge des Figurenbereichs (ohne Klone) */
  final ArrayList<Figur> figuren = new ArrayList<>();
  /** Zeichenreihenfolge von hinten nach vorn, samt Klonen */
  final ArrayList<Figur> ebenen = new ArrayList<>();
  final LinkedHashMap<String, Object> variablen = new LinkedHashMap<>();
  final LinkedHashSet<String> monitore = new LinkedHashSet<>();
  final ArrayList<String> nachrichten = new ArrayList<>();

  static Projekt neu() {
    Projekt p = new Projekt();
    p.buehne = new Figur("Bühne", true);
    p.buehne.kostueme.add(Bibliothek.kostuem("weiss"));
    Figur zeiger = new Figur("Zeiger", false);
    zeiger.kostueme.add(Bibliothek.kostuem("zeiger"));
    p.neueFigur(zeiger);
    p.variablen.put("meine Variable", 0.0);
    p.nachrichten.add("Nachricht1");
    return p;
  }

  void neueFigur(Figur f) {
    figuren.add(f);
    ebenen.add(f);
  }

  void entferneFigur(Figur f) {
    figuren.remove(f);
    Iterator<Figur> it = ebenen.iterator();
    while (it.hasNext()) {
      Figur e = it.next();
      if (e == f || e.original == f) it.remove();
    }
  }

  Figur figur(String name) {
    for (Figur f : figuren) if (f.name.equals(name)) return f;
    return null;
  }

  String freierName(String basis) {
    if (figur(basis) == null && !basis.equals("Bühne")) return basis;
    for (int i = 2; ; i++) {
      String n = basis + i;
      if (figur(n) == null) return n;
    }
  }

  /** Nimmt Namen von Nachrichten auf, die in Skripten vorkommen, aber noch
   *  nicht in der Liste stehen (etwa nach dem Laden). */
  void nachrichtenSammeln() {
    ArrayList<Figur> alle = new ArrayList<>(figuren);
    alle.add(buehne);
    for (Figur f : alle) for (Block b : f.skripte) sammle(b);
    if (nachrichten.isEmpty()) nachrichten.add("Nachricht1");
  }

  private void sammle(Block b) {
    for (; b != null; b = b.next) {
      for (int i = 0; i < b.werte.length; i++) {
        if ("nachricht".equals(b.spec.slotMenue[i]) && b.args[i] == null) {
          String n = b.werte[i];
          if (n != null && !n.isEmpty() && !nachrichten.contains(n)) nachrichten.add(n);
        }
        if (b.args[i] != null) sammle(b.args[i]);
      }
      for (Block s : b.sub) sammle(s);
    }
  }

  // ------------------------------------------------------------- Speichern

  JSONObject json() throws JSONException {
    JSONObject o = new JSONObject();
    o.put("format", "blockwerk");
    o.put("version", 1);
    o.put("name", name);
    o.put("buehne", buehne.json());
    JSONArray fs = new JSONArray();
    for (Figur f : figuren) {
      JSONObject fo = f.json();
      fo.put("ebene", ebenen.indexOf(f));
      fs.put(fo);
    }
    o.put("figuren", fs);
    JSONObject vs = new JSONObject();
    for (String k : variablen.keySet()) {
      Object v = variablen.get(k);
      vs.put(k, v instanceof Double ? v : Werte.text(v));
    }
    o.put("variablen", vs);
    o.put("monitore", new JSONArray(monitore));
    o.put("nachrichten", new JSONArray(nachrichten));
    return o;
  }

  static Projekt ausJson(JSONObject o) throws JSONException {
    if (!o.has("buehne")) throw new JSONException("Keine Blockwerk-Datei");
    Projekt p = new Projekt();
    p.name = o.optString("name", "Projekt");
    p.buehne = Figur.ausJson(o.getJSONObject("buehne"), true);
    JSONArray fs = o.optJSONArray("figuren");
    final ArrayList<Integer> lagen = new ArrayList<>();
    if (fs != null) for (int i = 0; i < fs.length(); i++) {
      JSONObject fo = fs.optJSONObject(i);
      if (fo == null) continue;
      p.figuren.add(Figur.ausJson(fo, false));
      lagen.add(fo.optInt("ebene", i));
    }
    ArrayList<Integer> ordnung = new ArrayList<>();
    for (int i = 0; i < p.figuren.size(); i++) ordnung.add(i);
    ordnung.sort((a, b) -> Integer.compare(lagen.get(a), lagen.get(b)));
    for (int i : ordnung) p.ebenen.add(p.figuren.get(i));
    JSONObject vs = o.optJSONObject("variablen");
    if (vs != null) {
      Iterator<String> it = vs.keys();
      while (it.hasNext()) {
        String k = it.next();
        Object v = vs.opt(k);
        p.variablen.put(k, v instanceof Number ? (Object) ((Number) v).doubleValue() : String.valueOf(v));
      }
    }
    JSONArray ms = o.optJSONArray("monitore");
    if (ms != null) for (int i = 0; i < ms.length(); i++) {
      String m = ms.optString(i);
      if (p.variablen.containsKey(m)) p.monitore.add(m);
    }
    JSONArray ns = o.optJSONArray("nachrichten");
    if (ns != null) for (int i = 0; i < ns.length(); i++) {
      String n = ns.optString(i);
      if (!n.isEmpty() && !p.nachrichten.contains(n)) p.nachrichten.add(n);
    }
    p.nachrichtenSammeln();
    return p;
  }
}
