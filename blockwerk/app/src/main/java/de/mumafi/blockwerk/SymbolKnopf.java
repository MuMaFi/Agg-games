package de.mumafi.blockwerk;

import android.content.Context;
import android.content.res.TypedArray;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

/** Ein runder Knopf mit selbst gezeichnetem Symbol. */
final class SymbolKnopf extends View {
  static final int FLAGGE = 0, STOPP = 1, VOLLBILD = 2, MENUE = 3, SCHLIESSEN = 4, KLEIN = 5;

  private final int art;
  private final float d;
  private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final Path pfad = new Path();
  private boolean aktiv;
  int farbe = 0xFFFFFFFF;
  boolean dunklerGrund;

  SymbolKnopf(Context c, int art, String beschreibung) {
    super(c);
    this.art = art;
    d = getResources().getDisplayMetrics().density;
    setContentDescription(beschreibung);
    setClickable(true);
    setFocusable(true);
    TypedArray a = c.obtainStyledAttributes(new int[]{android.R.attr.selectableItemBackgroundBorderless});
    setBackground(a.getDrawable(0));
    a.recycle();
  }

  void setAktiv(boolean a) {
    if (aktiv != a) { aktiv = a; invalidate(); }
  }

  @Override protected void onDraw(Canvas c) {
    float cx = getWidth() / 2f, cy = getHeight() / 2f;
    float s = Math.min(getWidth(), getHeight()) / 2f * 0.5f;
    if (dunklerGrund) {
      p.setColor(0x66000000);
      c.drawCircle(cx, cy, s * 1.75f, p);
    }
    if (aktiv) {
      p.setColor(art == FLAGGE ? 0x553DDC84 : 0x33FFFFFF);
      c.drawCircle(cx, cy, s * 1.75f, p);
    }
    p.setStyle(Paint.Style.FILL);
    switch (art) {
      case FLAGGE: {
        p.setColor(0xFF4CC75A);
        pfad.reset();
        float l = cx - s * 0.75f, t = cy - s;
        pfad.moveTo(l, t + s * 0.1f);
        pfad.cubicTo(l + s * 0.6f, t - s * 0.25f, l + s * 0.9f, t + s * 0.5f, l + s * 1.6f, t + s * 0.1f);
        pfad.lineTo(l + s * 1.6f, t + s * 1.1f);
        pfad.cubicTo(l + s * 0.9f, t + s * 1.5f, l + s * 0.6f, t + s * 0.75f, l, t + s * 1.1f);
        pfad.close();
        c.drawPath(pfad, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(2.2f * d);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setColor(0xFF2E9E3C);
        c.drawPath(pfad, p);
        p.setColor(farbe == 0xFFFFFFFF ? 0xFFE8FFE8 : 0xFF2E9E3C);
        c.drawLine(l, t - s * 0.05f, l, cy + s, p);
        break;
      }
      case STOPP: {
        p.setColor(0xFFF0484E);
        pfad.reset();
        for (int i = 0; i < 8; i++) {
          double a = Math.PI / 8 + i * Math.PI / 4;
          float x = cx + (float) Math.cos(a) * s * 1.02f, y = cy + (float) Math.sin(a) * s * 1.02f;
          if (i == 0) pfad.moveTo(x, y); else pfad.lineTo(x, y);
        }
        pfad.close();
        c.drawPath(pfad, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(1.6f * d);
        p.setColor(0xFFB3262B);
        c.drawPath(pfad, p);
        break;
      }
      case VOLLBILD:
      case KLEIN: {
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(2.2f * d);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeJoin(Paint.Join.ROUND);
        p.setColor(farbe);
        float e = s * 0.95f, k = s * 0.45f;
        boolean aus = art == VOLLBILD;
        for (int i = 0; i < 4; i++) {
          float sx = (i % 2 == 0) ? -1 : 1, sy = (i < 2) ? -1 : 1;
          float ex = cx + sx * e, ey = cy + sy * e;
          pfad.reset();
          if (aus) {
            pfad.moveTo(ex, ey - sy * k);
            pfad.lineTo(ex, ey);
            pfad.lineTo(ex - sx * k, ey);
          } else {
            float ix = cx + sx * e * 0.35f, iy = cy + sy * e * 0.35f;
            pfad.moveTo(ix + sx * k, iy);
            pfad.lineTo(ix, iy);
            pfad.lineTo(ix, iy + sy * k);
          }
          c.drawPath(pfad, p);
        }
        break;
      }
      case MENUE: {
        p.setColor(farbe);
        float r = 2.2f * d;
        c.drawCircle(cx, cy - s * 0.75f, r, p);
        c.drawCircle(cx, cy, r, p);
        c.drawCircle(cx, cy + s * 0.75f, r, p);
        break;
      }
      case SCHLIESSEN: {
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(2.4f * d);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setColor(farbe);
        float e = s * 0.7f;
        c.drawLine(cx - e, cy - e, cx + e, cy + e, p);
        c.drawLine(cx + e, cy - e, cx - e, cy + e, p);
        break;
      }
      default:
        break;
    }
    p.setStyle(Paint.Style.FILL);
  }
}
