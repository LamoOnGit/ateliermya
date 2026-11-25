# -*- coding: utf-8 -*-
"""
Génère toutes les pages "éditoriales" du site à partir des fichiers de contenu :
  • soins/*.html            pages prestations       (contenu_soins.py)
  • soins/index.html        soins & tarifs + quiz
  • journal/*.html          articles                (contenu_journal.py)
  • assets/catalogue.js     catalogue pour le navigateur (quiz, carte cadeau)
  • supabase/functions/_shared/catalogue.json   catalogue pour les fonctions serveur (vérif. des prix)
  • sitemap.xml

Usage (depuis la racine du projet) :
    python3 _outils/generer_pages_soins.py
"""
import json, os, re, sys, datetime, html as H

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contenu_soins import (SOINS, PLANITY, U, CONTRE_COMMUNES, OBJECTIFS,  # noqa: E402
                           NON_OFFRABLES, AVIS, AVANT_APRES, MYRIAM)
from contenu_journal import ARTICLES  # noqa: E402

# ⚠️ Domaine définitif du site : à changer ici le jour où le nom de domaine est
# branché (ex. https://lateliermyaparis.fr), puis relancer le script.
SITE = "https://lateliermya.fr"
TODAY = datetime.date.today().isoformat()
YEAR = datetime.date.today().year
BY_SLUG = {s["slug"]: s for s in SOINS}
R = "../"  # toutes les pages générées sont à un niveau de profondeur
MONTANTS = [30, 50, 70, 90, 110, 130, 150]
EXT = 'target="_blank" rel="noopener"'

LIBELLES = {
    "head-spa": ("le Head Spa", "Head Spa"),
    "kobido": ("le Kobido", "Kobido"),
    "drainage-lymphatique": ("le drainage lymphatique", "drainage lymphatique"),
    "drainage-lymphatique-visage": ("le drainage du visage", "drainage visage"),
    "drainage-jambes-legeres": ("le drainage jambes légères", "drainage jambes légères"),
    "maderotherapie": ("la madérothérapie", "séance de madérothérapie"),
    "masque-led": ("le masque LED", "soin LED"),
}
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
        "septembre", "octobre", "novembre", "décembre"]

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,400;1,9..144,500&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">')
FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='19' fill='%23F5F1EA'/%3E%3Cg fill='none' stroke='%238B5A43' stroke-width='1.6'%3E%3Cellipse cx='20' cy='14' rx='5.5' ry='8' transform='rotate(0 20 20)'/%3E%3Cellipse cx='20' cy='14' rx='5.5' ry='8' transform='rotate(120 20 20)'/%3E%3Cellipse cx='20' cy='14' rx='5.5' ry='8' transform='rotate(240 20 20)'/%3E%3C/g%3E%3Ccircle cx='20' cy='20' r='2' fill='%23C4856A'/%3E%3C/svg%3E"

# Verrou de préprod — à retirer à la mise en ligne (mettre LOCK = "")
LOCK = """<!-- ─── Verrou d'accès temporaire (préprod uniquement, pas une vraie sécurité) ─── -->
<div id="siteLockOverlay" style="position:fixed;inset:0;z-index:99999;background:#37291D;color:#FDFAF7;display:flex;align-items:center;justify-content:center;font-family:sans-serif;">
  <div style="text-align:center;max-width:320px;padding:2rem">
    <div style="font-size:0.75rem;letter-spacing:0.15em;text-transform:uppercase;color:#C4856A;margin-bottom:1rem">Site en cours de développement</div>
    <input type="text" id="siteLockUser" placeholder="Nom d'utilisateur" autocomplete="off" style="width:100%;padding:0.7rem 1rem;border-radius:6px;border:none;margin-bottom:0.6rem;font-size:0.95rem;box-sizing:border-box">
    <input type="password" id="siteLockInput" placeholder="Mot de passe" style="width:100%;padding:0.7rem 1rem;border-radius:6px;border:none;margin-bottom:0.8rem;font-size:0.95rem;box-sizing:border-box">
    <button id="siteLockBtn" style="width:100%;padding:0.7rem;border-radius:999px;border:none;background:#8B5A43;color:#FDFAF7;cursor:pointer;font-size:0.85rem;letter-spacing:0.05em;text-transform:uppercase">Entrer</button>
    <div id="siteLockError" style="color:#E8A0A0;font-size:0.78rem;margin-top:0.7rem;display:none">Identifiants incorrects</div>
  </div>
</div>
<script>
(function () {
  var SITE_USERNAME = 'lamoagency';
  var SITE_PASSWORD = 'OHrmZRRp06_eqyGV';
  try { if (sessionStorage.getItem('mya_site_unlocked') === '1') { document.getElementById('siteLockOverlay').remove(); return; } } catch (e) {}
  function tryUnlock() {
    if (document.getElementById('siteLockUser').value === SITE_USERNAME && document.getElementById('siteLockInput').value === SITE_PASSWORD) {
      try { sessionStorage.setItem('mya_site_unlocked', '1'); } catch (e) {}
      document.getElementById('siteLockOverlay').remove();
    } else { document.getElementById('siteLockError').style.display = 'block'; }
  }
  document.getElementById('siteLockBtn').addEventListener('click', tryUnlock);
  document.getElementById('siteLockInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryUnlock(); });
  document.getElementById('siteLockUser').addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('siteLockInput').focus(); });
})();
</script>"""


