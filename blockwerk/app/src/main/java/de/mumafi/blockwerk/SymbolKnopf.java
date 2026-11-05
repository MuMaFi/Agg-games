package de.mumafi.blockwerk;

import android.content.Context;
import android.content.res.TypedArray;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

/** Ein runder Knopf mit selbst gezeichnetem Symbol. */
final class SymbolKnopf extends View {
  static final int FLAGGE = 0, STOPP = 1, VOLLBILD = 2, MENUE = 3, SCHLIESSEN = 4, KLEIN = 5, CODE = 6;

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
    if (aktiv && art != CODE) {
      p.setColor(art == FLAGGE ? 0x4422C55E : 0x22FFFFFF);
      c.drawCircle(cx, cy, s * 1.75f, p);
    }
    p.setStyle(Paint.Style.FILL);
    switch (art) {
      case FLAGGE: {
        // Start: ein Dreieck wie in einer Entwicklungsumgebung
        p.setColor(0xFF22C55E);
        pfad.reset();
        pfad.moveTo(cx - s * 0.6f, cy - s * 0.85f);
        pfad.lineTo(cx + s * 0.85f, cy);
        pfad.lineTo(cx - s * 0.6f, cy + s * 0.85f);
        pfad.close();
        c.drawPath(pfad, p);
        break;
      }
      case STOPP: {
        p.setColor(0xFFEF4444);
        android.graphics.RectF r = new android.graphics.RectF(cx - s * 0.7f, cy - s * 0.7f, cx + s * 0.7f, cy + s * 0.7f);
        c.drawRoundRect(r, 2 * d, 2 * d, p);
        break;
      }
      case CODE: {
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(2.2f * d);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeJoin(Paint.Join.ROUND);
        p.setColor(aktiv ? 0xFF60A5FA : farbe);
        float e = s * 0.9f;
        pfad.reset();
        pfad.moveTo(cx - e * 0.45f, cy - e * 0.65f);
        pfad.lineTo(cx - e * 1.1f, cy);
        pfad.lineTo(cx - e * 0.45f, cy + e * 0.65f);
        pfad.moveTo(cx + e * 0.45f, cy - e * 0.65f);
        pfad.lineTo(cx + e * 1.1f, cy);
        pfad.lineTo(cx + e * 0.45f, cy + e * 0.65f);
        pfad.moveTo(cx + e * 0.2f, cy - e * 0.8f);
        pfad.lineTo(cx - e * 0.2f, cy + e * 0.8f);
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
