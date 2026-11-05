package de.mumafi.blockwerk;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;

import java.util.Random;

/** Die eingebauten Figuren und Bühnenbilder. Alle werden zur Laufzeit
 *  gezeichnet — die App bringt keine einzige Bilddatei mit. Figuren schauen
 *  nach rechts (Richtung 90), so drehen sie sich richtig mit. */
final class Bibliothek {
  private Bibliothek() {}

  /** Figuren: Anzeigename, dann die Kennungen ihrer Kostüme */
  static final String[][] FIGUREN = {
      {"Robbi", "robbi1", "robbi2"},
      {"Ball", "ball"},
      {"Stern", "stern"},
      {"Herz", "herz"},
      {"Rakete", "rakete"},
      {"Fisch", "fisch"},
      {"Vogel", "vogel1", "vogel2"},
      {"Käfer", "kaefer"},
      {"Geist", "geist"},
      {"Apfel", "apfel"},
      {"Auto", "auto"},
      {"Baum", "baum"},
      {"Wolke", "wolke"},
      {"Pfeil", "pfeil"},
      {"Quadrat", "quadrat"},
      {"Schläger", "schlaeger"},
      {"Münze", "muenze"},
  };

  static final String[] BUEHNENBILDER = {
      "weiss", "himmel", "wiese", "weltraum", "unterwasser", "nacht", "strand", "gitter"
  };

  static String bildName(String id) {
    switch (id) {
      case "weiss": return "Weiß";
      case "himmel": return "Himmel";
      case "wiese": return "Wiese";
      case "weltraum": return "Weltraum";
      case "unterwasser": return "Unterwasser";
      case "nacht": return "Nacht";
      case "strand": return "Strand";
      case "gitter": return "Koordinaten";
      default: return id;
    }
  }

  static Kostuem kostuem(String id) {
    for (String b : BUEHNENBILDER) if (b.equals(id)) return buehnenbild(id);
    float w, h;
    switch (id) {
      case "robbi1": case "robbi2": w = 100; h = 110; break;
      case "ball": w = 40; h = 40; break;
      case "stern": w = 52; h = 50; break;
      case "herz": w = 46; h = 42; break;
      case "rakete": w = 96; h = 48; break;
      case "fisch": w = 84; h = 52; break;
      case "vogel1": case "vogel2": w = 76; h = 60; break;
      case "kaefer": w = 64; h = 52; break;
      case "geist": w = 60; h = 72; break;
      case "apfel": w = 46; h = 52; break;
      case "auto": w = 110; h = 56; break;
      case "baum": w = 90; h = 120; break;
      case "wolke": w = 110; h = 60; break;
      case "pfeil": w = 72; h = 44; break;
      case "quadrat": w = 50; h = 50; break;
      case "schlaeger": w = 100; h = 18; break;
      case "muenze": w = 40; h = 40; break;
      default: return null;
    }
    float res = 2;
    Bitmap b = Bitmap.createBitmap((int) (w * res), (int) (h * res), Bitmap.Config.ARGB_8888);
    Canvas c = new Canvas(b);
    c.scale(res, res);
    zeichneFigur(c, id);
    Kostuem k = new Kostuem(kostuemName(id), b, w * res / 2, h * res / 2, res);
    k.bib = id;
    return k;
  }

  static String kostuemName(String id) {
    switch (id) {
      case "robbi1": return "Robbi-a";
      case "robbi2": return "Robbi-b";
      case "vogel1": return "Vogel-a";
      case "vogel2": return "Vogel-b";
      case "kaefer": return "Käfer";
      case "schlaeger": return "Schläger";
      case "muenze": return "Münze";
      default: return Character.toUpperCase(id.charAt(0)) + id.substring(1);
    }
  }

  // ------------------------------------------------------------- Figuren

  private static Paint fuell(int farbe) {
    Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    p.setColor(farbe);
    return p;
  }

