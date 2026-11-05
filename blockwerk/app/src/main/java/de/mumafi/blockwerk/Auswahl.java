package de.mumafi.blockwerk;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.List;

/** Kleine Dialoge, die beide Aktivitäten brauchen. */
final class Auswahl {
  private Auswahl() {}

  interface Text { void fertig(String text); }
  interface Nummer { void gewaehlt(int i); }

  static float dp(Context c) { return c.getResources().getDisplayMetrics().density; }

  static void eingabe(Activity a, String titel, String vorgabe, boolean zahl, Text ok) {
    float d = dp(a);
    EditText feld = new EditText(a);
    feld.setSingleLine(true);
    feld.setText(vorgabe);
    feld.setSelectAllOnFocus(true);
    feld.setInputType(zahl
        ? InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL | InputType.TYPE_NUMBER_FLAG_SIGNED
        : InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
    FrameLayout rahmen = new FrameLayout(a);
    int pad = (int) (20 * d);
    rahmen.setPadding(pad, (int) (8 * d), pad, 0);
    rahmen.addView(feld);
    AlertDialog dlg = new AlertDialog.Builder(a)
        .setTitle(titel)
        .setView(rahmen)
        .setPositiveButton("OK", (x, y) -> ok.fertig(feld.getText().toString()))
        .setNegativeButton("Abbrechen", null)
        .create();
    feld.setOnEditorActionListener((v, id, ev) -> {
      dlg.dismiss();
      ok.fertig(feld.getText().toString());
      return true;
    });
    if (dlg.getWindow() != null) dlg.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
    dlg.show();
    feld.requestFocus();
  }

  static void liste(Activity a, String titel, String[] eintraege, Nummer n) {
    new AlertDialog.Builder(a).setTitle(titel).setItems(eintraege, (x, i) -> n.gewaehlt(i)).show();
  }

  static void frage(Activity a, String titel, String text, String ja, Runnable ok) {
    new AlertDialog.Builder(a).setTitle(titel).setMessage(text)
        .setPositiveButton(ja, (x, y) -> ok.run())
        .setNegativeButton("Abbrechen", null)
        .show();
  }

  /** Raster aus Bildern mit Namen, etwa für die Figurenbibliothek. */
  static void bilder(Activity a, String titel, List<String> namen, List<Bitmap> bilder, Nummer n) {
    float d = dp(a);
    ScrollView sv = new ScrollView(a);
    GridLayout raster = new GridLayout(a);
    int breite = a.getResources().getDisplayMetrics().widthPixels;
    int spalten = Math.max(3, Math.min(6, (int) (breite / (100 * d))));
    raster.setColumnCount(spalten);
    int pad = (int) (12 * d);
    raster.setPadding(pad, pad / 2, pad, pad);
    sv.addView(raster);
    AlertDialog dlg = new AlertDialog.Builder(a).setTitle(titel).setView(sv)
        .setNegativeButton("Abbrechen", null).create();
    int kachel = (int) Math.min((breite * 0.82f - 2 * pad) / spalten, 110 * d);
    for (int i = 0; i < namen.size(); i++) {
      LinearLayout k = new LinearLayout(a);
      k.setOrientation(LinearLayout.VERTICAL);
      k.setGravity(Gravity.CENTER_HORIZONTAL);
      int ip = (int) (6 * d);
      k.setPadding(ip, ip, ip, ip);
      GradientDrawable g = new GradientDrawable();
      g.setColor(0xFFF9FAFB);
      g.setCornerRadius(6 * d);
      g.setStroke(Math.max(1, (int) d), 0xFFD1D5DB);
      k.setBackground(g);
      ImageView iv = new ImageView(a);
      iv.setImageBitmap(bilder.get(i));
      iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
      k.addView(iv, new LinearLayout.LayoutParams(kachel - 2 * ip, (int) (kachel * 0.62f)));
      TextView t = new TextView(a);
      t.setText(namen.get(i));
      t.setTextSize(12);
      t.setTextColor(0xFF374151);
      t.setSingleLine(true);
      t.setGravity(Gravity.CENTER);
      k.addView(t);
      GridLayout.LayoutParams lp = new GridLayout.LayoutParams();
      lp.width = kachel - (int) (6 * d);
      lp.setMargins((int) (3 * d), (int) (3 * d), (int) (3 * d), (int) (3 * d));
      final int nr = i;
      k.setOnClickListener(v -> { dlg.dismiss(); n.gewaehlt(nr); });
      raster.addView(k, lp);
    }
    dlg.show();
  }

  static final int[] FARBEN = farben();

  private static int[] farben() {
    int[] f = new int[48];
    float[] tone = {0, 25, 45, 60, 90, 140, 175, 200, 220, 260, 290, 330};
    int i = 0;
    for (float s : new float[]{0.35f, 0.8f, 1f}) {
      for (float h : tone) {
        float v = s == 1f ? 0.62f : 0.96f;
        f[i++] = Color.HSVToColor(new float[]{h, s, v});
      }
    }
    int[] grau = {0xFFFFFFFF, 0xFFE0E0E0, 0xFFBDBDBD, 0xFF9E9E9E, 0xFF757575, 0xFF616161,
        0xFF424242, 0xFF303030, 0xFF212121, 0xFF000000, 0xFF8B5E3C, 0xFFF2D59B};
    for (int g : grau) f[i++] = g;
    return f;
  }

  interface Farbe { void gewaehlt(int farbe); }

  static void farbe(Activity a, String titel, Farbe ok) {
    float d = dp(a);
    GridLayout raster = new GridLayout(a);
    raster.setColumnCount(6);
    int pad = (int) (14 * d);
    raster.setPadding(pad, pad / 2, pad, pad / 2);
    AlertDialog dlg = new AlertDialog.Builder(a).setTitle(titel).setView(raster)
        .setNegativeButton("Abbrechen", null).create();
    int g = (int) (40 * d);
    for (int f : FARBEN) {
      View v = new View(a);
      GradientDrawable gd = new GradientDrawable();
      gd.setColor(f);
      gd.setCornerRadius(4 * d);
      gd.setStroke(Math.max(1, (int) d), 0x33000000);
      v.setBackground(gd);
      GridLayout.LayoutParams lp = new GridLayout.LayoutParams();
      lp.width = g;
      lp.height = g;
      lp.setMargins((int) (4 * d), (int) (4 * d), (int) (4 * d), (int) (4 * d));
      final int farbe = f;
      v.setOnClickListener(x -> { dlg.dismiss(); ok.gewaehlt(farbe); });
      raster.addView(v, lp);
    }
    dlg.show();
  }

  static String hex(int farbe) {
    return String.format("#%06X", farbe & 0xFFFFFF);
  }
}
