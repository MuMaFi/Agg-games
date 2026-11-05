package de.mumafi.blockwerk;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;

import java.util.ArrayList;
import java.util.List;

/** Zeichnet die Bühne: Bühnenbild, Stiftebene, Figuren, Sprechblasen und
 *  Variablenanzeigen. Die Bühne ist 480 × 360 Einheiten groß, (0|0) liegt in
 *  der Mitte, y wächst nach oben. */
final class Darstellung {
  static final float B = 480, H = 360;

  private final Paint bildFarbe = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
  private final Paint fuell = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Paint rand = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Paint schrift = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final RectF r = new RectF();
  private final Path pfad = new Path();

  Darstellung() {
    rand.setStyle(Paint.Style.STROKE);
    schrift.setTextSize(12);
  }

  /** (0|0) des Canvas ist die linke obere Ecke der Bühne, m Bildpunkte je Einheit. */
  void zeichne(Canvas c, Projekt p, Motor motor, float m, Figur ohne, boolean extras) {
    Kostuem bild = p.buehne.aktuell();
    if (bild != null) {
      c.save();
      c.scale(m / bild.aufloesung, m / bild.aufloesung);
      bildFarbe.setColorFilter(filter(p.buehne));
      bildFarbe.setAlpha(255);
      c.drawBitmap(bild.bild, B / 2 * bild.aufloesung - bild.mx, H / 2 * bild.aufloesung - bild.my, bildFarbe);
      c.restore();
    } else {
      c.drawColor(0xFFFFFFFF);
    }
    if (motor != null && motor.stiftBild != null) {
      c.save();
      c.scale(m / Motor.STIFT_RES, m / Motor.STIFT_RES);
      bildFarbe.setColorFilter(null);
      bildFarbe.setAlpha(255);
      c.drawBitmap(motor.stiftBild, 0, 0, bildFarbe);
      c.restore();
    }
    for (int i = 0; i < p.ebenen.size(); i++) {
      Figur f = p.ebenen.get(i);
      if (f != ohne && f.sichtbar) zeichneFigur(c, f, m);
    }
    if (!extras) return;
    for (int i = 0; i < p.ebenen.size(); i++) {
      Figur f = p.ebenen.get(i);
      if (f.sichtbar && f.blase != null) zeichneBlase(c, f, m);
    }
    zeichneMonitore(c, p, m);
    if (motor != null && !motor.konsole.isEmpty()) zeichneKonsole(c, motor, m);
  }

  private final Paint konsolenSchrift = konsolenSchrift();

  private static Paint konsolenSchrift() {
    Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    p.setTypeface(android.graphics.Typeface.MONOSPACE);
    p.setTextSize(10);
    p.setColor(0xFFE5E7EB);
    return p;
  }

  /** Die letzten Zeilen der Konsole unten auf der Bühne */
  private void zeichneKonsole(Canvas c, Motor motor, float m) {
    int n = Math.min(4, motor.konsole.size());
    float zh = 13, h = n * zh + 8;
    c.save();
    c.scale(m, m);
    fuell.setColor(0xD91F2329);
    c.drawRect(0, H - h, B, H, fuell);
    float y = H - h + 4 + 10;
    for (int i = motor.konsole.size() - n; i < motor.konsole.size(); i++) {
      String z = "> " + motor.konsole.get(i);
      if (z.length() > 76) z = z.substring(0, 76) + "…";
      c.drawText(z, 6, y, konsolenSchrift);
      y += zh;
    }
    c.restore();
  }

  void zeichneFigur(Canvas c, Figur f, float m) {
    Kostuem k = f.aktuell();
    if (k == null) return;
    double s = f.groesse / 100.0;
    c.save();
    c.translate((float) ((f.x + B / 2) * m), (float) ((H / 2 - f.y) * m));
    float sx = (float) (s * m / k.aufloesung), sy = sx;
    if (f.drehtyp.equals("rundherum")) c.rotate((float) (f.richtung - 90));
    else if (f.drehtyp.equals("links-rechts") && f.richtung < 0) sx = -sx;
    c.scale(sx, sy);
    bildFarbe.setColorFilter(filter(f));
    bildFarbe.setAlpha(alpha(f));
    c.drawBitmap(k.bild, -k.mx, -k.my, bildFarbe);
    c.restore();
  }

  static int alpha(Figur f) {
    double g = Math.max(0, Math.min(100, f.effektGeist));
    return (int) Math.round(255 * (1 - g / 100));
  }