  private static Paint strich(int farbe, float breite) {
    Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    p.setColor(farbe);
    p.setStyle(Paint.Style.STROKE);
    p.setStrokeWidth(breite);
    p.setStrokeCap(Paint.Cap.ROUND);
    p.setStrokeJoin(Paint.Join.ROUND);
    return p;
  }

  private static void rr(Canvas c, float l, float t, float r, float b, float rad, int farbe, int rand, float rb) {
    RectF f = new RectF(l, t, r, b);
    c.drawRoundRect(f, rad, rad, fuell(farbe));
    if (rb > 0) c.drawRoundRect(f, rad, rad, strich(rand, rb));
  }

  private static void kreis(Canvas c, float x, float y, float r, int farbe) {
    c.drawCircle(x, y, r, fuell(farbe));
  }

  private static void auge(Canvas c, float x, float y, float r, float blickX) {
    kreis(c, x, y, r, 0xFFFFFFFF);
    c.drawCircle(x, y, r, strich(0x33000000, 1));
    kreis(c, x + blickX, y, r * 0.55f, 0xFF1D2433);
    kreis(c, x + blickX + r * 0.18f, y - r * 0.22f, r * 0.18f, 0xFFFFFFFF);
  }

  private static void zeichneFigur(Canvas c, String id) {
    switch (id) {
      case "robbi1": robbi(c, false); break;
      case "robbi2": robbi(c, true); break;
      case "ball": {
        kreis(c, 20, 20, 18, 0xFFFF5A5F);
        Path p = new Path();
        p.addCircle(20, 20, 18, Path.Direction.CW);
        c.save();
        c.clipPath(p);
        c.drawRect(2, 15, 38, 25, fuell(0xFFFFFFFF));
        c.drawRect(2, 17, 38, 23, fuell(0xFF3E8EF7));
        c.restore();
        c.drawCircle(20, 20, 18, strich(0xFFB8333A, 2));
        kreis(c, 13, 11, 4, 0x88FFFFFF);
        break;
      }
      case "stern": {
        Path p = sternPfad(26, 26.5f, 24, 10.5f, 5);
        c.drawPath(p, fuell(0xFFFFD23F));
        c.drawPath(p, strich(0xFFD9A400, 2.4f));
        kreis(c, 22, 25, 2.2f, 0xFF3A2E00);
        kreis(c, 31, 25, 2.2f, 0xFF3A2E00);
        Path m = new Path();
        m.moveTo(22.5f, 30);
        m.quadTo(26.5f, 34, 30.5f, 30);
        c.drawPath(m, strich(0xFF3A2E00, 1.6f));
        break;
      }
      case "herz": {
        Path p = new Path();
        p.moveTo(23, 39);
        p.cubicTo(6, 28, 1, 18, 4, 11);
        p.cubicTo(7, 3, 18, 1, 23, 10);
        p.cubicTo(28, 1, 39, 3, 42, 11);
        p.cubicTo(45, 18, 40, 28, 23, 39);
        p.close();
        c.drawPath(p, fuell(0xFFFF4D6D));
        c.drawPath(p, strich(0xFFC22745, 2));
        kreis(c, 13, 12, 3.5f, 0x88FFFFFF);
        break;
      }
      case "rakete": {
        // Flamme
        Path f = new Path();
        f.moveTo(18, 17); f.lineTo(2, 24); f.lineTo(18, 31); f.close();
        c.drawPath(f, fuell(0xFFFF9F1C));
        Path f2 = new Path();
        f2.moveTo(18, 20); f2.lineTo(8, 24); f2.lineTo(18, 28); f2.close();
        c.drawPath(f2, fuell(0xFFFFE066));
        // Flossen
        Path fl = new Path();
        fl.moveTo(22, 14); fl.lineTo(14, 3); fl.lineTo(32, 14); fl.close();
        fl.moveTo(22, 34); fl.lineTo(14, 45); fl.lineTo(32, 34); fl.close();
        c.drawPath(fl, fuell(0xFFE63946));
        // Rumpf
        Path r = new Path();
        r.moveTo(18, 14);
        r.lineTo(70, 14);
        r.quadTo(90, 18, 94, 24);
        r.quadTo(90, 30, 70, 34);
        r.lineTo(18, 34);
        r.close();
        c.drawPath(r, fuell(0xFFF1F3F8));
        c.drawPath(r, strich(0xFF8D99AE, 1.6f));
        // Spitze
        Path s = new Path();
        s.moveTo(76, 15.2f); s.quadTo(90, 18, 94, 24); s.quadTo(90, 30, 76, 32.8f); s.close();
        c.drawPath(s, fuell(0xFFE63946));
        kreis(c, 56, 24, 6, 0xFF8D99AE);
        kreis(c, 56, 24, 4.5f, 0xFF7FD1FF);
        kreis(c, 54.5f, 22.5f, 1.4f, 0xCCFFFFFF);
        break;
      }
      case "fisch": {
        Path sw = new Path();
        sw.moveTo(20, 26); sw.lineTo(3, 9); sw.quadTo(8, 26, 3, 43); sw.close();
        c.drawPath(sw, fuell(0xFFFF8C1A));
        c.drawPath(sw, strich(0xFFC25E00, 1.6f));
        Path flosse = new Path();
        flosse.moveTo(38, 11); flosse.quadTo(48, 0, 58, 10); flosse.close();
        c.drawPath(flosse, fuell(0xFFFF8C1A));
        RectF k = new RectF(14, 8, 80, 44);
        c.drawOval(k, fuell(0xFFFFA62B));
        c.save();
        Path clip = new Path();
        clip.addOval(k, Path.Direction.CW);
        c.clipPath(clip);
        c.drawRect(36, 0, 42, 52, fuell(0xFFFFFFFF));
        c.drawRect(52, 0, 57, 52, fuell(0xFFFFFFFF));
        c.restore();
        c.drawOval(k, strich(0xFFC25E00, 1.8f));
        auge(c, 66, 22, 5, 1.5f);
        Path m = new Path();
        m.moveTo(72, 32); m.quadTo(76, 34, 79, 31);
        c.drawPath(m, strich(0xFF7A3B00, 1.5f));
        break;
      }
      case "vogel1": case "vogel2": {
        boolean hoch = id.equals("vogel1");
        RectF k = new RectF(12, 22, 62, 52);
        c.drawOval(k, fuell(0xFF4CC9F0));
        c.drawOval(k, strich(0xFF1F8FB5, 1.8f));
        Path bauch = new Path();
        bauch.addOval(new RectF(26, 36, 58, 52), Path.Direction.CW);
        c.save(); Path cl = new Path(); cl.addOval(k, Path.Direction.CW); c.clipPath(cl);
        c.drawPath(bauch, fuell(0xFFE0F7FF)); c.restore();
        Path s = new Path();
        s.moveTo(14, 34); s.lineTo(2, 28); s.lineTo(4, 40); s.close();
        c.drawPath(s, fuell(0xFF1F8FB5));
        Path flug = new Path();
        if (hoch) { flug.moveTo(26, 34); flug.quadTo(30, 4, 46, 6); flug.quadTo(42, 24, 42, 34); }
        else { flug.moveTo(26, 36); flug.quadTo(30, 58, 44, 58); flug.quadTo(42, 46, 42, 36); }
        flug.close();
        c.drawPath(flug, fuell(0xFF3AB0DA));
        c.drawPath(flug, strich(0xFF1F8FB5, 1.6f));
        Path schnabel = new Path();
        schnabel.moveTo(60, 32); schnabel.lineTo(74, 36); schnabel.lineTo(60, 40); schnabel.close();
        c.drawPath(schnabel, fuell(0xFFFFB703));
        auge(c, 52, 31, 4.5f, 1.4f);
        break;
      }
      case "kaefer": {
        c.drawLine(52, 20, 60, 8, strich(0xFF222222, 1.6f));
        c.drawLine(52, 32, 60, 44, strich(0xFF222222, 1.6f));
        kreis(c, 60, 8, 2, 0xFF222222);
        kreis(c, 60, 44, 2, 0xFF222222);
        for (int i = 0; i < 3; i++) {
          float x = 16 + i * 10;
          c.drawLine(x, 8, x - 3, 2, strich(0xFF222222, 2));
          c.drawLine(x, 44, x - 3, 50, strich(0xFF222222, 2));
        }
        kreis(c, 50, 26, 10, 0xFF222222);
        kreis(c, 54, 22, 2.3f, 0xFFFFFFFF);
        kreis(c, 54, 30, 2.3f, 0xFFFFFFFF);
        RectF k = new RectF(6, 6, 50, 46);
        c.drawOval(k, fuell(0xFFE63946));
        c.drawLine(8, 26, 48, 26, strich(0xFF222222, 2));
        kreis(c, 20, 16, 4, 0xFF222222);
        kreis(c, 36, 16, 3.5f, 0xFF222222);
        kreis(c, 20, 36, 4, 0xFF222222);
        kreis(c, 36, 36, 3.5f, 0xFF222222);
        c.drawOval(k, strich(0xFF9B1B26, 1.6f));
        break;
      }
      case "geist": {
        Path p = new Path();
        p.moveTo(6, 66);
        p.lineTo(6, 30);
        p.cubicTo(6, 8, 54, 8, 54, 30);
        p.lineTo(54, 66);
        p.quadTo(48, 58, 42, 66);
        p.quadTo(36, 58, 30, 66);
        p.quadTo(24, 58, 18, 66);
        p.quadTo(12, 58, 6, 66);
        p.close();
        c.drawPath(p, fuell(0xF2FFFFFF));
        c.drawPath(p, strich(0xFFB8C0D0, 1.8f));
        c.drawOval(new RectF(26, 26, 34, 37), fuell(0xFF2B2D42));
        c.drawOval(new RectF(40, 26, 48, 37), fuell(0xFF2B2D42));
        c.drawOval(new RectF(34, 42, 42, 50), fuell(0xFF2B2D42));
        break;
      }
      case "apfel": {
        Path p = new Path();
        p.moveTo(23, 14);
        p.cubicTo(8, 4, -4, 22, 8, 40);
        p.cubicTo(14, 50, 20, 50, 23, 47);
        p.cubicTo(26, 50, 32, 50, 38, 40);
        p.cubicTo(50, 22, 38, 4, 23, 14);
        p.close();
        c.drawPath(p, fuell(0xFFE63946));
        c.drawPath(p, strich(0xFF9B1B26, 1.8f));
        c.drawLine(23, 14, 25, 3, strich(0xFF6B4226, 2.4f));
        Path blatt = new Path();
        blatt.moveTo(25, 7); blatt.quadTo(32, -1, 40, 4); blatt.quadTo(32, 11, 25, 7);
        c.drawPath(blatt, fuell(0xFF52B788));
        kreis(c, 13, 22, 3.5f, 0x88FFFFFF);
        break;
      }
      case "auto": {
        Path p = new Path();
        p.moveTo(6, 40);
        p.lineTo(6, 28);
        p.quadTo(8, 24, 18, 23);
        p.lineTo(30, 10);
        p.lineTo(70, 10);
        p.lineTo(86, 23);
        p.quadTo(104, 25, 106, 32);
        p.lineTo(106, 40);
        p.close();
        c.drawPath(p, fuell(0xFF3E8EF7));
        c.drawPath(p, strich(0xFF1F5FB8, 1.8f));
        Path f = new Path();
        f.moveTo(34, 13); f.lineTo(48, 13); f.lineTo(48, 23); f.lineTo(25, 23); f.close();
        f.moveTo(52, 13); f.lineTo(68, 13); f.lineTo(80, 23); f.lineTo(52, 23); f.close();
        c.drawPath(f, fuell(0xFFCFEFFF));
        rr(c, 98, 28, 106, 33, 2, 0xFFFFE066, 0, 0);
        for (float x : new float[]{28, 84}) {
          kreis(c, x, 42, 10, 0xFF2B2D42);
          kreis(c, x, 42, 4.5f, 0xFFADB5BD);
        }
        break;
      }
      case "baum": {
        rr(c, 38, 70, 52, 118, 3, 0xFF8B5E3C, 0xFF5E3B22, 1.6f);
        int g = 0xFF40A060;
        kreis(c, 45, 34, 28, g);
        kreis(c, 24, 58, 22, g);
        kreis(c, 66, 58, 22, g);
        kreis(c, 45, 66, 20, g);
        kreis(c, 36, 26, 8, 0x3389FFB0);
        kreis(c, 30, 52, 3, 0xFFE63946);
        kreis(c, 60, 40, 3, 0xFFE63946);
        kreis(c, 56, 66, 3, 0xFFE63946);
        break;
      }
      case "wolke": {
        int w = 0xFFFFFFFF;
        Paint r = strich(0xFFC9D6E3, 2);
        float[][] k = {{30, 36, 18}, {52, 26, 22}, {76, 32, 18}, {92, 42, 14}, {18, 44, 12}};
        for (float[] e : k) c.drawCircle(e[0], e[1], e[2], r);
        for (float[] e : k) kreis(c, e[0], e[1], e[2], w);
        c.drawRect(18, 36, 92, 56, fuell(w));
        c.drawLine(18, 56, 92, 56, r);
        break;
      }
      case "pfeil": {
        Path p = new Path();
        p.moveTo(4, 15); p.lineTo(40, 15); p.lineTo(40, 4); p.lineTo(68, 22);
        p.lineTo(40, 40); p.lineTo(40, 29); p.lineTo(4, 29); p.close();
        c.drawPath(p, fuell(0xFF3E8EF7));
        c.drawPath(p, strich(0xFF1F5FB8, 2));
        break;
      }
      case "quadrat":
        rr(c, 3, 3, 47, 47, 7, 0xFF8A5CF5, 0xFF5F37C4, 2.4f);
        break;
      case "schlaeger":
        rr(c, 2, 2, 98, 16, 7, 0xFF2B2D42, 0xFF111111, 1.5f);
        rr(c, 8, 5, 92, 8, 1.5f, 0x55FFFFFF, 0, 0);
        break;
      case "muenze": {
        kreis(c, 20, 20, 18, 0xFFFFC300);
        c.drawCircle(20, 20, 18, strich(0xFFC98E00, 2));
        c.drawCircle(20, 20, 13, strich(0xFFE0A800, 1.6f));
        c.drawPath(sternPfad(20, 20.5f, 8, 3.5f, 5), fuell(0xFFFFF1A8));
        break;
      }
      default:
        break;
    }
  }

