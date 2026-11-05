package de.mumafi.blockwerk;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/** Kostüme einer Figur (oder Bühnenbilder der Bühne) verwalten und malen. */
public class KostuemActivity extends Activity {

  private static final int WAHL_FOTO = 1;
  private static final int AKZENT = 0xFF5B4BDB;

  private Figur figur;
  private MalView mal;
  private LinearLayout liste;
  private float d;
  private int gewaehlt;
  private final List<TextView> werkzeugKnoepfe = new ArrayList<>();
  private View farbAnzeige;

  @Override protected void onCreate(Bundle zustand) {
    super.onCreate(zustand);
    d = getResources().getDisplayMetrics().density;
    Projekt p = HauptActivity.projekt;
    if (p == null) { finish(); return; }
    int i = getIntent().getIntExtra("figur", -1);
    figur = i < 0 || i >= p.figuren.size() ? p.buehne : p.figuren.get(i);
    if (figur.kostueme.isEmpty()) figur.kostueme.add(Bibliothek.kostuem(figur.istBuehne ? "weiss" : "ball"));
    gewaehlt = Math.max(0, Math.min(figur.kostuem, figur.kostueme.size() - 1));
    mal = new MalView(this);
    mal.beiAenderung = this::vorschauNeu;
    mal.lade(figur.kostueme.get(gewaehlt), figur.istBuehne);
    if (getIntent().getBooleanExtra("malen", false)) mal.werkzeug = MalView.PINSEL;
    aufbauen();
  }

  @Override public void onConfigurationChanged(Configuration neu) {
    super.onConfigurationChanged(neu);
    aufbauen();
  }

  @Override protected void onPause() {
    super.onPause();
    uebernehmen();
  }

  @Override public void onBackPressed() {
    uebernehmen();
    setResult(RESULT_OK);
    super.onBackPressed();
  }

  /** Schreibt die Malerei in das gewählte Kostüm zurück. */
  private void uebernehmen() {
    if (!mal.geaendert || gewaehlt >= figur.kostueme.size()) return;
    Kostuem alt = figur.kostueme.get(gewaehlt);
    Kostuem neu = mal.ergebnis(alt.name);
    alt.bildGeaendert(neu.bild);
    alt.mx = neu.mx;
    alt.my = neu.my;
    alt.aufloesung = neu.aufloesung;
    mal.geaendert = false;
  }

  private void waehle(int i) {
    uebernehmen();
    gewaehlt = i;
    figur.kostuem = i;
    mal.lade(figur.kostueme.get(i), figur.istBuehne);
    listeNeu();
  }

  // ------------------------------------------------------------- Aufbau