# ─── Utilitaires ────────────────────────────────────────────────────────────
def euros(n):
    return f"{n} €"


def img(photo, w):
    return U.format(photo, w)


def minutes(duree):
    if "×" in duree:
        n, d = duree.split("×")
        return int(n.strip()) * minutes(d.strip())
    h = re.search(r"(\d+)\s*h(?:\s*(\d+))?", duree)
    if h:
        return int(h.group(1)) * 60 + int(h.group(2) or 0)
    return int(re.search(r"(\d+)", duree).group(1))


def date_fr(iso):
    y, m, d = iso.split("-")
    return f"{int(d)} {MOIS[int(m) - 1]} {y}"


def plage_durees(s):
    d = []
    for f in s["formules"]:
        if "×" not in f["duree"] and f["duree"] not in d:
            d.append(f["duree"])
    return d[0] if len(d) == 1 else f"{d[0]} – {d[-1]}"


def formule_id(s, i):
    return f"{s['slug']}-{i + 1}"


def provider():
    return {"@type": "BeautySalon", "@id": SITE + "/#institut", "name": "L'Atelier Mya", "url": SITE + "/",
            "telephone": "+33638467414",
            "address": {"@type": "PostalAddress", "streetAddress": "24 Av. Charlie Chaplin", "postalCode": "91700",
                        "addressLocality": "Sainte-Geneviève-des-Bois", "addressRegion": "Île-de-France", "addressCountry": "FR"}}


# ─── Gabarit commun ─────────────────────────────────────────────────────────
def head(title, meta, canonical, og_img, jsonld, og_type="website"):
    ld = "\n".join(f'<script type="application/ld+json">\n{json.dumps(j, ensure_ascii=False, indent=1)}\n</script>' for j in jsonld)
    return f"""<!DOCTYPE html>
<html lang="fr" class="no-js">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="{meta}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="{canonical}">
<link rel="icon" type="image/svg+xml" href="{FAVICON}">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="L'Atelier Mya">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{meta}">
<meta property="og:image" content="{og_img}">
<meta property="og:url" content="{canonical}">
<meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#FAF6F1">
{FONTS}
<link rel="stylesheet" href="{R}assets/site.css">
<link rel="stylesheet" href="{R}assets/composants.css">
{ld}
</head>
<body>
{LOCK}
"""


def nav(active):
    def cur(k):
        return ' aria-current="page"' if k == active else ""
    return f"""
<nav class="nav" aria-label="Navigation principale">
  <a class="nav-logo" href="{R}index.html">L'Atelier <em>Mya</em></a>
  <ul class="nav-links" id="navLinks">
    <li><a href="{R}soins/index.html"{cur('soins')}>Soins &amp; tarifs</a></li>
    <li><a href="{R}soins/head-spa.html"{cur('head-spa')}>Head Spa</a></li>
    <li><a href="{R}soins/kobido.html"{cur('kobido')}>Kobido</a></li>
    <li><a href="{R}soins/drainage-lymphatique.html"{cur('drainage-lymphatique')}>Drainage</a></li>
    <li><a href="{R}soins/maderotherapie.html"{cur('maderotherapie')}>Madérothérapie</a></li>
    <li><a href="{R}journal/index.html"{cur('journal')}>Journal</a></li>
    <li><a href="{R}carte-cadeau.html">Carte cadeau</a></li>
  </ul>
  <div class="nav-right">
    <a class="nav-cta" href="{PLANITY}" {EXT}>Réserver</a>
    <button class="nav-burger" type="button" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="navLinks"><span></span><span></span><span></span></button>
  </div>
</nav>
"""


