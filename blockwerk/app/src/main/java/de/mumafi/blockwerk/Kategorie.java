package de.mumafi.blockwerk;

/** Die Farbgruppen der Blöcke, in der Reihenfolge der Palette. */
enum Kategorie {
  BEWEGUNG("Bewegung", 0xFF3E8EF7),
  AUSSEHEN("Aussehen", 0xFF8A5CF5),
  KLANG("Klang", 0xFFD453C4),
  EREIGNISSE("Ereignisse", 0xFFEBAE05),
  STEUERUNG("Steuerung", 0xFFF29420),
  FUEHLEN("Fühlen", 0xFF2FA9D6),
  OPERATOREN("Operatoren", 0xFF47B347),
  VARIABLEN("Variablen", 0xFFF2702A),
  STIFT("Stift", 0xFF10AD85);

  final String name;
  final int farbe;
  /** Randlinie der Blöcke */
  final int rand;
  /** Grund für Auswahlfelder und leere Bedingungsfelder */
  final int dunkel;

  Kategorie(String name, int farbe) {
    this.name = name;
    this.farbe = farbe;
    this.rand = abdunkeln(farbe, 0.80f);
    this.dunkel = abdunkeln(farbe, 0.84f);
  }

  static int abdunkeln(int c, float f) {
    int a = c >>> 24, r = (c >> 16) & 0xFF, g = (c >> 8) & 0xFF, b = c & 0xFF;
    return (a << 24) | ((int) (r * f) << 16) | ((int) (g * f) << 8) | (int) (b * f);
  }
}