  private static void robbi(Canvas c, boolean b) {
    int koerper = 0xFF2EC4B6, rand = 0xFF1A8A80, glied = 0xFF5C6B7A, hell = 0xFFE9FFFC;
    Paint arm = strich(glied, 6);
    // hinterer Arm und hinteres Bein zuerst
    if (!b) { c.drawLine(32, 66, 22, 80, arm); kreis(c, 22, 81, 4.5f, glied); }
    else { c.drawLine(32, 66, 18, 66, arm); kreis(c, 17, 66, 4.5f, glied); }
    Paint bein = strich(glied, 6.5f);
    if (!b) {
      c.drawLine(43, 88, 41, 100, bein); c.drawLine(57, 88, 59, 100, bein);
      rr(c, 34, 98, 48, 106, 3.5f, 0xFF3D4852, 0, 0);
      rr(c, 53, 98, 69, 106, 3.5f, 0xFF3D4852, 0, 0);
    } else {
      c.drawLine(43, 88, 36, 99, bein); c.drawLine(57, 88, 64, 99, bein);
      rr(c, 28, 97, 42, 105, 3.5f, 0xFF3D4852, 0, 0);
      rr(c, 58, 97, 74, 105, 3.5f, 0xFF3D4852, 0, 0);
    }
    // Hals und Körper
    rr(c, 44, 54, 56, 61, 2, glied, 0, 0);
    rr(c, 30, 58, 70, 90, 11, koerper, rand, 2.2f);
    rr(c, 39, 64, 61, 82, 5, hell, 0, 0);
    kreis(c, 50, 73, 4, 0xFFFFC21A);
    // vorderer Arm
    if (!b) { c.drawLine(68, 66, 80, 76, arm); kreis(c, 81, 77, 4.5f, glied); }
    else { c.drawLine(68, 66, 76, 82, arm); kreis(c, 77, 83, 4.5f, glied); }
    // Antenne
    c.drawLine(50, 22, 52, 9, strich(glied, 2.6f));
    kreis(c, 52, 7, 5, 0xFFFF5A5F);
    kreis(c, 50.5f, 5.5f, 1.5f, 0xAAFFFFFF);
    // Kopf
    rr(c, 20, 20, 80, 56, 13, koerper, rand, 2.2f);
    rr(c, 32, 26, 76, 50, 9, hell, 0, 0);
    // Ohr
    rr(c, 15, 31, 23, 45, 3, glied, 0, 0);
    // Gesicht, Blick nach rechts
    kreis(c, 50, 36, 4.6f, 0xFF1D2433);
    kreis(c, 66, 36, 4.6f, 0xFF1D2433);
    kreis(c, 51.6f, 34.4f, 1.5f, 0xFFFFFFFF);
    kreis(c, 67.6f, 34.4f, 1.5f, 0xFFFFFFFF);
    Path m = new Path();
    m.moveTo(52, 43);
    m.quadTo(59, 48.5f, 66, 43);
    c.drawPath(m, strich(0xFF1D2433, 2));
    kreis(c, 72, 44, 2.6f, 0x66FF7B8A);
    kreis(c, 44, 44, 2.6f, 0x66FF7B8A);
  }