def footer():
    soins = "\n".join(f'          <li><a href="{R}soins/{s["slug"]}.html">{s["nom_court"]}</a></li>' for s in SOINS)
    return f"""
<footer>
  <div class="wrap">
    <div class="footer-top">
      <div>
        <div class="footer-logo">L'Atelier <em>Mya</em></div>
        <p>Institut de bien-être réservé aux femmes à Sainte-Geneviève-des-Bois : Head Spa, Kobido, drainage lymphatique et madérothérapie.</p>
        <p>24 Av. Charlie Chaplin<br>91700 Sainte-Geneviève-des-Bois<br><a href="tel:+33638467414" style="color:inherit">06 38 46 74 14</a></p>
        <p class="open-now" data-open-now></p>
      </div>
      <div>
        <h4>Soins</h4>
        <ul>
{soins}
        </ul>
      </div>
      <div>
        <h4>L'Institut</h4>
        <ul>
          <li><a href="{R}index.html">Accueil</a></li>
          <li><a href="{R}soins/index.html">Soins &amp; tarifs</a></li>
          <li><a href="{R}soins/index.html#quiz">Quel soin pour moi ?</a></li>
          <li><a href="{R}journal/index.html">Le journal</a></li>
          <li><a href="{R}carte-cadeau.html">Offrir une carte cadeau</a></li>
          <li><a href="{PLANITY}" {EXT}>Prendre rendez-vous</a></li>
        </ul>
      </div>
      <div>
        <h4>Horaires</h4>
        <ul class="hours">
          <li>Lun, mar, jeu, ven : 9h – 20h</li>
          <li>Mercredi : 10h – 20h</li>
          <li>Samedi : 10h – 19h</li>
          <li>Dimanche : fermé</li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© {YEAR} L'Atelier Mya · Sainte-Geneviève-des-Bois (91)</span>
      <span><a href="{R}mentions-legales.html">Mentions légales</a> · <a href="{R}politique-confidentialite.html">Confidentialité</a> · <a href="https://www.instagram.com/lateliermyaparis" {EXT}>Instagram</a> · <a href="https://www.tiktok.com/@lateliermyaparis" {EXT}>TikTok</a></span>
    </div>
  </div>
</footer>
"""


def local_block(nom, offrir_href=None):
    offrir_href = offrir_href or f"{R}carte-cadeau.html"
    return f"""
<section class="sec sec-dark" id="infos">
  <div class="wrap local">
    <div class="reveal">
      <div class="eyebrow eyebrow-light">Votre institut en Essonne</div>
      <h2>Votre {nom} <em>près de chez vous</em></h2>
      <p>L’Atelier Mya vous accueille dans un cocon chaleureux à Sainte-Geneviève-des-Bois, à quelques minutes de Saint-Michel-sur-Orge, Morsang-sur-Orge, Villemoisson-sur-Orge, Fleury-Mérogis et Brétigny-sur-Orge. Un institut réservé aux femmes, où chaque soin est réalisé par Myriam, sur rendez-vous.</p>
      <div class="btns" style="margin-top:1.8rem">
        <a class="btn btn-primary" href="{PLANITY}" {EXT}>Réserver en ligne ↗</a>
        <a class="btn btn-ghost" href="{offrir_href}">Offrir ce soin</a>
      </div>
    </div>
    <dl class="local-card reveal">
      <dt>Adresse</dt><dd>24 Av. Charlie Chaplin, 91700 Sainte-Geneviève-des-Bois</dd>
      <dt>Horaires</dt><dd>Lun, mar, jeu, ven 9h–20h · Mer 10h–20h · Sam 10h–19h<br><span class="open-now" data-open-now></span></dd>
      <dt>Téléphone</dt><dd><a href="tel:+33638467414">06 38 46 74 14</a></dd>
      <dt>Avis clientes</dt><dd>★★★★★ 5,0 / 5 · <a href="{PLANITY}" {EXT}>69 avis sur Planity</a></dd>
    </dl>
  </div>
</section>
"""


def myriam_mini():
    photo = (f'<img src="{R}{MYRIAM["photo"]}" alt="Myriam, praticienne de L’Atelier Mya" width="96" height="96" loading="lazy">'
             if MYRIAM["photo"] else '<span class="monogram" aria-hidden="true">M</span>')
    return f"""
    <aside class="praticienne reveal">
      {photo}
      <div>
        <div class="eyebrow">Votre praticienne</div>
        <p><strong>Myriam</strong> vous accueille seule, sur rendez-vous, et réalise elle-même chacun des soins de l’institut. Avant chaque séance, elle prend le temps d’échanger avec vous pour adapter le soin à vos besoins.</p>
        <a href="{R}#myriam" class="link">Découvrir L’Atelier Mya →</a>
      </div>
    </aside>"""


def avis_section(slug):
    items = AVIS.get(slug)
    if not items:
        return ""
    cards = "\n".join(f"""      <figure class="avis reveal">
        <div class="avis-stars" aria-label="5 étoiles sur 5">★★★★★</div>
        <blockquote>« {H.escape(t)} »</blockquote>
        <figcaption>Avis vérifié Planity · {d}</figcaption>
      </figure>""" for t, d in items)
    return f"""
<section class="sec" id="avis">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="eyebrow">Elles l’ont testé</div>
      <h2>Ce qu’en disent <em>nos clientes</em></h2>
      <p>Note moyenne de l’institut : <strong>5,0 / 5</strong> sur 69 avis. <a href="{PLANITY}" {EXT} class="link">Lire tous les avis ↗</a></p>
    </div>
    <div class="avis-grid">
{cards}
    </div>
  </div>
</section>
"""


