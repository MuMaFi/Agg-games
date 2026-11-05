package de.mumafi.blockwerk;

import android.content.Context;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.view.Gravity;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Zeigt das Projekt als Java-Code, mit Hervorhebung wie in einer
 *  Entwicklungsumgebung. Kopieren und Exportieren übernimmt die Aktivität. */
final class CodeAnsicht extends LinearLayout {

  interface Wirt {
    void codeKopieren();
    void codeExportieren();
  }

  private static final Set<String> SCHLUESSEL = new HashSet<>(Arrays.asList(
      "public", "private", "protected", "static", "final", "class", "extends", "void", "if", "else", "for",
      "while", "int", "double", "boolean", "new", "return", "true", "false", "null", "import", "super",
      "this", "do", "switch", "case", "break"));

  private final TextView code;
  private final TextView info;
  private final float d;

  CodeAnsicht(Context c, Wirt wirt) {
    super(c);
    d = getResources().getDisplayMetrics().density;
    setOrientation(VERTICAL);
    setBackgroundColor(0xFFFFFFFF);

    LinearLayout kopf = new LinearLayout(c);
    kopf.setGravity(Gravity.CENTER_VERTICAL);
    kopf.setBackgroundColor(0xFFF3F4F6);
    int pad = (int) (10 * d);
    kopf.setPadding(pad, (int) (6 * d), (int) (6 * d), (int) (6 * d));
    info = new TextView(c);
    info.setTextColor(0xFF4B5563);
    info.setTextSize(12);
    kopf.addView(info, new LayoutParams(0, -2, 1));
    TextView kopieren = knopf(c, "Kopieren", false);
    kopieren.setOnClickListener(v -> wirt.codeKopieren());
    kopf.addView(kopieren);
    TextView exportieren = knopf(c, "Als .java speichern", true);
    exportieren.setOnClickListener(v -> wirt.codeExportieren());
    LayoutParams lp = new LayoutParams(-2, -2);
    lp.leftMargin = (int) (6 * d);
    kopf.addView(exportieren, lp);
    addView(kopf, new LayoutParams(-1, -2));

    code = new TextView(c);
    code.setTypeface(Typeface.MONOSPACE);
    code.setTextSize(12);
    code.setTextColor(0xFF1F2328);
    code.setTextIsSelectable(true);
    code.setHorizontallyScrolling(true);
    code.setPadding(pad, pad, pad * 2, pad * 3);
    HorizontalScrollView h = new HorizontalScrollView(c);
    h.addView(code);
    ScrollView v = new ScrollView(c);
    v.addView(h);
    addView(v, new LayoutParams(-1, 0, 1));
  }

  private TextView knopf(Context c, String text, boolean hervorgehoben) {
    TextView k = new TextView(c);
    k.setText(text);
    k.setTextSize(13);
    k.setTextColor(hervorgehoben ? 0xFFFFFFFF : 0xFF374151);
    k.setPadding((int) (12 * d), (int) (7 * d), (int) (12 * d), (int) (7 * d));
    GradientDrawable g = new GradientDrawable();
    g.setColor(hervorgehoben ? 0xFF2563EB : 0xFFFFFFFF);
    g.setCornerRadius(6 * d);
    if (!hervorgehoben) g.setStroke(Math.max(1, (int) d), 0xFFD1D5DB);
    k.setBackground(g);
    k.setClickable(true);
    return k;
  }

  void zeige(Projekt p) {
    JavaExport x = new JavaExport(p);
    String text = x.programm();
    info.setText(x.klasse + ".java");
    code.setText(faerben(text + "\n// Beim Speichern folgen hier die Bilder und die Laufzeit (Welt, Figur, Buehne …),\n"
        + "// damit die Datei für sich allein läuft:  java " + x.klasse + ".java\n"));
  }

  /** Einfache Hervorhebung: Schlüsselwörter, Texte, Zahlen, Kommentare. */
  static CharSequence faerben(String s) {
    SpannableStringBuilder b = new SpannableStringBuilder(s);
    int i = 0, n = s.length();
    while (i < n) {
      char c = s.charAt(i);
      if (c == '/' && i + 1 < n && (s.charAt(i + 1) == '/' || s.charAt(i + 1) == '*')) {
        int ende = s.charAt(i + 1) == '/' ? s.indexOf('\n', i) : s.indexOf("*/", i) + 2;
        if (ende < i + 2) ende = n;
        b.setSpan(new ForegroundColorSpan(0xFF8C8C8C), i, ende, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        b.setSpan(new StyleSpan(Typeface.ITALIC), i, ende, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        i = ende;
      } else if (c == '"') {
        int j = i + 1;
        while (j < n && s.charAt(j) != '"' && s.charAt(j) != '\n') j += s.charAt(j) == '\\' ? 2 : 1;
        j = Math.min(n, j + 1);
        b.setSpan(new ForegroundColorSpan(0xFF067D17), i, j, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        i = j;
      } else if (Character.isDigit(c) && (i == 0 || !Character.isJavaIdentifierPart(s.charAt(i - 1)))) {
        int j = i;
        while (j < n && (Character.isLetterOrDigit(s.charAt(j)) || s.charAt(j) == '.')) j++;
        b.setSpan(new ForegroundColorSpan(0xFF1750EB), i, j, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        i = j;
      } else if (Character.isJavaIdentifierStart(c)) {
        int j = i;
        while (j < n && Character.isJavaIdentifierPart(s.charAt(j))) j++;
        String wort = s.substring(i, j);
        if (SCHLUESSEL.contains(wort)) {
          b.setSpan(new ForegroundColorSpan(0xFF0033B3), i, j, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
          b.setSpan(new StyleSpan(Typeface.BOLD), i, j, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        } else if (j < n && s.charAt(j) == '(') {
          b.setSpan(new ForegroundColorSpan(0xFF00627A), i, j, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        } else if (Character.isUpperCase(c)) {
          b.setSpan(new ForegroundColorSpan(0xFF000000), i, j, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        i = j;
      } else if (c == '@') {
        int j = i + 1;
        while (j < n && Character.isJavaIdentifierPart(s.charAt(j))) j++;
        b.setSpan(new ForegroundColorSpan(0xFF9E880D), i, j, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        i = j;
      } else {
        i++;
      }
    }
    return b;
  }
}
