// ============================================================
// L'Atelier Mya — comportements partagés (toutes les pages publiques)
// ============================================================
(function () {
  'use strict';
  var CFG = window.MYA_CONFIG || {};
  var script = document.currentScript;
  // Racine du site, déduite de l'emplacement de ce fichier (…/assets/site.js)
  var ROOT = script ? new URL('../', script.src).href : '/';
  var doc = document.documentElement;
  doc.classList.remove('no-js');

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }

  // ─── Statistiques (Plausible, sans cookies) ──────────────────
  window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
  if (CFG.plausibleDomain) {
    var ps = document.createElement('script');
    ps.defer = true; ps.src = 'https://plausible.io/js/script.outbound-links.js';
    ps.setAttribute('data-domain', CFG.plausibleDomain);
    document.head.appendChild(ps);
  }
  function track(name, props) { try { window.plausible(name, { props: props || {} }); } catch (e) {} }

  // ─── Menu mobile (pages générées : <nav class="nav">) ────────
  var nav = $('.nav');
  var burger = $('.nav-burger');
  if (nav && burger) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $$('.nav-links a', nav).forEach(function (a) {
      a.addEventListener('click', function () { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }
    });
  }

  // ─── Apparition au scroll ────────────────────────────────────
  var els = $$('.reveal');
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); } });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (el) { io.observe(el); });
  } else {
    els.forEach(function (el) { el.classList.add('visible'); });
  }

  // ─── Barre "Réserver" mobile ─────────────────────────────────
  var bar = $('.mobile-book');
  var hero = $('.svc-hero, [data-hero]');
  if (bar && hero) {
    var onScroll = function () { bar.classList.toggle('show', window.scrollY > hero.offsetHeight - 120); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ─── Badge "Ouvert maintenant" ───────────────────────────────
  (function openNow() {
    var targets = $$('[data-open-now]');
    if (!targets.length || !CFG.horaires) return;
    var parts = {};
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
        .formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    } catch (e) { return; }
    var days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    var noms = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    var d = days[parts.weekday], h = Number(parts.hour) + Number(parts.minute) / 60;
    var today = CFG.horaires[d], label, open = false;
    function fmt(x) { return Math.floor(x) + 'h' + (x % 1 ? String(Math.round((x % 1) * 60)).padStart(2, '0') : ''); }
    if (today && h >= today[0] && h < today[1]) {
      open = true; label = 'Ouvert maintenant · jusqu’à ' + fmt(today[1]);
    } else if (today && h < today[0]) {
      label = 'Fermé · ouvre aujourd’hui à ' + fmt(today[0]);
    } else {
      for (var i = 1; i <= 7; i++) {
        var nd = (d + i) % 7, slot = CFG.horaires[nd];
        if (slot) { label = 'Fermé · ouvre ' + (i === 1 ? 'demain' : noms[nd]) + ' à ' + fmt(slot[0]); break; }
      }
    }
    targets.forEach(function (t) { t.textContent = label; t.classList.add(open ? 'is-open' : 'is-closed'); });
  })();

  // ─── Fenêtre "Avant de réserver" (contre-indications) ────────
  (function bookingGate() {
    if (!CFG.planityUrl) return;
    var modal = document.createElement('div');
    modal.className = 'book-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'bookModalTitle');
    modal.innerHTML =
      '<div class="book-modal-box">' +
      '<h2 id="bookModalTitle">Avant de réserver</h2>' +
      '<p>Pour votre sécurité, certains soins ne peuvent pas être réalisés dans les situations suivantes :</p>' +
      '<ul>' +
      '<li>Fièvre, infection ou inflammation aiguë ; cancer en cours de traitement</li>' +
      '<li>Épilepsie, malaises fréquents, hypertension non contrôlée, troubles circulatoires importants</li>' +
      '<li>Chirurgie récente (moins de 3 mois) de la tête ou du cou</li>' +
      '<li>Cuir chevelu irrité, coloration de moins de 48 h, extensions ou tresses collées (Head Spa)</li>' +
      '<li>Grossesse : luminothérapie déconseillée ; Head Spa et massages au 1er trimestre sur avis médical</li>' +
      '<li>Allergie connue aux produits ou huiles utilisés</li>' +
      '</ul>' +
      '<p>En cas de doute, appelez l’institut au <a href="tel:' + esc(CFG.phone) + '">06 38 46 74 14</a>. La praticienne peut adapter ou refuser un soin le jour du rendez-vous.</p>' +
      '<label><input type="checkbox" id="bookModalCheck"> J’ai pris connaissance des contre-indications et je ne suis concernée par aucune de ces situations.</label>' +
      '<div class="btns"><button type="button" class="btn btn-ghost" id="bookModalCancel">Annuler</button>' +
      '<a class="btn btn-primary" id="bookModalGo" target="_blank" rel="noopener" aria-disabled="true" href="' + esc(CFG.planityUrl) + '">Continuer vers la réservation ↗</a></div>' +
      '</div>';
    document.body.appendChild(modal);
    var check = $('#bookModalCheck', modal), go = $('#bookModalGo', modal), lastFocus = null;
    function close() { modal.classList.remove('open'); if (lastFocus) lastFocus.focus(); }
    check.addEventListener('change', function () { go.setAttribute('aria-disabled', check.checked ? 'false' : 'true'); });
    $('#bookModalCancel', modal).addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('open')) close(); });
    go.addEventListener('click', function () {
      store('mya_ci_ok', '1');
      track('Réservation', { page: location.pathname });
      setTimeout(close, 50);
    });
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href*="planity.com"]');
      if (!a || modal.contains(a) || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (store('mya_ci_ok') === '1') { track('Réservation', { page: location.pathname }); return; }
      e.preventDefault();
      lastFocus = a;
      go.href = a.href;
      check.checked = false; go.setAttribute('aria-disabled', 'true');
      modal.classList.add('open');
      check.focus();
    });
  })();

  // ─── Bouton WhatsApp ─────────────────────────────────────────
  if (CFG.whatsapp && !document.body.hasAttribute('data-no-wa')) {
    var wa = document.createElement('a');
    wa.className = 'wa-btn';
    wa.href = 'https://wa.me/' + encodeURIComponent(CFG.whatsapp) + '?text=' + encodeURIComponent('Bonjour Myriam, j’ai une question sur vos soins : ');
    wa.target = '_blank'; wa.rel = 'noopener';
    wa.setAttribute('aria-label', 'Poser une question sur WhatsApp');
    wa.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47 0 1.46 1.06 2.87 1.21 3.07.15.2 2.09 3.2 5.07 4.48.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.37 9.37 0 0 1-1.44-5c0-5.18 4.22-9.4 9.42-9.4a9.34 9.34 0 0 1 6.66 2.76 9.34 9.34 0 0 1 2.75 6.65c0 5.18-4.22 9.4-9.4 9.4m8-17.42A11.24 11.24 0 0 0 12.04.75C5.8.75.73 5.82.73 12.06c0 2 .52 3.94 1.51 5.65L.64 23.5l5.92-1.55a11.3 11.3 0 0 0 5.48 1.4h.01c6.23 0 11.3-5.08 11.3-11.31 0-3.02-1.17-5.86-3.3-8"/></svg>';
    wa.addEventListener('click', function () { track('WhatsApp', { page: location.pathname }); });
    document.body.appendChild(wa);
  }

  // ─── Avant / après ───────────────────────────────────────────
  $$('[data-ba]').forEach(function (fig) {
    var range = $('.ba-range', fig), before = $('.ba-before', fig), frame = $('.ba-frame', fig);
    function set() { var v = range.value; before.style.clipPath = 'inset(0 ' + (100 - v) + '% 0 0)'; frame.style.setProperty('--pos', v + '%'); }
    range.addEventListener('input', set); set();
  });

  // ─── Carte Google Maps chargée au clic (pas de cookies avant consentement) ──
  $$('[data-map-consent]').forEach(function (box) {
    var btn = $('button', box);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var f = document.createElement('iframe');
      f.src = box.getAttribute('data-map-consent');
      f.title = 'Carte : L’Atelier Mya, 24 avenue Charlie Chaplin, Sainte-Geneviève-des-Bois';
      f.loading = 'lazy'; f.referrerPolicy = 'no-referrer-when-downgrade';
      f.style.cssText = 'width:100%;height:100%;border:0';
      box.replaceWith(f);
    });
  });

  // ─── Quiz "Quel soin pour moi ?" ─────────────────────────────
  var quizEl = $('[data-quiz]');
  var CAT = window.MYA_CATALOGUE;
  if (quizEl && CAT) {
    var Q = [
      { k: 'obj', q: 'Quelle est votre envie du moment ?', o: [
        { v: 'detente', t: 'Lâcher prise', s: 'Me détendre en profondeur' },
        { v: 'visage', t: 'Un visage éclatant', s: 'Teint lumineux, traits reposés' },
        { v: 'silhouette', t: 'Affiner ma silhouette', s: 'Ventre, cuisses, cellulite' },
        { v: 'jambes', t: 'Des jambes légères', s: 'Lourdeurs, rétention d’eau' }] },
      { k: 'prog', q: 'Une séance, ou un programme ?', o: [
        { v: 'seance', t: 'Une séance', s: 'Pour me faire du bien' },
        { v: 'cure', t: 'Un programme', s: 'Pour des résultats durables' }] },
      { k: 'temps', q: 'De combien de temps disposez-vous ?', o: [
        { v: 40, t: 'Moins de 45 minutes' },
        { v: 60, t: 'Environ une heure' },
        { v: 95, t: 'Une heure et demie, voire plus' }] },
      { k: 'budget', q: 'Quel budget pour ce soin ?', o: [
        { v: 75, t: 'Jusqu’à 75 €' },
        { v: 110, t: 'Jusqu’à 110 €' },
        { v: 99999, t: 'Peu importe' }] }
    ];
    var answers = {}, step = 0;
    var head = '<div class="quiz-head"><div class="eyebrow eyebrow-light">Conseil personnalisé</div><h2>Quel soin est <em>fait pour vous ?</em></h2><p>Quatre questions, et je vous propose les soins les plus adaptés.</p></div>';

    function score(f) {
      if (!f.objectifs.length || f.prix < 20) return -1e9;
      var s = 0;
      s += f.objectifs.indexOf(answers.obj) >= 0 ? (f.objectifs[0] === answers.obj ? 12 : 9) : -20;
      if (answers.prog === 'cure') s += f.cure ? 8 : -3;
      else if (f.cure) return -1e9;
      if (!f.cure) {
        s -= Math.abs(f.minutes - answers.temps) / 12;
        if (f.prix > answers.budget) s -= 6 + (f.prix - answers.budget) / 15;
      }
      return s;
    }
    function render() {
      if (step < Q.length) {
        var q = Q[step];
        var prog = Q.map(function (_, i) { return '<span class="' + (i <= step ? 'on' : '') + '"></span>'; }).join('');
        quizEl.innerHTML = head + '<div class="quiz-progress" aria-hidden="true">' + prog + '</div>' +
          '<p class="quiz-q" id="quizQ">' + esc(q.q) + '</p>' +
          '<div class="quiz-opts" role="group" aria-labelledby="quizQ">' + q.o.map(function (o, i) {
            return '<button type="button" class="quiz-opt" data-i="' + i + '">' + esc(o.t) + (o.s ? '<small>' + esc(o.s) + '</small>' : '') + '</button>';
          }).join('') + '</div>' +
          (step > 0 ? '<button type="button" class="quiz-back">← Question précédente</button>' : '');
        $$('.quiz-opt', quizEl).forEach(function (b) {
          b.addEventListener('click', function () {
            if (step === 1 && q.o[b.dataset.i].v === 'cure') { answers.prog = 'cure'; answers.temps = 60; answers.budget = 99999; step = Q.length; }
            else { answers[q.k] = q.o[b.dataset.i].v; step++; }
            render();
            quizEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
        var back = $('.quiz-back', quizEl);
        if (back) back.addEventListener('click', function () { step--; render(); });
        return;
      }
      var ranked = CAT.formules.map(function (f) { return { f: f, s: score(f) }; })
        .filter(function (x) { return x.s > -1e8; })
        .sort(function (a, b) { return b.s - a.s; });
      // Une seule formule par soin dans les 3 propositions
      var seen = {}, top = [];
      ranked.forEach(function (x) { if (top.length < 3 && !seen[x.f.soin]) { seen[x.f.soin] = 1; top.push(x.f); } });
      if (top.length < 3) ranked.forEach(function (x) { if (top.length < 3 && top.indexOf(x.f) < 0) top.push(x.f); });
      track('Quiz terminé', { objectif: answers.obj, recommandation: top[0] && top[0].id });
      quizEl.innerHTML = head + '<div class="quiz-results">' + top.map(function (f, i) {
        return '<article class="quiz-card' + (i === 0 ? ' best' : '') + '">' +
          '<img src="' + esc(f.img) + '" alt="" loading="lazy">' +
          '<div class="quiz-card-body"><span class="tag">' + (i === 0 ? 'Notre conseil · ' : '') + esc(f.famille) + '</span>' +
          '<h3>' + esc(f.nom) + '</h3><p>' + esc(f.desc) + '</p>' +
          '<span class="price">' + f.prix + ' € · ' + esc(f.duree) + '</span>' +
          '<div class="actions"><a href="' + ROOT + esc(f.url) + '">Le soin →</a>' +
          (f.offrable ? '<a href="' + ROOT + 'carte-cadeau.html?f=' + encodeURIComponent(f.id) + '">Offrir</a>' : '') + '</div></div></article>';
      }).join('') + '</div><button type="button" class="quiz-back">↺ Recommencer</button>';
      $('.quiz-back', quizEl).addEventListener('click', function () { answers = {}; step = 0; render(); });
    }
    render();
  }
})();