  static ColorMatrixColorFilter filter(Figur f) {
    if (f.effektFarbe == 0 && f.effektHelligkeit == 0) return null;
    ColorMatrix cm = new ColorMatrix();
    if (f.effektFarbe != 0) {
      double grad = (((f.effektFarbe % 200) + 200) % 200) * 1.8;
      double a = Math.toRadians(grad);
      float co = (float) Math.cos(a), si = (float) Math.sin(a);
      cm.set(new float[]{
          0.213f + co * 0.787f - si * 0.213f, 0.715f - co * 0.715f - si * 0.715f, 0.072f - co * 0.072f + si * 0.928f, 0, 0,
          0.213f - co * 0.213f + si * 0.143f, 0.715f + co * 0.285f + si * 0.140f, 0.072f - co * 0.072f - si * 0.283f, 0, 0,
          0.213f - co * 0.213f - si * 0.787f, 0.715f - co * 0.715f + si * 0.715f, 0.072f + co * 0.928f + si * 0.072f, 0, 0,
          0, 0, 0, 1, 0});
    }
    if (f.effektHelligkeit != 0) {
      float o = (float) (Math.max(-100, Math.min(100, f.effektHelligkeit)) * 2.55);
      cm.postConcat(new ColorMatrix(new float[]{1, 0, 0, 0, o, 0, 1, 0, 0, o, 0, 0, 1, 0, o, 0, 0, 0, 1, 0}));
    }
    return new ColorMatrixColorFilter(cm);
  }

  // ------------------------------------------------------------- Geometrie

