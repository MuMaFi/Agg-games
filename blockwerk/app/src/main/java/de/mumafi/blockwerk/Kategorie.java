package de.mumafi.blockwerk;

/** Die Farbgruppen der Blöcke, in der Reihenfolge der Palette. */
enum Kategorie {
  BEWEGUNG("Bewegung", 0xFF4A78C2),
  AUSSEHEN("Aussehen", 0xFF7A63C0),
  KLANG("Klang", 0xFF9E5AA3),
  EREIGNISSE("Ereignisse", 0xFFB08A2E),
  STEUERUNG("Steuerung", 0xFFC2772F),
  FUEHLEN("Fühlen", 0xFF3A8AAD),
  OPERATOREN("Operatoren", 0xFF4A9659),
  VARIABLEN("Variablen", 0xFFC0653A),
  STIFT("Stift", 0xFF2F8A7B);

  final String name;
  final int farbe;
  /** Randlinie der Blöcke */
  final int rand;
  /** Grund für Auswahlfelder und leere Bedingungsfelder */
  final int dunkel;

  Kategorie(String name, int farbe) {
    this.name = name;
    this.farbe = farbe;
    this.rand = abdunkeln(farbe, 0.82f);
    this.dunkel = abdunkeln(farbe, 0.86f);
  }

  static int abdunkeln(int c, float f) {
    int a = c >>> 24, r = (c >> 16) & 0xFF, g = (c >> 8) & 0xFF, b = c & 0xFF;
    return (a << 24) | ((int) (r * f) << 16) | ((int) (g * f) << 8) | (int) (b * f);
  }
}