def avant_apres_section(slug):
    items = AVANT_APRES.get(slug)
    if not items:
        return ""
    sliders = "\n".join(f"""      <figure class="ba reveal" data-ba>
        <div class="ba-frame">
          <img src="{R}{apres}" alt="Après — {H.escape(leg)}" loading="lazy">
          <div class="ba-before"><img src="{R}{avant}" alt="Avant — {H.escape(leg)}" loading="lazy"></div>
          <input class="ba-range" type="range" min="0" max="100" value="50" aria-label="Comparer avant et après">
          <span class="ba-tag ba-tag-l">Avant</span><span class="ba-tag ba-tag-r">Après</span>
        </div>
        <figcaption>{H.escape(leg)}</figcaption>
      </figure>""" for avant, apres, leg in items)
    return f"""
<section class="sec sec-alt" id="avant-apres">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="eyebrow">Résultats</div>
      <h2>Avant <em>&amp; après</em></h2>
      <p>Photos de clientes de l’institut, publiées avec leur accord. Les résultats varient d’une personne à l’autre.</p>
    </div>
    <div class="ba-grid">
{sliders}
    </div>
  </div>
</section>
"""


def scripts(extra=""):
    return (f'<script src="{R}assets/config.js"></script>\n{extra}'
            f'<script src="{R}assets/site.js" defer></script>\n</body>\n</html>\n')


# ─── Pages soins ────────────────────────────────────────────────────────────
def formule_html(s, f, i):
    tag = f'<span class="formule-tag">{f["tag"]}</span>' if f.get("tag") else ""
    items = "".join(f"<li>{x}</li>" for x in f.get("items", []))
    note = f'<p class="note">{f["note"]}</p>' if f.get("note") else ""
    fid = formule_id(s, i)
    if f.get("lien"):
        ctas = f'<a class="formule-cta" href="{R}soins/{f["lien"]}.html">Voir le soin →</a>'
    else:
        offrir = "" if fid in NON_OFFRABLES else f'<a class="formule-cta formule-cta-alt" href="{R}carte-cadeau.html?f={fid}">Offrir</a>'
        ctas = f'<a class="formule-cta" href="{PLANITY}" {EXT}>Réserver →</a>{offrir}'
    return f"""      <article class="formule{' star' if f.get('star') else ''} reveal" id="formule-{i+1}">
        {tag}
        <div class="formule-top">
          <h3>{f['nom']}</h3>
          <div class="formule-price"><b>{euros(f['prix'])}</b><span>{f['duree']}</span></div>
        </div>
        <p>{f['desc']}</p>
        <ul>{items}</ul>
        {note}
        <div class="formule-ctas">{ctas}</div>
      </article>"""


def related_cards(slugs):
    out = []
    for sl in slugs:
        r = BY_SLUG[sl]
        mini = min(f["prix"] for f in r["formules"])
        out.append(f"""      <a class="rel-card reveal" href="{R}soins/{sl}.html">
        <img src="{img(r['img'][0], 600)}" alt="{r['img'][1]}" loading="lazy" width="600" height="750">
        <div class="rel-card-body">
          <h3>{r['nom_court']}</h3>
          <p>{r['carte']}</p>
          <span class="more">Dès {euros(mini)} · Découvrir →</span>
        </div>
      </a>""")
    return "\n".join(out)


def articles_lies(slug):
    arts = [a for a in ARTICLES if a["soin"] == slug]
    if not arts:
        return ""
    lis = "".join(f'<li><a href="{R}journal/{a["slug"]}.html">{a["titre"]}</a></li>' for a in arts)
    return f'<div class="panel reveal" style="margin-top:1.4rem"><h3>À lire dans le journal</h3><ul class="links-list">{lis}</ul></div>'


