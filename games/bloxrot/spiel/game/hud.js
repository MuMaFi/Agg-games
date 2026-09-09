import { formatMoney } from './catalog.js';
/** DOM overlay: money counter, leaderboard, prompts and the notification feed. */
export class Hud {
    moneyEl;
    incomeEl;
    slotsEl;
    blockadeEl;
    promptEl;
    carryEl;
    feedEl;
    boardEl;
    lockHintEl;
    loadingEl;
    loadingBarEl;
    loadingLabelEl;
    constructor(rootSelector) {
        const root = document.querySelector(rootSelector);
        root.innerHTML = `
      <div id="hud">
        <div id="topbar">
          <div id="money-card">
            <div id="money">$0</div>
            <div id="income">+$0/s</div>
            <div id="slots">0/8 Plätze</div>
            <div id="blockade"></div>
          </div>
          <div id="leaderboard"></div>
        </div>
        <div id="carry-banner" class="hidden"></div>
        <div id="prompt" class="hidden"></div>
        <div id="feed"></div>
        <div id="lock-hint">🖱 Klicken zum Spielen — WASD laufen · Maus umsehen · Linksklick/F schlagen · E kaufen/klauen · Leertaste springen</div>
        <div id="crosshair">·</div>
      </div>
      <div id="loading">
        <h1>BLOXROT</h1>
        <div id="loading-bar-outer"><div id="loading-bar"></div></div>
        <div id="loading-label">Lädt…</div>
      </div>
    `;
        this.moneyEl = document.getElementById('money');
        this.incomeEl = document.getElementById('income');
        this.slotsEl = document.getElementById('slots');
        this.blockadeEl = document.getElementById('blockade');
        this.promptEl = document.getElementById('prompt');
        this.carryEl = document.getElementById('carry-banner');
        this.feedEl = document.getElementById('feed');
        this.boardEl = document.getElementById('leaderboard');
        this.lockHintEl = document.getElementById('lock-hint');
        this.loadingEl = document.getElementById('loading');
        this.loadingBarEl = document.getElementById('loading-bar');
        this.loadingLabelEl = document.getElementById('loading-label');
    }
    setLoading(label, done, total) {
        this.loadingBarEl.style.width = `${Math.round((done / total) * 100)}%`;
        this.loadingLabelEl.textContent = `Loading ${label}… (${done}/${total})`;
    }
    hideLoading() {
        this.loadingEl.classList.add('gone');
        setTimeout(() => this.loadingEl.remove(), 700);
    }
    setPointerLocked(locked) {
        this.lockHintEl.classList.toggle('hidden', locked);
    }
    setMoney(money, incomePerSec, used, total) {
        this.moneyEl.textContent = formatMoney(money);
        this.incomeEl.textContent = `+${formatMoney(incomePerSec)}/s`;
        this.slotsEl.textContent = `${used}/${total} Plätze`;
    }
    setBlockade(state, secondsLeft = 0) {
        if (state === 'ready') {
            this.blockadeEl.textContent = '🔒 Sperre bereit — auf den roten Knopf treten';
            this.blockadeEl.style.color = '#ff8a8a';
        }
        else if (state === 'active') {
            this.blockadeEl.textContent = `🔒 Sperre STEHT — noch ${Math.ceil(secondsLeft)}s`;
            this.blockadeEl.style.color = '#ff4444';
        }
        else {
            this.blockadeEl.textContent = '🔒 Sperre lädt nach…';
            this.blockadeEl.style.color = '#8a93ad';
        }
    }
    setPrompt(text) {
        if (text) {
            this.promptEl.textContent = text;
            this.promptEl.classList.remove('hidden');
        }
        else {
            this.promptEl.classList.add('hidden');
        }
    }
    setCarry(text, stolen) {
        if (text) {
            this.carryEl.textContent = text;
            this.carryEl.classList.remove('hidden');
            this.carryEl.classList.toggle('stolen', stolen);
        }
        else {
            this.carryEl.classList.add('hidden');
        }
    }
    notify(text, color = '#ffffff') {
        const div = document.createElement('div');
        div.className = 'feed-item';
        div.style.borderLeftColor = color;
        div.textContent = text;
        this.feedEl.prepend(div);
        while (this.feedEl.children.length > 6)
            this.feedEl.lastChild?.remove();
        setTimeout(() => {
            div.classList.add('fade');
            setTimeout(() => div.remove(), 600);
        }, 5200);
    }
    updateLeaderboard(entities) {
        const sorted = [...entities].sort((a, b) => b.money - a.money);
        this.boardEl.innerHTML = sorted
            .map((e) => {
            const cls = e.isPlayer ? 'lb-row me' : 'lb-row';
            return `<div class="${cls}"><span class="lb-dot" style="background:${e.colorHex}"></span>` +
                `<span class="lb-name">${e.name}</span><span class="lb-money">${formatMoney(e.money)}</span></div>`;
        })
            .join('');
    }
}
