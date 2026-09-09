/**
 * Daumensteuerung.
 *
 * Am Rechner hält der Zeiger die Kamera (Pointer-Lock) — auf dem Telefon
 * gibt es das schlicht nicht: `requestPointerLock` ist dort ohne Wirkung,
 * und `mousemove` liefert kein `movementX`. Also eine zweite Bedienung:
 * links ein Knüppel, der dort auftaucht, wo der Daumen aufsetzt, rechts
 * eine Fläche zum Umsehen, und drei Knöpfe für Springen, Schlagen und E.
 *
 * Die Ebene bleibt unsichtbar, bis der erste Finger sie anfasst. Wer mit
 * Maus spielt, sieht sie nie — auch nicht auf einem Rechner mit
 * Berührungsbildschirm, denn entschieden wird pro Zeiger, nicht pro Gerät.
 */
const STIL = `
#daumen{position:fixed; inset:0; z-index:20; pointer-events:none; display:none;
  touch-action:none; -webkit-user-select:none; user-select:none}
#daumen.an{display:block}
/* Auf einem Gerät, das nur Finger kennt, steht die Steuerung von Anfang an
   da: sonst schluckt die erste Berührung nur das Einblenden, und ein
   Tippen auf SCHLAG geht beim ersten Mal ins Leere. */
@media (hover:none) and (pointer:coarse){ #daumen{display:block} }
#knueppel{position:absolute; width:124px; height:124px; margin:-62px 0 0 -62px;
  border-radius:50%; border:2px solid #ffffff38; background:#0b102055;
  display:none; touch-action:none}
#knueppel.an{display:block}
#knueppel i{position:absolute; left:50%; top:50%; width:54px; height:54px;
  margin:-27px 0 0 -27px; border-radius:50%; background:#ffffffcc;
  box-shadow:0 2px 8px #0006}
#dknoepfe{position:absolute; right:calc(16px + env(safe-area-inset-right,0px));
  bottom:calc(16px + env(safe-area-inset-bottom,0px));
  display:grid; grid-template-columns:auto auto; gap:10px; align-items:end}
#dknoepfe button{
  font-family:'Segoe UI',Arial,sans-serif; font-size:12px; font-weight:700;
  letter-spacing:.06em; color:#fff; pointer-events:auto; touch-action:none;
  width:64px; height:64px; border-radius:50%; cursor:pointer;
  border:2px solid #ffffff44; background:#131a30cc; backdrop-filter:blur(3px);
}
#dknoepfe button:active, #dknoepfe button.ab{transform:scale(.93); background:#2ecc7166; border-color:#2ecc71}
#dknoepfe button.gross{width:78px; height:78px; font-size:13px}
#dknoepfe .leer{width:0}
@media (max-height:430px){
  #dknoepfe button{width:56px; height:56px; font-size:11px}
  #dknoepfe button.gross{width:66px; height:66px}
  #knueppel{width:104px; height:104px; margin:-52px 0 0 -52px}
  #knueppel i{width:46px; height:46px; margin:-23px 0 0 -23px}
}`;

export class Daumen {
  aktiv = false;                       // erst wahr, wenn ein Finger da war
  knueppel = { x: 0, y: 0 };           // -1..1, analog
  #ruf; #stiel = null; #blick = null; #wurzel; #stab; #knopf;

  constructor(rufe) {
    this.#ruf = rufe;

    const stil = document.createElement('style');
    stil.textContent = STIL;
    document.head.appendChild(stil);

    this.#wurzel = document.createElement('div');
    this.#wurzel.id = 'daumen';
    this.#wurzel.innerHTML =
      '<div id="knueppel"><i></i></div>' +
      '<div id="dknoepfe">' +
        '<button type="button" data-tu="nutzen">E</button>' +
        '<button type="button" data-tu="schlagen">SCHLAG</button>' +
        '<span class="leer"></span>' +
        '<button type="button" data-tu="springen" class="gross">SPRUNG</button>' +
      '</div>';
    document.body.appendChild(this.#wurzel);
    this.#stab = this.#wurzel.querySelector('#knueppel');
    this.#knopf = this.#stab.querySelector('i');

    for (const b of this.#wurzel.querySelectorAll('button')) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.#wecken();
        const tu = this.#ruf[b.dataset.tu];
        if (tu) tu();
        b.classList.add('ab');
        setTimeout(() => b.classList.remove('ab'), 110);
      });
    }

    addEventListener('pointerdown', (e) => this.#nieder(e), { passive: false });
    addEventListener('pointermove', (e) => this.#zug(e), { passive: false });
    for (const art of ['pointerup', 'pointercancel'])
      addEventListener(art, (e) => this.#hoch(e));
  }

  #wecken() {
    if (this.aktiv) return;
    this.aktiv = true;
    this.#wurzel.classList.add('an');
  }

  #nieder(e) {
    if (e.pointerType !== 'touch') return;       // Maus bleibt beim Pointer-Lock
    if (e.target.closest && e.target.closest('#dknoepfe')) return;
    this.#wecken();
    e.preventDefault();
    /* Linke Bildhälfte läuft, rechte schaut. Der Knüppel setzt sich unter
       den Daumen, statt an einer festen Stelle zu kleben — sonst muss man
       hinsehen, wo man greift. */
    if (e.clientX < innerWidth * 0.5) {
      if (this.#stiel) return;
      this.#stiel = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.#stab.style.left = e.clientX + 'px';
      this.#stab.style.top = e.clientY + 'px';
      this.#stab.classList.add('an');
      this.#setzen(0, 0);
    } else {
      if (this.#blick) return;
      this.#blick = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
  }

  #zug(e) {
    if (e.pointerType !== 'touch') return;
    if (this.#stiel && e.pointerId === this.#stiel.id) {
      e.preventDefault();
      const weit = 52;
      let dx = e.clientX - this.#stiel.x, dy = e.clientY - this.#stiel.y;
      const l = Math.hypot(dx, dy);
      if (l > weit) { dx = dx / l * weit; dy = dy / l * weit; }
      this.#setzen(dx, dy);
      this.knueppel.x = dx / weit;
      this.knueppel.y = dy / weit;
    } else if (this.#blick && e.pointerId === this.#blick.id) {
      e.preventDefault();
      const dx = e.clientX - this.#blick.x, dy = e.clientY - this.#blick.y;
      this.#blick.x = e.clientX; this.#blick.y = e.clientY;
      if (this.#ruf.umsehen) this.#ruf.umsehen(dx, dy);
    }
  }

  #hoch(e) {
    if (this.#stiel && e.pointerId === this.#stiel.id) {
      this.#stiel = null;
      this.#stab.classList.remove('an');
      this.knueppel.x = this.knueppel.y = 0;
      this.#setzen(0, 0);
    } else if (this.#blick && e.pointerId === this.#blick.id) {
      this.#blick = null;
    }
  }

  #setzen(dx, dy) {
    this.#knopf.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