def page_soin(s):
    url = f"{SITE}/soins/{s['slug']}.html"
    mini = min(f["prix"] for f in s["formules"])
    jsonld = [
        {"@context": "https://schema.org", "@type": "Service", "name": s["nom"], "serviceType": s["nom_court"],
         "url": url, "description": s["meta"], "image": img(s["img"][0], 1200),
         "provider": provider(), "areaServed": [{"@type": "City", "name": "Sainte-Geneviève-des-Bois"}, {"@type": "AdministrativeArea", "name": "Essonne"}],
         "hasOfferCatalog": {"@type": "OfferCatalog", "name": s["nom"],
                             "itemListElement": [{"@type": "Offer", "name": f["nom"], "price": str(f["prix"]), "priceCurrency": "EUR",
                                                  "url": PLANITY, "itemOffered": {"@type": "Service", "name": f["nom"]}} for f in s["formules"]]}},
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Accueil", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": "Soins & tarifs", "item": SITE + "/soins/"},
            {"@type": "ListItem", "position": 3, "name": s["nom_court"], "item": url}]},
        {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in s["faq"]]},
    ]
    formules = "\n".join(formule_html(s, f, i) for i, f in enumerate(s["formules"]))
    histoire = "\n".join(f"      <p>{p}</p>" for p in s["histoire"])
    reperes = "".join(f"<li><b>{a}</b>{b}</li>" for a, b in s["reperes"])
    bienfaits = "\n".join(f"""      <div class="benefit reveal"><div class="benefit-ico">{i+1}</div><h3>{t}</h3><p>{d}</p></div>""" for i, (t, d) in enumerate(s["bienfaits"]))
    deroule = "\n".join(f"""      <div class="step reveal"><h3>{t}</h3><p>{d}</p></div>""" for t, d in s["deroule"])
    pour_qui = "".join(f"<li>{x}</li>" for x in s["pour_qui"])
    conseils = "".join(f"<li>{x}</li>" for x in s["conseils"])
    contre = "".join(f"<li>{x}</li>" for x in s["contre"] + CONTRE_COMMUNES)
    faq = "\n".join(f"""    <details class="reveal"><summary>{q}</summary><p>{a}</p></details>""" for q, a in s["faq"])
    offrir_href = f"{R}carte-cadeau.html?soin={s['slug']}"

    html = head(s["title"], s["meta"], url, img(s["img"][0], 1200), jsonld)
    html += nav(s["slug"])
    html += f"""
<main>
<section class="svc-hero">
  <div class="wrap">
    <div>
      <nav class="crumbs" aria-label="Fil d'Ariane"><a href="{R}index.html">Accueil</a><span aria-hidden="true">/</span><a href="{R}soins/index.html">Soins &amp; tarifs</a><span aria-hidden="true">/</span><span>{s['nom_court']}</span></nav>
      <div class="eyebrow">{s['eyebrow']}</div>
      <h1>{s['h1']}<small>{s['h1_small']}</small></h1>
      <p class="lead">{s['lead']}</p>
      <div class="facts">
        <div class="fact"><b>Dès {euros(mini)}</b><span>Tarif</span></div>
        <div class="fact"><b>{plage_durees(s)}</b><span>Durée</span></div>
        <div class="fact"><b>5,0 ★</b><span>69 avis</span></div>
      </div>
      <div class="btns">
        <a class="btn btn-primary" href="{PLANITY}" {EXT}>Réserver ce soin ↗</a>
        <a class="btn btn-ghost" href="{offrir_href}">Offrir ce soin</a>
      </div>
    </div>
    <div class="svc-visual">
      <img src="{img(s['img'][0], 900)}" alt="{s['img'][1]}" width="900" height="1125" fetchpriority="high">
      <div class="svc-badge"><b>5,0</b><div><span class="stars">★★★★★</span><br>69 avis vérifiés</div></div>
    </div>
  </div>
</section>

<section class="sec" id="formules">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="eyebrow">Formules &amp; tarifs</div>
      <h2>Choisissez <em>votre formule</em></h2>
      <p>Réservation en ligne 24h/24, paiement sur place. Chaque formule peut aussi être offerte en carte cadeau.</p>
    </div>
    <div class="formules n{len(s['formules'])}">
{formules}
    </div>
{myriam_mini()}
  </div>
</section>
{avis_section(s['slug'])}{avant_apres_section(s['slug'])}
<section class="sec sec-alt" id="histoire">
  <div class="wrap split">
    <div class="split-aside reveal">
      <div class="eyebrow">Histoire du soin</div>
      <h2>{s['histoire_titre']}</h2>
      <p class="quote">« {s['citation']} »</p>
    </div>
    <div class="prose reveal">
{histoire}
      <ul class="timeline">{reperes}</ul>
    </div>
  </div>
</section>

<section class="sec" id="bienfaits">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="eyebrow">Les bienfaits</div>
      <h2>Ce que {LIBELLES[s['slug']][0]} <em>vous apporte</em></h2>
    </div>
    <div class="benefits" style="--n:{len(s['bienfaits'])}">
{bienfaits}
    </div>
  </div>
</section>

<section class="sec sec-dark" id="deroule">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="eyebrow eyebrow-light">Votre séance</div>
      <h2>Comment se déroule <em>le soin</em></h2>
    </div>
    <div class="steps" style="--n:{len(s['deroule'])}">
{deroule}
    </div>
  </div>
</section>

<section class="sec" id="pour-qui">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="eyebrow">Bon à savoir</div>
      <h2>Pour qui, et <em>comment s’y préparer</em></h2>
    </div>
    <div class="cols2">
      <div class="panel reveal"><h3>Ce soin est fait pour vous si…</h3><ul>{pour_qui}</ul></div>
      <div class="panel reveal"><h3>Nos conseils</h3><ul>{conseils}</ul></div>
    </div>
    <div class="panel warn reveal" id="contre-indications" style="margin-top:1.4rem">
      <h3>Contre-indications</h3>
      <p>Merci de lire ces informations avant de réserver. En cas de doute, un avis médical est recommandé ; vous pouvez aussi appeler l’institut au <a href="tel:+33638467414">06 38 46 74 14</a>.</p>
      <ul class="cols-list">{contre}</ul>
    </div>
    {articles_lies(s['slug'])}
  </div>
</section>

<section class="sec sec-alt" id="faq">
  <div class="wrap">
    <div class="sec-head center reveal">
      <div class="eyebrow">Questions fréquentes</div>
      <h2>Vos questions sur <em>{LIBELLES[s['slug']][0]}</em></h2>
    </div>
    <div class="faq">
{faq}
    </div>
  </div>
</section>

<section class="sec" id="autres-soins">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="eyebrow">À découvrir aussi</div>
      <h2>Soins <em>complémentaires</em></h2>
      <p><a href="{R}soins/index.html" class="link">Voir tous les soins et tarifs →</a> · <a href="{R}soins/index.html#quiz" class="link">Quel soin est fait pour moi ?</a></p>
    </div>
    <div class="related">
{related_cards(s['lies'])}
    </div>
  </div>
</section>
{local_block(LIBELLES[s['slug']][1], offrir_href)}
</main>
{footer()}
<div class="mobile-book" role="complementary" aria-label="Réservation rapide"><span>{s['nom_court']}<br><b>dès {euros(mini)}</b></span><a href="{PLANITY}" {EXT}>Réserver</a></div>
"""
    html += scripts()
    return html


