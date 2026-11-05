package de.mumafi.blockwerk;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;

/** Ein Aussehen einer Figur oder ein Bühnenbild: ein Bild mit Drehpunkt.
 *  Bilder aus der Bibliothek merken sich nur ihre Kennung, gemalte oder
 *  fotografierte werden als PNG gespeichert. */
final class Kostuem {
  String name;
  Bitmap bild;
  /** Drehpunkt in Bildpunkten */
  float mx, my;
  /** Bildpunkte je Bühneneinheit */
  float aufloesung = 2;
  /** Bibliotheks-Kennung, solange das Bild unverändert ist */
  String bib;

  private int[] pixel;

  Kostuem(String name, Bitmap bild, float mx, float my, float aufloesung) {
    this.name = name;
    this.bild = bild;
    this.mx = mx;
    this.my = my;
    this.aufloesung = aufloesung;
  }

  /** Breite und Höhe in Bühneneinheiten */
  float breite() { return bild.getWidth() / aufloesung; }
  float hoehe() { return bild.getHeight() / aufloesung; }

  /** Ist der Bildpunkt (in Bildkoordinaten) sichtbar? */
  boolean deckend(int px, int py) {
    int bw = bild.getWidth(), bh = bild.getHeight();
    if (px < 0 || py < 0 || px >= bw || py >= bh) return false;
    if (pixel == null) {
      pixel = new int[bw * bh];
      bild.getPixels(pixel, 0, bw, 0, 0, bw, bh);
    }
    return (pixel[py * bw + px] >>> 24) > 40;
  }

  /** Nach einer Änderung am Bild aufrufen. */
  void bildGeaendert(Bitmap neu) {
    bild = neu;
    pixel = null;
    bib = null;
  }

  Kostuem kopie() {
    Kostuem k = new Kostuem(name, bild, mx, my, aufloesung);
    k.bib = bib;
    return k;
  }

  JSONObject json() throws JSONException {
    JSONObject o = new JSONObject();
    o.put("name", name);
    if (bib != null) {
      o.put("bib", bib);
    } else {
      ByteArrayOutputStream aus = new ByteArrayOutputStream();
      bild.compress(Bitmap.CompressFormat.PNG, 100, aus);
      o.put("png", Base64.encodeToString(aus.toByteArray(), Base64.NO_WRAP));
      o.put("mx", (double) mx);
      o.put("my", (double) my);
      o.put("res", (double) aufloesung);
    }
    return o;
  }

  static Kostuem ausJson(JSONObject o) {
    String name = o.optString("name", "Kostüm");
    String bib = o.optString("bib", null);
    if (bib != null && !bib.isEmpty()) {
      Kostuem k = Bibliothek.kostuem(bib);
      if (k != null) { k.name = name; return k; }
    }
    String png = o.optString("png", null);
    if (png == null || png.isEmpty()) return null;
    try {
      byte[] daten = Base64.decode(png, Base64.DEFAULT);
      BitmapFactory.Options opt = new BitmapFactory.Options();
      opt.inMutable = true;
      Bitmap b = BitmapFactory.decodeByteArray(daten, 0, daten.length, opt);
      if (b == null) return null;
      if (b.getConfig() != Bitmap.Config.ARGB_8888) b = b.copy(Bitmap.Config.ARGB_8888, true);
      return new Kostuem(name, b, (float) o.optDouble("mx", b.getWidth() / 2.0),
          (float) o.optDouble("my", b.getHeight() / 2.0), (float) o.optDouble("res", 2));
    } catch (IllegalArgumentException e) {
      return null;
    }
  }
}
