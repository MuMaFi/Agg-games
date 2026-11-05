package de.mumafi.blockwerk;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;

/** Zeigt die Bühne im richtigen Seitenverhältnis und meldet Fingerberührungen
 *  an den Motor. Im Editor lassen sich Figuren mit dem Finger verschieben. */
final class BuehneView extends View {

  interface Wirt {
    void figurVerschoben(Figur f);
  }

  Projekt projekt;
  Motor motor;
  Wirt wirt;
  final boolean vollbild;
  private final Darstellung darstellung = new Darstellung();
  private final float d, slop;
  private final Paint rand = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final RectF r = new RectF();
  private final Path ecken = new Path();

  private float m, ox, oy;
  private Figur kandidat;
  private boolean zieht;
  private float downX, downY;
  private double greifX, greifY;

  BuehneView(Context c, boolean vollbild) {
    super(c);
    this.vollbild = vollbild;
    d = getResources().getDisplayMetrics().density;
    slop = ViewConfiguration.get(c).getScaledTouchSlop();
    rand.setStyle(Paint.Style.STROKE);
    rand.setStrokeWidth(Math.max(1, d));
    rand.setColor(0xFFD3D5E2);
    setContentDescription("Bühne");
  }

  private void masse() {
    float w = getWidth(), h = getHeight();
    float pad = vollbild ? 0 : 4 * d;
    m = Math.min((w - 2 * pad) / Darstellung.B, (h - 2 * pad) / Darstellung.H);
    ox = (w - Darstellung.B * m) / 2;
    oy = vollbild ? (h - Darstellung.H * m) / 2 : pad;
  }

  @Override protected void onDraw(Canvas c) {
    if (projekt == null) return;
    masse();
    c.save();
    r.set(ox, oy, ox + Darstellung.B * m, oy + Darstellung.H * m);
    if (!vollbild) {
      ecken.reset();
      ecken.addRoundRect(r, 8 * d, 8 * d, Path.Direction.CW);
      c.clipPath(ecken);
    } else {
      c.clipRect(r);
    }
    c.translate(ox, oy);
    darstellung.zeichne(c, projekt, motor, m, null, true);
    c.restore();
    if (!vollbild) c.drawRoundRect(r, 8 * d, 8 * d, rand);
  }

  private double buehneX(float x) { return (x - ox) / m - Darstellung.B / 2; }
  private double buehneY(float y) { return Darstellung.H / 2 - (y - oy) / m; }

  private Figur figurBei(double x, double y) {
    for (int i = projekt.ebenen.size() - 1; i >= 0; i--) {
      Figur f = projekt.ebenen.get(i);
      if (f.sichtbar && Darstellung.deckend(f, x, y)) return f;
    }
    return null;
  }

  @SuppressLint("ClickableViewAccessibility")
  @Override public boolean onTouchEvent(MotionEvent e) {
    if (projekt == null || motor == null) return false;
    masse();
    float x = e.getX(), y = e.getY();
    double bx = Math.max(-240, Math.min(240, buehneX(x))), by = Math.max(-180, Math.min(180, buehneY(y)));
    switch (e.getActionMasked()) {
      case MotionEvent.ACTION_DOWN: {
        getParent().requestDisallowInterceptTouchEvent(true);
        motor.fingerX = bx;
        motor.fingerY = by;
        motor.fingerUnten = true;
        downX = x;
        downY = y;
        zieht = false;
        kandidat = figurBei(buehneX(x), buehneY(y));
        if (kandidat != null) { greifX = kandidat.x - bx; greifY = kandidat.y - by; }
        if (vollbild) {
          if (kandidat != null) motor.figurAngetippt(kandidat);
          else motor.buehneAngetippt();
        }
        break;
      }
      case MotionEvent.ACTION_MOVE:
        motor.fingerX = bx;
        motor.fingerY = by;
        if (!vollbild && kandidat != null && !kandidat.istKlon) {
          if (!zieht && Math.hypot(x - downX, y - downY) > slop) zieht = true;
          if (zieht) {
            kandidat.x = Math.round(bx + greifX);
            kandidat.y = Math.round(by + greifY);
            invalidate();
          }
        }
        break;
      case MotionEvent.ACTION_UP:
        motor.fingerUnten = false;
        if (!vollbild) {
          if (zieht && kandidat != null) {
            motor.setzePosition(kandidat, kandidat.x, kandidat.y);
            if (wirt != null) wirt.figurVerschoben(kandidat);
          } else if (Math.hypot(x - downX, y - downY) <= slop) {
            if (kandidat != null) motor.figurAngetippt(kandidat);
            else motor.buehneAngetippt();
          }
        }
        kandidat = null;
        zieht = false;
        invalidate();
        break;
      case MotionEvent.ACTION_CANCEL:
        motor.fingerUnten = false;
        kandidat = null;
        zieht = false;
        break;
      default:
        break;
    }
    return true;
  }
}