# ─── Page soins & tarifs (+ quiz) ───────────────────────────────────────────
def quiz_section():
    return """
<section class="sec" id="quiz">
  <div class="wrap">
    <div class="quiz reveal" data-quiz>
      <noscript><p>Activez JavaScript pour utiliser le quiz, ou appelez l’institut au 06 38 46 74 14 pour être conseillée.</p></noscript>
    </div>
  </div>
</section>
"""


def page_hub():
    url = SITE + "/soins/"
    title = "Soins & tarifs — Head Spa, Kobido, drainage, madérothérapie | L’Atelier Mya (91)"
    meta = "Tous les soins et tarifs de L’Atelier Mya à Sainte-Geneviève-des-Bois : Head Spa dès 70 €, Kobido dès 50 €, drainage lymphatique dès 70 €, madérothérapie dès 85 €, masque LED."
    groups = []
    for s in SOINS:
        rows = "\n".join(f"""        <div class="price-row"><div class="price-row-name">{f['nom']}<small>{f['desc']}</small></div><div class="price-row-dur">{f['duree']}</div><div class="price-row-price">{euros(f['prix'])}</div></div>"""
                         for f in s["formules"] if not f.get("lien"))
        groups.append(f"""      <div class="price-group reveal" id="{s['slug']}">
        <div class="price-group-head"><h2 class="serif price-group-title">{s['nom']}</h2><a href="{s['slug']}.html">Le soin en détail →</a></div>
{rows}
      </div>""")
    jsonld = [
        {"@context": "https://schema.org", "@type": "ItemList", "name": "Soins de L'Atelier Mya",
         "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": s["nom"], "url": f"{SITE}/soins/{s['slug']}.html"} for i, s in enumerate(SOINS)]},
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Accueil", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": "Soins & tarifs", "item": url}]},
    ]
    html = head(title, meta, url, img(SOINS[0]["img"][0], 1200), jsonld)
    html += nav("soins")
    html += f"""
<main>
<section class="svc-hero svc-hero-simple">
  <div class="wrap">
    <div>
      <nav class="crumbs" aria-label="Fil d'Ariane"><a href="{R}index.html">Accueil</a><span aria-hidden="true">/</span><span>Soins &amp; tarifs</span></nav>
      <div class="eyebrow">La carte des soins</div>
      <h1>Soins &amp; tarifs <em>de L’Atelier Mya</em><small>Institut de bien-être à Sainte-Geneviève-des-Bois (91)</small></h1>
      <p class="lead">Head Spa, Kobido, drainage lymphatique brésilien, madérothérapie et luminothérapie : retrouvez chaque soin en détail, son histoire, ses bienfaits et toutes ses formules. Réservation en ligne 24h/24, paiement sur place.</p>
      <div class="btns" style="margin-top:2rem">
        <a class="btn btn-primary" href="#quiz">Quel soin pour moi ?</a>
        <a class="btn btn-ghost" href="#tarifs">Voir les tarifs</a>
      </div>
    </div>
  </div>
</section>

<section class="sec" style="padding-top:2rem">
  <div class="wrap">
    <div class="related n4">
{related_cards([s['slug'] for s in SOINS])}
    </div>
  </div>
</section>
{quiz_section()}
<section class="sec sec-alt" id="tarifs">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="eyebrow">Tarifs</div>
      <h2>Toutes les <em>formules</em></h2>
      <p>Tarifs en vigueur, identiques à ceux de la réservation en ligne. Chaque soin peut être <a href="{R}carte-cadeau.html" class="link">offert en carte cadeau</a>, valable 6 mois.</p>
    </div>
{chr(10).join(groups)}
  </div>
</section>
{local_block('soin')}
</main>
{footer()}
"""
    html += scripts(f'<script src="{R}assets/catalogue.js"></script>\n')
    return html


