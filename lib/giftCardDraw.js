/*
 * Dessin de la carte cadeau L'Atelier Mya — UN SEUL fichier, utilisé :
 *   • dans le navigateur (carte-cadeau-succes.html, aperçu sur carte-cadeau.html)
 *     via <script src="lib/giftCardDraw.js"> → window.MyaGiftCard
 *   • côté serveur (lib/renderGiftCardImage.js, image jointe à l'email)
 * Aucune dépendance : seulement l'API Canvas 2D standard.
 *
 * data = {
 *   kind: 'soin' | 'montant',
 *   soinName, soinFamily, soinDuration,   // si kind = 'soin'
 *   amountCents,                          // si kind = 'montant'
 *   recipientName, message, code, expiresAt
 * }
 * opts = { serif: 'Fraunces, serif', sans: '"DM Sans", sans-serif' }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MyaGiftCard = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var W = 1000, H = 600;
  var C = { ivoire: '#F5F1EA', terra: '#C4856A', terraDark: '#8B5A43', brun: '#3D2B1F', muted: '#7A5D4D', texte: '#5C3D2E' };

  function spaced(t) { return String(t).toUpperCase().split('').join(String.fromCharCode(8202)); }

  // Réduit la taille de police jusqu'à ce que le texte tienne sur maxWidth
  function fit(ctx, text, maxWidth, style, family, max, min) {
    var size = max;
    for (; size > min; size -= 2) {
      ctx.font = style + ' ' + size + 'px ' + family;
      if (ctx.measureText(text).width <= maxWidth) break;
    }
    ctx.font = style + ' ' + size + 'px ' + family;
    return size;
  }

  function wrap(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var words = String(text).split(/ +/), line = '', lines = []; // espaces normaux seulement : les insécables restent collées
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var last = lines[maxLines - 1];
      while (ctx.measureText(last + '…').width > maxWidth && last.length) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
    lines.forEach(function (l, i) { ctx.fillText(l, x, y + i * lineHeight); });
    return y + lines.length * lineHeight;
  }

  function draw(ctx, data, opts) {
    opts = opts || {};
    var serif = opts.serif || 'Fraunces, serif';
    var sans = opts.sans || 'sans-serif';
    var X = 380, MAXW = 560;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.ivoire;
    ctx.fillRect(0, 0, W, H);

    // Bande foncée
    var grad = ctx.createLinearGradient(0, 0, 340, H);
    grad.addColorStop(0, C.brun);
    grad.addColorStop(1, C.terraDark);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 340, H);

    ctx.strokeStyle = C.terra;
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, W - 20, H - 20);

    // Motif floral
    ctx.save();
    ctx.translate(170, 130);
    ctx.strokeStyle = 'rgba(253,250,247,0.55)';
    ctx.lineWidth = 1.6;
    for (var i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i * 2 * Math.PI) / 3);
      ctx.beginPath();
      ctx.ellipse(0, -22, 15, 24, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(253,250,247,0.8)';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FDFAF7';
    ctx.font = 'italic 500 32px ' + serif;
    ctx.fillText("L'Atelier Mya", 170, 240);
    ctx.font = '400 12px ' + sans;
    ctx.fillStyle = 'rgba(253,250,247,0.7)';
    ctx.fillText(spaced('Institut de bien-être'), 170, 270);
    ctx.font = '400 13px ' + sans;
    ctx.fillStyle = 'rgba(253,250,247,0.6)';
    ctx.fillText('Sainte-Geneviève-des-Bois', 170, 540);
    ctx.textAlign = 'left';

    // Contenu
    ctx.fillStyle = C.terraDark;
    ctx.font = '400 13px ' + sans;
    ctx.fillText(spaced('Carte cadeau'), X, 80);

    var y;
    if (data.kind === 'soin') {
      ctx.fillStyle = C.muted;
      ctx.font = '400 13px ' + sans;
      ctx.fillText(spaced(data.soinFamily || ''), X, 122);
      ctx.fillStyle = C.brun;
      fit(ctx, data.soinName || '', MAXW, 'italic 500', serif, 52, 28);
      ctx.fillText(data.soinName || '', X - 2, 176);
      if (data.soinDuration) {
        ctx.font = '400 15px ' + sans;
        ctx.fillStyle = C.muted;
        ctx.fillText('Un soin de ' + data.soinDuration, X, 208);
      }
      y = 256;
    } else {
      ctx.fillStyle = C.brun;
      ctx.font = 'italic 500 68px ' + serif;
      ctx.fillText(Math.round((data.amountCents || 0) / 100) + ' €', X - 2, 160);
      y = 214;
    }

    if (data.recipientName) {
      ctx.font = '400 14px ' + sans;
      ctx.fillStyle = C.muted;
      ctx.fillText('Pour', X, y);
      ctx.fillStyle = C.brun;
      fit(ctx, data.recipientName, MAXW, 'italic 400', serif, 26, 18);
      ctx.fillText(data.recipientName, X, y + 30);
      y += 74;
    }

    if (data.message) {
      ctx.font = 'italic 400 17px ' + serif;
      ctx.fillStyle = C.texte;
      var maxLines = Math.max(1, Math.floor((385 - y) / 25) + 1);
      wrap(ctx, '«\u00A0' + String(data.message).replace(/\s+/g, ' ').trim() + '\u00A0»', X, y, MAXW, 25, Math.min(maxLines, 4));
    }

    // Code
    ctx.strokeStyle = C.terra;
    if (ctx.setLineDash) ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.strokeRect(X, 410, MAXW, 96);
    if (ctx.setLineDash) ctx.setLineDash([]);
    ctx.font = '400 11px ' + sans;
    ctx.fillStyle = C.muted;
    ctx.fillText(spaced('Code'), X + 24, 442);
    ctx.font = '500 32px ' + serif;
    ctx.fillStyle = C.brun;
    ctx.fillText(data.code || 'MYA-XXXX-XXXX', X + 24, 482);

    var expires = data.expiresAt
      ? new Date(data.expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
      : '6 mois après l’achat';
    ctx.font = '400 13px ' + sans;
    ctx.fillStyle = C.muted;
    ctx.fillText('Valable jusqu’au ' + expires + ' · réservation sur Planity ou au 06 38 46 74 14', X, 545);
  }

  return { draw: draw, W: W, H: H };
});