  private void aufbauen() {
    ViewGroup alt = (ViewGroup) mal.getParent();
    if (alt != null) alt.removeView(mal);
    boolean quer = getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;

    LinearLayout wurzel = new LinearLayout(this);
    wurzel.setOrientation(LinearLayout.VERTICAL);
    wurzel.setBackgroundColor(0xFFF3F2FA);

    // Kopfzeile
    LinearLayout kopf = new LinearLayout(this);
    kopf.setBackgroundColor(AKZENT);
    kopf.setGravity(Gravity.CENTER_VERTICAL);
    kopf.setPadding((int) (14 * d), 0, (int) (8 * d), 0);
    TextView t = new TextView(this);
    t.setText(figur.istBuehne ? "Bühnenbilder" : "Kostüme von " + figur.name);
    t.setTextColor(0xFFFFFFFF);
    t.setTextSize(17);
    t.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
    t.setSingleLine(true);
    kopf.addView(t, new LinearLayout.LayoutParams(0, -2, 1));
    TextView fertig = knopfText("Fertig", 0xFFFFFFFF, 0x33FFFFFF);
    fertig.setOnClickListener(v -> { uebernehmen(); setResult(RESULT_OK); finish(); });
    kopf.addView(fertig);
    wurzel.addView(kopf, new LinearLayout.LayoutParams(-1, (int) (52 * d)));

    // Kostümliste
    liste = new LinearLayout(this);
    liste.setOrientation(quer ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
    liste.setPadding((int) (6 * d), (int) (6 * d), (int) (6 * d), (int) (6 * d));
    View listenRahmen;
    if (quer) {
      ScrollView sv = new ScrollView(this);
      sv.addView(liste);
      listenRahmen = sv;
    } else {
      HorizontalScrollView hv = new HorizontalScrollView(this);
      hv.addView(liste);
      listenRahmen = hv;
    }
    listenRahmen.setBackgroundColor(0xFFFFFFFF);

    // Werkzeuge
    LinearLayout werkzeuge = new LinearLayout(this);
    werkzeuge.setOrientation(LinearLayout.VERTICAL);
    werkzeuge.setPadding((int) (8 * d), (int) (6 * d), (int) (8 * d), (int) (6 * d));
    werkzeuge.setBackgroundColor(0xFFFFFFFF);

    LinearLayout reihe1 = new LinearLayout(this);
    reihe1.setGravity(Gravity.CENTER_VERTICAL);
    werkzeugKnoepfe.clear();
    String[] namen = {"Pinsel", "Radierer", "Füllen", "Linie", "Rechteck", "Kreis"};
    HorizontalScrollView wz = new HorizontalScrollView(this);
    wz.setHorizontalScrollBarEnabled(false);
    LinearLayout wzReihe = new LinearLayout(this);
    for (int i = 0; i < namen.length; i++) {
      TextView k = knopfText(namen[i], 0xFF3F3F55, 0xFFF0EFF8);
      final int nr = i;
      k.setOnClickListener(v -> { mal.werkzeug = nr; werkzeugeMarkieren(); });
      werkzeugKnoepfe.add(k);
      LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, (int) (36 * d));
      lp.setMargins(0, 0, (int) (6 * d), 0);
      wzReihe.addView(k, lp);
    }
    TextView zurueck = knopfText("↶ Zurück", 0xFF3F3F55, 0xFFF0EFF8);
    zurueck.setOnClickListener(v -> mal.rueckgaengig());
    LinearLayout.LayoutParams zp = new LinearLayout.LayoutParams(-2, (int) (36 * d));
    zp.setMargins(0, 0, (int) (6 * d), 0);
    wzReihe.addView(zurueck, zp);
    TextView spiegeln = knopfText("⇋ Spiegeln", 0xFF3F3F55, 0xFFF0EFF8);
    spiegeln.setOnClickListener(v -> mal.spiegeln());
    wzReihe.addView(spiegeln, zp);
    TextView leeren = knopfText("Leeren", 0xFFC23238, 0xFFFCEDEE);
    leeren.setOnClickListener(v -> mal.leeren());
    wzReihe.addView(leeren, new LinearLayout.LayoutParams(-2, (int) (36 * d)));
    wz.addView(wzReihe);
    reihe1.addView(wz, new LinearLayout.LayoutParams(-1, -2));
    werkzeuge.addView(reihe1);
    werkzeugeMarkieren();

    // Farben und Dicke
    LinearLayout reihe2 = new LinearLayout(this);
    reihe2.setGravity(Gravity.CENTER_VERTICAL);
    reihe2.setPadding(0, (int) (6 * d), 0, 0);
    farbAnzeige = new View(this);
    farbAnzeigeNeu();
    farbAnzeige.setOnClickListener(v -> Auswahl.farbe(this, "Farbe wählen", f -> { mal.farbe = f; farbAnzeigeNeu(); }));
    reihe2.addView(farbAnzeige, new LinearLayout.LayoutParams((int) (36 * d), (int) (36 * d)));
    HorizontalScrollView fs = new HorizontalScrollView(this);
    fs.setHorizontalScrollBarEnabled(false);
    LinearLayout farben = new LinearLayout(this);
    int[] schnell = {0xFF000000, 0xFFFFFFFF, 0xFF9E9E9E, 0xFFE63946, 0xFFFF8C1A, 0xFFFFD23F, 0xFF52B788,
        0xFF2EC4B6, 0xFF3E8EF7, 0xFF8A5CF5, 0xFFFF7BAC, 0xFF8B5E3C};
    for (int f : schnell) {
      View v = new View(this);
      GradientDrawable g = new GradientDrawable();
      g.setShape(GradientDrawable.OVAL);
      g.setColor(f);
      g.setStroke(Math.max(1, (int) d), 0x33000000);
      v.setBackground(g);
      v.setOnClickListener(x -> { mal.farbe = f; farbAnzeigeNeu(); });
      LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams((int) (28 * d), (int) (28 * d));
      lp.setMargins((int) (5 * d), 0, 0, 0);
      farben.addView(v, lp);
    }
    fs.addView(farben);
    reihe2.addView(fs, new LinearLayout.LayoutParams(0, -2, 1));
    werkzeuge.addView(reihe2);

    LinearLayout reihe3 = new LinearLayout(this);
    reihe3.setGravity(Gravity.CENTER_VERTICAL);
    TextView dl = new TextView(this);
    dl.setText("Dicke");
    dl.setTextColor(0xFF4A4E66);
    reihe3.addView(dl);
    SeekBar dicke = new SeekBar(this);
    dicke.setMax(80);
    dicke.setProgress((int) mal.dicke);
    dicke.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
      @Override public void onProgressChanged(SeekBar s, int v, boolean f) { mal.dicke = Math.max(1, v); }
      @Override public void onStartTrackingTouch(SeekBar s) {}
      @Override public void onStopTrackingTouch(SeekBar s) {}
    });
    reihe3.addView(dicke, new LinearLayout.LayoutParams(0, -2, 1));
    werkzeuge.addView(reihe3);

    if (quer) {
      LinearLayout inhalt = new LinearLayout(this);
      inhalt.addView(listenRahmen, new LinearLayout.LayoutParams((int) (112 * d), -1));
      LinearLayout rechts = new LinearLayout(this);
      rechts.setOrientation(LinearLayout.VERTICAL);
      rechts.addView(mal, new LinearLayout.LayoutParams(-1, 0, 1));
      rechts.addView(werkzeuge);
      inhalt.addView(rechts, new LinearLayout.LayoutParams(0, -1, 1));
      wurzel.addView(inhalt, new LinearLayout.LayoutParams(-1, 0, 1));
    } else {
      wurzel.addView(listenRahmen, new LinearLayout.LayoutParams(-1, (int) (112 * d)));
      wurzel.addView(mal, new LinearLayout.LayoutParams(-1, 0, 1));
      wurzel.addView(werkzeuge);
    }
    setContentView(wurzel);
    listeNeu();
  }

  private TextView knopfText(String text, int farbe, int grund) {
    TextView k = new TextView(this);
    k.setText(text);
    k.setTextColor(farbe);
    k.setTextSize(14);
    k.setGravity(Gravity.CENTER);
    k.setPadding((int) (12 * d), (int) (6 * d), (int) (12 * d), (int) (6 * d));
    GradientDrawable g = new GradientDrawable();
    g.setColor(grund);
    g.setCornerRadius(18 * d);
    k.setBackground(g);
    k.setClickable(true);
    return k;
  }

  private void werkzeugeMarkieren() {
    for (int i = 0; i < werkzeugKnoepfe.size(); i++) {
      TextView k = werkzeugKnoepfe.get(i);
      boolean an = i == mal.werkzeug;
      GradientDrawable g = new GradientDrawable();
      g.setColor(an ? AKZENT : 0xFFF0EFF8);
      g.setCornerRadius(18 * d);
      k.setBackground(g);
      k.setTextColor(an ? 0xFFFFFFFF : 0xFF3F3F55);
    }
  }

  private void farbAnzeigeNeu() {
    GradientDrawable g = new GradientDrawable();
    g.setShape(GradientDrawable.OVAL);
    g.setColor(mal.farbe);
    g.setStroke((int) (3 * d), 0xFFFFFFFF);
    farbAnzeige.setBackground(g);
    farbAnzeige.setElevation(2 * d);
  }

  private Bitmap vorschauAktuell;

  /** Hält die Kachel des gerade bemalten Kostüms halbwegs aktuell. */
  private void vorschauNeu() {
    if (liste == null || gewaehlt >= liste.getChildCount()) return;
    View k = liste.getChildAt(gewaehlt);
    if (!(k instanceof LinearLayout)) return;
    View iv = ((LinearLayout) k).getChildAt(0);
    if (iv instanceof ImageView) {
      Kostuem vorlaeufig = mal.ergebnis("");
      vorschauAktuell = Darstellung.vorschau(vorlaeufig, (int) (64 * d));
      ((ImageView) iv).setImageBitmap(vorschauAktuell);
    }
  }

  private void listeNeu() {
    liste.removeAllViews();
    int g = (int) (64 * d);
    for (int i = 0; i < figur.kostueme.size(); i++) {
      Kostuem k = figur.kostueme.get(i);
      LinearLayout kachel = new LinearLayout(this);
      kachel.setOrientation(LinearLayout.VERTICAL);
      kachel.setGravity(Gravity.CENTER_HORIZONTAL);
      kachel.setPadding((int) (4 * d), (int) (4 * d), (int) (4 * d), (int) (2 * d));
      GradientDrawable hg = new GradientDrawable();
      hg.setColor(i == gewaehlt ? 0xFFEDEBFC : 0xFFF7F7FB);
      hg.setCornerRadius(10 * d);
      hg.setStroke((int) ((i == gewaehlt ? 2.5f : 1) * d), i == gewaehlt ? AKZENT : 0xFFDCDBEA);
      kachel.setBackground(hg);
      ImageView iv = new ImageView(this);
      iv.setImageBitmap(Darstellung.vorschau(k, g));
      kachel.addView(iv, new LinearLayout.LayoutParams(g, g));
      TextView n = new TextView(this);
      n.setText((i + 1) + " " + k.name);
      n.setTextSize(11);
      n.setSingleLine(true);
      n.setMaxWidth((int) (84 * d));
      n.setTextColor(0xFF4A4E66);
      kachel.addView(n);
      final int nr = i;
      kachel.setOnClickListener(v -> { if (nr != gewaehlt) waehle(nr); });
      kachel.setOnLongClickListener(v -> { kostuemMenue(nr); return true; });
      LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams((int) (92 * d), -2);
      lp.setMargins((int) (3 * d), (int) (3 * d), (int) (3 * d), (int) (3 * d));
      liste.addView(kachel, lp);
    }
    TextView plus = knopfText("+ Neu", 0xFFFFFFFF, AKZENT);
    plus.setOnClickListener(v -> neuesKostuem());
    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams((int) (92 * d), (int) (44 * d));
    lp.setMargins((int) (3 * d), (int) (12 * d), (int) (3 * d), (int) (3 * d));
    lp.gravity = Gravity.CENTER;
    liste.addView(plus, lp);
  }

  private String freierName(String basis) {
    for (int i = 1; ; i++) {
      String n = i == 1 && !basis.endsWith("Kostüm") && !basis.endsWith("Bild") ? basis : basis + i;
      boolean frei = true;
      for (Kostuem k : figur.kostueme) if (k.name.equals(n)) { frei = false; break; }
      if (frei) return n;
    }
  }

  private void neuesKostuem() {
    String[] wege = {"Aus der Bibliothek", "Leer malen", "Foto oder Bild wählen"};
    Auswahl.liste(this, figur.istBuehne ? "Neues Bühnenbild" : "Neues Kostüm", wege, i -> {
      if (i == 0) ausBibliothek();
      else if (i == 1) {
        Kostuem k;
        if (figur.istBuehne) {
          Bitmap b = Bitmap.createBitmap(960, 720, Bitmap.Config.ARGB_8888);
          b.eraseColor(0xFFFFFFFF);
          k = new Kostuem(freierName("Bild"), b, 480, 360, 2);
        } else {
          k = new Kostuem(freierName("Kostüm"), Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888), 1, 1, 2);
        }
        hinzufuegen(k);
      } else {
        Intent in = new Intent(Intent.ACTION_GET_CONTENT);
        in.setType("image/*");
        in.addCategory(Intent.CATEGORY_OPENABLE);
        try {
          startActivityForResult(Intent.createChooser(in, "Bild wählen"), WAHL_FOTO);
        } catch (Exception e) {
          Toast.makeText(this, "Keine App zum Auswählen von Bildern gefunden.", Toast.LENGTH_SHORT).show();
        }
      }
    });
  }

  private void ausBibliothek() {
    List<String> namen = new ArrayList<>();
    List<Bitmap> bilder = new ArrayList<>();
    final List<String> ids = new ArrayList<>();
    if (figur.istBuehne) {
      for (String b : Bibliothek.BUEHNENBILDER) {
        ids.add(b);
        namen.add(Bibliothek.bildName(b));
        bilder.add(Darstellung.vorschau(Bibliothek.kostuem(b), (int) (72 * d)));
      }
    } else {
      for (String[] f : Bibliothek.FIGUREN) for (int i = 1; i < f.length; i++) {
        ids.add(f[i]);
        namen.add(Bibliothek.kostuemName(f[i]));
        bilder.add(Darstellung.vorschau(Bibliothek.kostuem(f[i]), (int) (72 * d)));
      }
    }
    Auswahl.bilder(this, figur.istBuehne ? "Bühnenbild wählen" : "Kostüm wählen", namen, bilder, i -> {
      Kostuem k = Bibliothek.kostuem(ids.get(i));
      k.name = freierName(k.name);
      hinzufuegen(k);
    });
  }

  private void hinzufuegen(Kostuem k) {
    uebernehmen();
    figur.kostueme.add(k);
    waehle(figur.kostueme.size() - 1);
  }

  private void kostuemMenue(int i) {
    String[] punkte = {"Umbenennen", "Duplizieren", "Löschen"};
    Auswahl.liste(this, figur.kostueme.get(i).name, punkte, n -> {
      if (n == 0) {
        Auswahl.eingabe(this, "Umbenennen", figur.kostueme.get(i).name, false, t -> {
          String name = t.trim();
          if (name.isEmpty()) return;
          String alt = figur.kostueme.get(i).name;
          figur.kostueme.get(i).name = name;
          // Blöcke, die das Kostüm beim Namen nennen, mitnehmen
          Projekt p = HauptActivity.projekt;
          ArrayList<Figur> alle = new ArrayList<>(p.figuren);
          alle.add(p.buehne);
          String menue = figur.istBuehne ? "buehnenbild" : "kostuem";
          for (Figur f : alle) {
            if (!figur.istBuehne && f != figur) continue;
            for (Block b : f.skripte) b.ersetzeWert(menue, alt, name);
          }
          listeNeu();
        });
      } else if (n == 1) {
        uebernehmen();
        Kostuem k = figur.kostueme.get(i).kopie();
        k.name = freierName(k.name);
        figur.kostueme.add(i + 1, k);
        waehle(i + 1);
      } else {
        if (figur.kostueme.size() <= 1) {
          Toast.makeText(this, "Das letzte Kostüm bleibt.", Toast.LENGTH_SHORT).show();
          return;
        }
        mal.geaendert = false;
        figur.kostueme.remove(i);
        int neu = Math.min(gewaehlt > i ? gewaehlt - 1 : gewaehlt, figur.kostueme.size() - 1);
        gewaehlt = -1;
        waehle(Math.max(0, neu));
      }
    });
  }

  @Override protected void onActivityResult(int code, int ergebnis, Intent daten) {
    super.onActivityResult(code, ergebnis, daten);
    if (code != WAHL_FOTO || ergebnis != RESULT_OK || daten == null || daten.getData() == null) return;
    Bitmap b = HauptActivity.ladeBild(this, daten.getData(), figur.istBuehne ? 1200 : 480);
    if (b == null) {
      Toast.makeText(this, "Das Bild ließ sich nicht öffnen.", Toast.LENGTH_SHORT).show();
      return;
    }
    Kostuem k;
    if (figur.istBuehne) {
      // füllend einpassen und mittig zuschneiden
      Bitmap bild = Bitmap.createBitmap(960, 720, Bitmap.Config.ARGB_8888);
      Canvas c = new Canvas(bild);
      float s = Math.max(960f / b.getWidth(), 720f / b.getHeight());
      c.translate((960 - b.getWidth() * s) / 2, (720 - b.getHeight() * s) / 2);
      c.scale(s, s);
      c.drawBitmap(b, 0, 0, new Paint(Paint.FILTER_BITMAP_FLAG));
      k = new Kostuem(freierName("Foto"), bild, 480, 360, 2);
    } else {
      k = new Kostuem(freierName("Foto"), b, b.getWidth() / 2f, b.getHeight() / 2f, 2);
    }
    hinzufuegen(k);
  }
}