# ─── Journal ────────────────────────────────────────────────────────────────
def bloc_html(b):
    kind, val = b
    if kind == "h2":
        return f"<h2>{val}</h2>"
    if kind == "p":
        return f"<p>{val}</p>"
    if kind == "ul":
        return "<ul>" + "".join(f"<li>{x}</li>" for x in val) + "</ul>"
    if kind == "note":
        return f'<p class="article-note">{val}</p>'
    raise ValueError(kind)


def page_article(a):
    url = f"{SITE}/journal/{a['slug']}.html"
    s = BY_SLUG[a["soin"]]
    mini = min(f["prix"] for f in s["formules"])
    jsonld = [
        {"@context": "https://schema.org", "@type": "Article", "headline": a["titre"], "description": a["meta"],
         "image": img(a["img"], 1200), "datePublished": a["date"], "dateModified": a["date"], "inLanguage": "fr-FR",
         "mainEntityOfPage": url, "author": {"@type": "Person", "name": "Myriam — L'Atelier Mya"},
         "publisher": {"@type": "Organization", "name": "L'Atelier Mya", "url": SITE + "/"}},
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Accueil", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": "Journal", "item": SITE + "/journal/"},
            {"@type": "ListItem", "position": 3, "name": a["titre"], "item": url}]},
    ]
    corps = "\n      ".join(bloc_html(b) for b in a["blocs"])
    autres = [x for x in ARTICLES if x["slug"] != a["slug"]][:3]
    autres_html = "\n".join(f"""      <a class="article-card reveal" href="{x['slug']}.html">
        <img src="{img(x['img'], 600)}" alt="" loading="lazy" width="600" height="380">
        <div><span class="article-meta">{date_fr(x['date'])} · {x['lecture']}</span><h3>{x['titre']}</h3></div>
      </a>""" for x in autres)
    html = head(a["title"], a["meta"], url, img(a["img"], 1200), jsonld, og_type="article")
    html += nav("journal")
    html += f"""
<main>
<article>
  <header class="article-hero">
    <div class="wrap wrap-narrow">
      <nav class="crumbs" aria-label="Fil d'Ariane"><a href="{R}index.html">Accueil</a><span aria-hidden="true">/</span><a href="{R}journal/index.html">Journal</a><span aria-hidden="true">/</span><span>{s['nom_court']}</span></nav>
      <div class="eyebrow">{s['nom_court']} · {a['lecture']} de lecture</div>
      <h1>{a['titre']}</h1>
      <p class="lead">{a['chapo']}</p>
      <p class="article-meta">Par Myriam, L’Atelier Mya · <time datetime="{a['date']}">{date_fr(a['date'])}</time></p>
    </div>
    <div class="wrap"><img class="article-cover" src="{img(a['img'], 1400)}" alt="{s['img'][1]}" width="1400" height="700" fetchpriority="high"></div>
  </header>
  <div class="wrap wrap-narrow">
    <div class="article-body prose">
      {corps}
    </div>
    <aside class="article-cta">
      <div>
        <div class="eyebrow">À l’institut</div>
        <h2>{s['nom']}</h2>
        <p>{s['carte']} Dès {euros(mini)}, à Sainte-Geneviève-des-Bois.</p>
      </div>
      <div class="btns">
        <a class="btn btn-primary" href="{R}soins/{s['slug']}.html">Découvrir le soin</a>
        <a class="btn btn-ghost" href="{PLANITY}" {EXT}>Réserver ↗</a>
      </div>
    </aside>
  </div>
</article>
<section class="sec sec-alt">
  <div class="wrap">
    <div class="sec-head reveal"><div class="eyebrow">Le journal</div><h2>À lire <em>aussi</em></h2></div>
    <div class="article-grid">
{autres_html}
    </div>
  </div>
</section>
</main>
{footer()}
"""
    html += scripts()
    return html


