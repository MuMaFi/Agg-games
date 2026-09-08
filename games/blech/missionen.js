/* ═══════════════════════════════════════════════════════════════════
   Auftragskette. Jede Mission besteht aus Schritten, die das Spiel
   der Reihe nach abarbeitet:
     fahre     — einen Punkt erreichen (imWagen: nur im Auto zählt es)
     liefere   — wie fahre, nur mit anderem Text
     sammle    — mehrere verstreute Punkte einsammeln
     raeume    — alle Gegner im Umkreis ausschalten
     entkomme  — die Fahndung wieder auf null bringen
   Orte sind bewusst zufällig gesetzt: die Stadt wird aus einem
   Startwert erzeugt, feste Koordinaten würden bei jeder Änderung
   am Generator ins Leere zeigen.
   ═══════════════════════════════════════════════════════════════════ */
export const MISSIONEN = [
  {
    name: 'Erste Schicht', lohn: 250,
    text: 'Rico braucht einen Fahrer. Heute nur Blech, kein Ärger.',
    schritte: [
      {art:'fahre',   ort:'zufall', imWagen:true, text:'Besorg dir einen Wagen und fahr zum gelben Ring.'},
      {art:'liefere', ort:'zufall', imWagen:true, text:'Bring die Kiste zur Halle am zweiten Ring.'}
    ]
  },
  {
    name: 'Pfandflucht', lohn: 400, zeit: 95,
    text: 'Drei Automaten, ein Transporter, 95 Sekunden.',
    schritte: [
      {art:'sammle', anzahl:3, text:'Sammle die drei Ladungen ein — die Uhr läuft.'},
      {art:'liefere', ort:'zufall', imWagen:true, text:'Alles zum Hinterhof bringen.'}
    ]
  },
  {
    name: 'Gegenbesuch', lohn: 650,
    text: 'Die Veilchen-Bande hat Ricos Werkstatt aufgemischt.',
    schritte: [
      {art:'fahre',  ort:'zufall', text:'Fahr zu ihrem Treffpunkt.'},
      {art:'raeume', ort:'zufall', anzahl:4, text:'Räum den Hof. Vier Mann.'},
      {art:'entkomme', text:'Weg hier. Fahndung auf null bringen.'}
    ]
  },
  {
    name: 'Nachtschicht', lohn: 500, zeit: 120,
    text: 'Vier Übergaben quer durch die Stadt. Nicht trödeln.',
    schritte: [
      {art:'sammle', anzahl:4, text:'Vier Übergaben abklappern.'},
      {art:'liefere', ort:'zufall', imWagen:true, text:'Zurück zur Werkstatt.'}
    ]
  },
  {
    name: 'Der Wagen von gegenüber', lohn: 800,
    text: 'Es gibt da einen Sportwagen, der niemandem mehr gehört.',
    schritte: [
      {art:'fahre', ort:'zufall', text:'Zum Parkplatz laufen.'},
      {art:'raeume', ort:'zufall', anzahl:3, text:'Drei Wachen stehen im Weg.'},
      {art:'liefere', ort:'zufall', imWagen:true, text:'Wagen zur Werkstatt bringen.'},
      {art:'entkomme', text:'Und jetzt unsichtbar machen.'}
    ]
  },
  {
    name: 'Ablenkung', lohn: 700, zeit: 100,
    text: 'Die Streifen sollen dir folgen, nicht Rico.',
    schritte: [
      {art:'sammle', anzahl:5, text:'Fünf Punkte anfahren — laut und auffällig.'},
      {art:'entkomme', text:'Jetzt abschütteln.'}
    ]
  },
  {
    name: 'Hinterhalt', lohn: 1100,
    text: 'Sie wissen, dass du kommst. Das ist der Plan.',
    schritte: [
      {art:'fahre',  ort:'zufall', imWagen:true, text:'Fahr in den Hinterhalt.'},
      {art:'raeume', ort:'zufall', anzahl:6, text:'Sechs Mann. Viel Glück.'},
      {art:'sammle', anzahl:2, text:'Die zwei Kassetten einsammeln.'},
      {art:'entkomme', text:'Raus, bevor die Streifen zumachen.'}
    ]
  },
  {
    name: 'Letzte Fuhre', lohn: 2000, zeit: 180,
    text: 'Einmal quer durch alles, dann ist Feierabend.',
    schritte: [
      {art:'sammle', anzahl:4, text:'Vier Depots leerräumen.'},
      {art:'raeume', ort:'zufall', anzahl:5, text:'Sie warten am Umschlagplatz.'},
      {art:'liefere', ort:'zufall', imWagen:true, text:'Alles zum Hafen fahren.'},
      {art:'entkomme', text:'Und dann verschwindest du.'}
    ]
  }
];
