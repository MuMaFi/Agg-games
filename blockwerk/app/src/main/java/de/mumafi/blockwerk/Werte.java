package de.mumafi.blockwerk;

import java.util.regex.Pattern;

/** Werte in Skripten sind Zahlen (Double), Texte (String) oder Wahrheitswerte
 *  (Boolean). Wie bei Blocksprachen üblich, wird still umgewandelt: ein Text,
 *  der keine Zahl ist, zählt als 0, und Vergleiche rechnen mit Zahlen, wenn
 *  beide Seiten welche sind, sonst vergleichen sie Texte ohne Groß und klein. */
final class Werte {
  private Werte() {}

  private static final Pattern ZAHL =
      Pattern.compile("[+-]?(\\d+([.,]\\d*)?|[.,]\\d+)([eE][+-]?\\d+)?");

  static Double alsZahlOderNull(Object o) {
    if (o instanceof Double) { double d = (Double) o; return Double.isNaN(d) ? null : d; }
    if (o instanceof Boolean || o == null) return null;
    String s = o.toString().trim();
    if (s.isEmpty()) return null;
    if (ZAHL.matcher(s).matches()) {
      try { return Double.parseDouble(s.replace(',', '.')); } catch (NumberFormatException e) { return null; }
    }
    if (s.equals("Infinity") || s.equals("+Infinity")) return Double.POSITIVE_INFINITY;
    if (s.equals("-Infinity")) return Double.NEGATIVE_INFINITY;
    return null;
  }

  static double zahl(Object o) {
    if (o instanceof Boolean) return ((Boolean) o) ? 1 : 0;
    Double d = alsZahlOderNull(o);
    return d == null ? 0 : d;
  }

  static String text(Object o) {
    if (o instanceof Double) return zahlText((Double) o);
    if (o instanceof Boolean) return ((Boolean) o) ? "wahr" : "falsch";
    return o == null ? "" : o.toString();
  }

  static String zahlText(double d) {
    if (Double.isNaN(d)) return "0";
    if (Double.isInfinite(d)) return d > 0 ? "Infinity" : "-Infinity";
    if (d == Math.rint(d) && Math.abs(d) < 1e15) return Long.toString((long) d);
    String s = Double.toString(d);
    if (s.contains("E")) {
      // 1.0E-5 → 1e-5
      s = s.replace(".0E", "E").replace("E", "e");
    }
    return s;
  }

  static boolean wahr(Object o) {
    if (o instanceof Boolean) return (Boolean) o;
    if (o instanceof Double) { double d = (Double) o; return d != 0 && !Double.isNaN(d); }
    if (o == null) return false;
    String s = o.toString().trim().toLowerCase();
    return !(s.isEmpty() || s.equals("0") || s.equals("falsch") || s.equals("false"));
  }

  static int vergleiche(Object a, Object b) {
    Double x = alsZahlOderNull(a), y = alsZahlOderNull(b);
    if (x != null && y != null) {
      if (x.doubleValue() == y.doubleValue()) return 0;
      return x < y ? -1 : 1;
    }
    return text(a).toLowerCase().compareTo(text(b).toLowerCase());
  }

  static boolean gleich(Object a, Object b) { return vergleiche(a, b) == 0; }

  /** Ganzzahl für Zählschleifen und Positionen in Texten. */
  static int ganz(Object o) {
    double d = zahl(o);
    if (d > Integer.MAX_VALUE) return Integer.MAX_VALUE;
    if (d < Integer.MIN_VALUE) return Integer.MIN_VALUE;
    return (int) Math.round(d);
  }
}