def page_journal():
    url = SITE + "/journal/"
    title = "Le journal de L’Atelier Mya — Conseils bien-être, Head Spa, Kobido, drainage"
    meta = "Conseils, réponses et coulisses des soins de L’Atelier Mya : Head Spa pendant la grossesse, drainage post-partum, madérothérapie, Kobido…"
    cards = "\n".join(f"""      <a class="article-card reveal" href="{a['slug']}.html">
        <img src="{img(a['img'], 700)}" alt="" loading="lazy" width="700" height="440">
        <div><span class="article-meta">{BY_SLUG[a['soin']]['nom_court']} · {date_fr(a['date'])} · {a['lecture']}</span><h3>{a['titre']}</h3><p>{a['chapo'][:150].rsplit(' ', 1)[0]}…</p></div>
      </a>""" for a in sorted(ARTICLES, key=lambda x: x["date"], reverse=True))
    jsonld = [{"@context": "https://schema.org", "@type": "Blog", "name": "Le journal de L'Atelier Mya", "url": url,
               "blogPost": [{"@type": "BlogPosting", "headline": a["titre"], "url": f"{SITE}/journal/{a['slug']}.html", "datePublished": a["date"]} for a in ARTICLES]}]
    html = head(title, meta, url, img(ARTICLES[0]["img"], 1200), jsonld)
    html += nav("journal")
    html += f"""
<main>
<section class="svc-hero svc-hero-simple">
  <div class="wrap">
    <div>
      <nav class="crumbs" aria-label="Fil d'Ariane"><a href="{R}index.html">Accueil</a><span aria-hidden="true">/</span><span>Journal</span></nav>
      <div class="eyebrow">Le journal</div>
      <h1>Conseils &amp; <em>réponses</em><small>Les questions qu’on me pose le plus souvent à l’institut</small></h1>
    </div>
  </div>
</section>
<section class="sec" style="padding-top:1rem">
  <div class="wrap">
    <div class="article-grid">
{cards}
    </div>
  </div>
</section>
{local_block('soin')}
</main>
{footer()}
"""
    html += scripts()
    return html


# ─── Catalogue (quiz + cartes cadeaux + vérification serveur) ──────────────
def catalogue():
    formules = []
    for s in SOINS:
        for i, f in enumerate(s["formules"]):
            if f.get("lien"):
                continue  # doublon d'une formule présentée sur une autre page
            fid = formule_id(s, i)
            formules.append(dict(
                id=fid, soin=s["slug"], famille=s["nom_court"], nom=f["nom"], duree=f["duree"],
                minutes=minutes(f["duree"]), prix=f["prix"], cure="×" in f["duree"],
                offrable=fid not in NON_OFFRABLES, objectifs=OBJECTIFS.get(fid, []),
                desc=re.sub(r"<[^>]+>", "", f["desc"]), url=f"soins/{s['slug']}.html#formule-{i+1}",
                img=img(s["img"][0], 600)))
    familles = [dict(slug=s["slug"], nom=s["nom"], nom_court=s["nom_court"], url=f"soins/{s['slug']}.html") for s in SOINS]
    return dict(genere_le=TODAY, montants=MONTANTS, familles=familles, formules=formules)


def sitemap():
    urls = [(SITE + "/", "1.0", "weekly"), (SITE + "/soins/", "0.9", "monthly")]
    urls += [(f"{SITE}/soins/{s['slug']}.html", "0.8", "monthly") for s in SOINS]
    urls += [(SITE + "/journal/", "0.6", "weekly")]
    urls += [(f"{SITE}/journal/{a['slug']}.html", "0.6", "yearly") for a in ARTICLES]
    urls += [(SITE + "/carte-cadeau.html", "0.7", "monthly")]
    body = "\n".join(f"  <url>\n    <loc>{u}</loc>\n    <lastmod>{TODAY}</lastmod>\n    <changefreq>{c}</changefreq>\n    <priority>{p}</priority>\n  </url>" for u, p, c in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}\n</urlset>\n'


def page_gabarit(name):
    """Pages racine écrites à la main (_outils/gabarits/) : on y injecte menu, pied de page, verrou."""
    global R
    old, R = R, ""
    try:
        with open(os.path.join(ROOT, "_outils", "gabarits", name), encoding="utf-8") as fh:
            s = fh.read()
        return (s.replace("<!--LOCK-->", LOCK).replace("<!--NAV-->", nav(name.replace(".html", "")))
                 .replace("<!--FOOTER-->", footer()).replace("<!--FONTS-->", FONTS)
                 .replace("<!--FAVICON-->", FAVICON).replace("<!--SITE-->", SITE))
    finally:
        R = old


def write(rel, content):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    print(rel)


if __name__ == "__main__":
    for s in SOINS:
        write(f"soins/{s['slug']}.html", page_soin(s))
    write("soins/index.html", page_hub())
    write("journal/index.html", page_journal())
    for a in ARTICLES:
        write(f"journal/{a['slug']}.html", page_article(a))
    cat = catalogue()
    write("assets/catalogue.js", "// Généré par _outils/generer_pages_soins.py — ne pas modifier à la main\nwindow.MYA_CATALOGUE = "
          + json.dumps(cat, ensure_ascii=False, indent=1) + ";\n")
    write("supabase/functions/_shared/catalogue.json", json.dumps(cat, ensure_ascii=False, indent=1) + "\n")
    for g in sorted(os.listdir(os.path.join(ROOT, "_outils", "gabarits"))):
        if g.endswith(".html"):
            write(g, page_gabarit(g))
    write("sitemap.xml", sitemap())