  static Path sternPfad(float cx, float cy, float aussen, float innen, int zacken) {
    Path p = new Path();
    for (int i = 0; i < zacken * 2; i++) {
      double a = -Math.PI / 2 + i * Math.PI / zacken;
      float r = i % 2 == 0 ? aussen : innen;
      float x = cx + (float) Math.cos(a) * r, y = cy + (float) Math.sin(a) * r;
      if (i == 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
    p.close();
    return p;
  }

  // ------------------------------------------------------------- Bühnenbilder

  static Kostuem buehnenbild(String id) {
    float res = 2;
    Bitmap b = Bitmap.createBitmap((int) (480 * res), (int) (360 * res), Bitmap.Config.ARGB_8888);
    Canvas c = new Canvas(b);
    c.scale(res, res);
    zeichneBild(c, id);
    Kostuem k = new Kostuem(bildName(id), b, 480 * res / 2, 360 * res / 2, res);
    k.bib = id;
    return k;
  }

  private static void verlauf(Canvas c, float t, float u, int oben, int unten) {
    Paint p = new Paint();
    p.setShader(new LinearGradient(0, t, 0, u, oben, unten, Shader.TileMode.CLAMP));
    c.drawRect(0, t, 480, u, p);
  }

  private static void wolke(Canvas c, float x, float y, float s) {
    Paint w = fuell(0xF0FFFFFF);
    c.drawCircle(x, y, 16 * s, w);
    c.drawCircle(x + 18 * s, y - 8 * s, 20 * s, w);
    c.drawCircle(x + 38 * s, y, 15 * s, w);
    c.drawRect(x, y, x + 38 * s, y + 15 * s, w);
    c.drawCircle(x, y + 1 * s, 14 * s, w);
  }

  private static void zeichneBild(Canvas c, String id) {
    Random z = new Random(7);
    switch (id) {
      case "himmel":
        verlauf(c, 0, 360, 0xFF6EC1F5, 0xFFD9F1FF);
        kreis(c, 410, 62, 34, 0x55FFF3B0);
        kreis(c, 410, 62, 26, 0xFFFFE066);
        wolke(c, 60, 80, 1.2f);
        wolke(c, 250, 140, 0.9f);
        wolke(c, 330, 260, 1.4f);
        wolke(c, 90, 270, 0.8f);
        break;
      case "wiese":
        verlauf(c, 0, 260, 0xFF7CC6F2, 0xFFDDF3FF);
        wolke(c, 70, 70, 1f);
        wolke(c, 320, 50, 1.2f);
        c.drawOval(new RectF(-120, 210, 300, 480), fuell(0xFF74C365));
        c.drawOval(new RectF(160, 230, 620, 500), fuell(0xFF5DB352));
        c.drawRect(0, 300, 480, 360, fuell(0xFF5DB352));
        for (int i = 0; i < 40; i++) {
          float x = z.nextFloat() * 480, y = 270 + z.nextFloat() * 85;
          int[] fb = {0xFFFFFFFF, 0xFFFFD23F, 0xFFFF7BAC};
          kreis(c, x, y, 2.4f, fb[i % 3]);
        }
        break;
      case "weltraum": {
        verlauf(c, 0, 360, 0xFF070B1F, 0xFF1C2452);
        for (int i = 0; i < 160; i++) {
          float r = z.nextFloat() < 0.1f ? 1.6f : 0.8f;
          kreis(c, z.nextFloat() * 480, z.nextFloat() * 360, r, 0xFFFFFFFF - (z.nextInt(80) << 24));
        }
        kreis(c, 380, 90, 36, 0xFFE76F51);
        Path cl = new Path();
        cl.addCircle(380, 90, 36, Path.Direction.CW);
        c.save(); c.clipPath(cl);
        kreis(c, 395, 75, 34, 0x22FFFFFF);
        c.drawRect(340, 96, 420, 104, fuell(0x33000000));
        c.restore();
        Paint ring = strich(0xFFF4A261, 4);
        c.save(); c.rotate(-18, 380, 90);
        c.drawOval(new RectF(326, 80, 434, 100), ring);
        c.restore();
        kreis(c, 90, 290, 18, 0xFF8ECAE6);
        kreis(c, 84, 284, 5, 0x33FFFFFF);
        break;
      }
      case "unterwasser": {
        verlauf(c, 0, 360, 0xFF2BA3D9, 0xFF0B3C66);
        Paint licht = fuell(0x18FFFFFF);
        for (int i = 0; i < 4; i++) {
          Path p = new Path();
          float x = 40 + i * 120;
          p.moveTo(x, 0); p.lineTo(x + 50, 0); p.lineTo(x - 30, 360); p.lineTo(x - 90, 360); p.close();
          c.drawPath(p, licht);
        }
        c.drawRect(0, 330, 480, 360, fuell(0xFFE9C46A));
        c.drawOval(new RectF(-40, 316, 200, 350), fuell(0xFFE9C46A));
        Paint tang = strich(0xFF2A9D8F, 6);
        for (int i = 0; i < 7; i++) {
          float x = 30 + i * 70 + z.nextFloat() * 20;
          Path p = new Path();
          p.moveTo(x, 345);
          p.cubicTo(x - 14, 300, x + 14, 280, x - 4, 230 + z.nextFloat() * 30);
          c.drawPath(p, tang);
        }
        Paint blase = strich(0x99FFFFFF, 1.5f);
        for (int i = 0; i < 18; i++) c.drawCircle(z.nextFloat() * 480, z.nextFloat() * 300, 2 + z.nextFloat() * 6, blase);
        break;
      }
      case "nacht": {
        verlauf(c, 0, 360, 0xFF0D1B3E, 0xFF34407A);
        for (int i = 0; i < 70; i++) kreis(c, z.nextFloat() * 480, z.nextFloat() * 220, 0.9f, 0xCCFFFFFF);
        kreis(c, 90, 70, 30, 0xFFF8F3D6);
        kreis(c, 80, 62, 5, 0x22000000);
        kreis(c, 98, 82, 4, 0x22000000);
        float x = 0;
        while (x < 480) {
          float bw = 34 + z.nextFloat() * 40, bh = 70 + z.nextFloat() * 120;
          c.drawRect(x, 360 - bh, x + bw, 360, fuell(0xFF151A30));
          for (float fy = 360 - bh + 10; fy < 350; fy += 16)
            for (float fx = x + 7; fx < x + bw - 8; fx += 12)
              if (z.nextFloat() < 0.35f) c.drawRect(fx, fy, fx + 5, fy + 7, fuell(0xFFFFD166));
          x += bw + 3;
        }
        break;
      }
      case "strand":
        verlauf(c, 0, 210, 0xFF7FD3F7, 0xFFE6F7FF);
        kreis(c, 400, 70, 28, 0xFFFFE066);
        wolke(c, 80, 70, 0.9f);
        verlauf(c, 200, 270, 0xFF1F9ED1, 0xFF48CAE4);
        Paint welle = strich(0x88FFFFFF, 2);
        for (int i = 0; i < 6; i++) {
          float y = 215 + i * 9;
          Path p = new Path();
          p.moveTo(0, y);
          for (float wx = 0; wx < 480; wx += 40) {
            p.quadTo(wx + 10, y - 4, wx + 20, y);
            p.quadTo(wx + 30, y + 4, wx + 40, y);
          }
          c.drawPath(p, welle);
        }
        Path sand = new Path();
        sand.moveTo(0, 270); sand.quadTo(240, 250, 480, 275); sand.lineTo(480, 360); sand.lineTo(0, 360); sand.close();
        c.drawPath(sand, fuell(0xFFF2D59B));
        for (int i = 0; i < 6; i++) kreis(c, z.nextFloat() * 480, 300 + z.nextFloat() * 50, 3, 0xFFFFF4E0);
        break;
      case "gitter": {
        c.drawColor(0xFFFFFFFF);
        Paint fein = strich(0xFFE6E9F0, 1);
        Paint grob = strich(0xFFC9CFDB, 1);
        for (int i = -240; i <= 240; i += 20) c.drawLine(240 + i, 0, 240 + i, 360, i % 100 == 0 ? grob : fein);
        for (int i = -180; i <= 180; i += 20) c.drawLine(0, 180 - i, 480, 180 - i, i % 100 == 0 ? grob : fein);
        Paint achse = strich(0xFF6B7385, 1.6f);
        c.drawLine(0, 180, 480, 180, achse);
        c.drawLine(240, 0, 240, 360, achse);
        Paint t = fuell(0xFF6B7385);
        t.setTextSize(10);
        for (int i = -200; i <= 200; i += 100) if (i != 0) {
          c.drawText(String.valueOf(i), 240 + i + 3, 192, t);
        }
        for (int i = -100; i <= 100; i += 100) if (i != 0) {
          c.drawText(String.valueOf(i), 244, 180 - i - 3, t);
        }
        c.drawText("x", 468, 174, t);
        c.drawText("y", 246, 12, t);
        c.drawText("0", 244, 192, t);
        break;
      }
      case "weiss":
      default:
        c.drawColor(0xFFFFFFFF);
        break;
    }
  }
}