  /** Umriss der Figur auf der Bühne: {links, rechts, unten, oben}, y nach oben. */
  static double[] grenzen(Figur f) {
    Kostuem k = f.aktuell();
    if (k == null) return new double[]{f.x, f.x, f.y, f.y};
    double s = f.groesse / 100.0, res = k.aufloesung;
    double l = -k.mx / res, re = (k.bild.getWidth() - k.mx) / res;
    double o = k.my / res, u = -(k.bild.getHeight() - k.my) / res;
    if (f.drehtyp.equals("links-rechts") && f.richtung < 0) { double t = l; l = -re; re = -t; }
    double winkel = f.drehtyp.equals("rundherum") ? Math.toRadians(f.richtung - 90) : 0;
    double co = Math.cos(winkel), si = Math.sin(winkel);
    double minX = Double.MAX_VALUE, maxX = -Double.MAX_VALUE, minY = Double.MAX_VALUE, maxY = -Double.MAX_VALUE;
    double[][] ecken = {{l, o}, {re, o}, {l, u}, {re, u}};
    for (double[] e : ecken) {
      double x = (e[0] * co + e[1] * si) * s, y = (-e[0] * si + e[1] * co) * s;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return new double[]{f.x + minX, f.x + maxX, f.y + minY, f.y + maxY};
  }

  /** Ist an diesem Bühnenpunkt ein sichtbarer Bildpunkt der Figur? */
  static boolean deckend(Figur f, double px, double py) {
    Kostuem k = f.aktuell();
    if (k == null || f.groesse <= 0) return false;
    double s = f.groesse / 100.0;
    double dx = (px - f.x) / s, dy = (py - f.y) / s;
    double lx = dx, ly = dy;
    if (f.drehtyp.equals("rundherum")) {
      double a = Math.toRadians(f.richtung - 90), co = Math.cos(a), si = Math.sin(a);
      lx = dx * co - dy * si;
      ly = dx * si + dy * co;
    } else if (f.drehtyp.equals("links-rechts") && f.richtung < 0) {
      lx = -lx;
    }
    int bx = (int) Math.floor(k.mx + lx * k.aufloesung);
    int by = (int) Math.floor(k.my - ly * k.aufloesung);
    return k.deckend(bx, by);
  }

  // ------------------------------------------------------------- Blasen

  private List<String> umbrechen(String text, float max) {
    List<String> zeilen = new ArrayList<>();
    for (String absatz : text.split("\n")) {
      StringBuilder z = new StringBuilder();
      for (String wort : absatz.split(" ")) {
        String probe = z.length() == 0 ? wort : z + " " + wort;
        if (schrift.measureText(probe) <= max || z.length() == 0) {
          z.setLength(0);
          z.append(probe);
          // Überlange Wörter hart trennen
          while (schrift.measureText(z.toString()) > max && z.length() > 1) {
            int n = z.length() - 1;
            while (n > 1 && schrift.measureText(z.substring(0, n)) > max) n--;
            zeilen.add(z.substring(0, n));
            z.delete(0, n);
          }
        } else {
          zeilen.add(z.toString());
          z.setLength(0);
          z.append(wort);
        }
      }
      zeilen.add(z.toString());
      if (zeilen.size() > 12) break;
    }
    return zeilen;
  }

  private void zeichneBlase(Canvas c, Figur f, float m) {
    String text = f.blase;
    if (text.isEmpty()) return;
    if (text.length() > 330) text = text.substring(0, 330) + "…";
    schrift.setTextSize(12);
    List<String> zeilen = umbrechen(text, 150);
    float breit = 0;
    for (String z : zeilen) breit = Math.max(breit, schrift.measureText(z));
    float pad = 8, zh = 15;
    float bw = Math.max(36, breit + pad * 2), bh = zeilen.size() * zh + pad * 2 - 3;
    double[] g = grenzen(f);
    float spitzeX = (float) (g[1] + B / 2) - 4, spitzeY = (float) (H / 2 - g[3]) + 2;
    boolean rechts = true;
    float bx = spitzeX, by = spitzeY - bh - 12;
    if (bx + bw > B) { rechts = false; spitzeX = (float) (g[0] + B / 2) + 4; bx = spitzeX - bw; }
    bx = Math.max(2, Math.min(B - bw - 2, bx));
    by = Math.max(2, Math.min(H - bh - 2, by));
    spitzeX = Math.max(2, Math.min(B - 2, spitzeX));
    spitzeY = Math.max(by + bh + 4, Math.min(H - 2, spitzeY));

    c.save();
    c.scale(m, m);
    fuell.setColor(0xFFFFFFFF);
    rand.setColor(0xFF9CA3AF);
    rand.setStrokeWidth(1.4f);
    r.set(bx, by, bx + bw, by + bh);
    if (f.denkt) {
      c.drawRoundRect(r, 8, 8, fuell);
      c.drawRoundRect(r, 8, 8, rand);
      float ax = rechts ? bx + 14 : bx + bw - 14;
      float dx = (spitzeX - ax), dy = (spitzeY - (by + bh));
      for (int i = 1; i <= 2; i++) {
        float t = i / 3f, rad = 4.5f - i * 1.4f;
        c.drawCircle(ax + dx * t, by + bh + dy * t + 2, rad, fuell);
        c.drawCircle(ax + dx * t, by + bh + dy * t + 2, rad, rand);
      }
    } else {
      float ax = rechts ? bx + 12 : bx + bw - 28;
      pfad.reset();
      pfad.addRoundRect(r, 5, 5, Path.Direction.CW);
      Path spitze = new Path();
      spitze.moveTo(ax, by + bh - 1);
      spitze.lineTo(spitzeX, spitzeY);
      spitze.lineTo(ax + 16, by + bh - 1);
      spitze.close();
      pfad.op(spitze, Path.Op.UNION);
      c.drawPath(pfad, fuell);
      c.drawPath(pfad, rand);
    }
    schrift.setColor(0xFF111827);
    float y = by + pad + 11;
    for (String z : zeilen) {
      c.drawText(z, bx + pad, y, schrift);
      y += zh;
    }
    c.restore();
  }

  // ------------------------------------------------------------- Monitore

  private void zeichneMonitore(Canvas c, Projekt p, float m) {
    if (p.monitore.isEmpty()) return;
    c.save();
    c.scale(m, m);
    float y = 5;
    schrift.setTextSize(11);
    for (String name : p.monitore) {
      Object v = p.variablen.get(name);
      if (v == null && !p.variablen.containsKey(name)) continue;
      String wert = Werte.text(v);
      if (wert.length() > 40) wert = wert.substring(0, 40) + "…";
      float nw = schrift.measureText(name);
      schrift.setFakeBoldText(true);
      float ww = Math.max(26, schrift.measureText(wert) + 12);
      schrift.setFakeBoldText(false);
      float bw = nw + ww + 16, bh = 22;
      r.set(5, y, 5 + bw, y + bh);
      fuell.setColor(0xF2F3F4F6);
      c.drawRoundRect(r, 3, 3, fuell);
      rand.setColor(0xFFD1D5DB);
      rand.setStrokeWidth(1);
      c.drawRoundRect(r, 3, 3, rand);
      schrift.setColor(0xFF374151);
      c.drawText(name, 11, y + 15, schrift);
      r.set(11 + nw + 5, y + 3, 11 + nw + 5 + ww, y + bh - 3);
      fuell.setColor(Kategorie.VARIABLEN.farbe);
      c.drawRoundRect(r, 3, 3, fuell);
      schrift.setColor(0xFFFFFFFF);
      schrift.setFakeBoldText(true);
      c.drawText(wert, r.centerX() - schrift.measureText(wert) / 2, y + 15, schrift);
      schrift.setFakeBoldText(false);
      y += bh + 4;
      if (y > H - 20) break;
    }
    schrift.setTextSize(12);
    c.restore();
  }

  /** Kleines Vorschaubild eines Kostüms für Listen */
  static Bitmap vorschau(Kostuem k, int groesse) {
    Bitmap b = Bitmap.createBitmap(groesse, groesse, Bitmap.Config.ARGB_8888);
    if (k == null) return b;
    Canvas c = new Canvas(b);
    float s = Math.min(groesse / (float) k.bild.getWidth(), groesse / (float) k.bild.getHeight());
    c.translate((groesse - k.bild.getWidth() * s) / 2, (groesse - k.bild.getHeight() * s) / 2);
    c.scale(s, s);
    c.drawBitmap(k.bild, 0, 0, new Paint(Paint.FILTER_BITMAP_FLAG));
    return b;
  }
}
