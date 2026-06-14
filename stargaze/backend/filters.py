"""
Faceted filters for the search/browse constellation.

Each film is tagged with a region (from its countries), a decade (from its
year), a length bucket (from its runtime) and a set of status labels (derived
from popularity / rating / keywords, since the dataset has no explicit
"blockbuster" or "award" field). Genres come straight from the film.

The frontend offers these exact vocabularies; values are matched verbatim.
"""
from __future__ import annotations

import numpy as np

# ── Vocabularies (kept in sync with the frontend FilterBar) ─────────────────────
REGIONS = ["Africa", "Americas", "Asia", "Europe", "Oceania"]
STATUSES = ["Blockbuster", "Award-winning", "Independent", "Cult classic"]
DECADES = ["Pre-1960", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]
LENGTHS = ["lt90", "90-120", "120-150", "150-180", "gt180"]
GENRES = [
    "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
    "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery",
    "Romance", "Science Fiction", "Thriller", "War", "Western",
]

CATEGORIES = ["region", "status", "decade", "genre", "length"]

# ── Country → continent (5-continent model) ──────────────────────────────────────
COUNTRY_REGION = {
    # Americas (North + Latin America)
    "United States of America": "Americas", "United States": "Americas", "Canada": "Americas",
    "Mexico": "Americas", "Brazil": "Americas", "Argentina": "Americas", "Chile": "Americas",
    "Colombia": "Americas", "Peru": "Americas", "Cuba": "Americas", "Uruguay": "Americas",
    "Venezuela": "Americas", "Bolivia": "Americas", "Guatemala": "Americas",
    # Europe
    "United Kingdom": "Europe", "France": "Europe", "Germany": "Europe",
    "Italy": "Europe", "Spain": "Europe", "Belgium": "Europe", "Sweden": "Europe",
    "Ireland": "Europe", "Denmark": "Europe", "Switzerland": "Europe",
    "Netherlands": "Europe", "Norway": "Europe", "Poland": "Europe",
    "Austria": "Europe", "Finland": "Europe", "Portugal": "Europe",
    "Greece": "Europe", "Czech Republic": "Europe", "Hungary": "Europe",
    "Romania": "Europe", "Iceland": "Europe", "Russia": "Europe",
    "Ukraine": "Europe", "Serbia": "Europe", "Croatia": "Europe",
    "Bulgaria": "Europe", "Luxembourg": "Europe", "Slovakia": "Europe",
    "Slovenia": "Europe", "Estonia": "Europe", "Lithuania": "Europe",
    # Asia (East, South/Southeast, Middle East)
    "Japan": "Asia", "China": "Asia", "Hong Kong": "Asia",
    "South Korea": "Asia", "Taiwan": "Asia",
    "India": "Asia", "Thailand": "Asia", "Indonesia": "Asia", "Philippines": "Asia",
    "Vietnam": "Asia", "Malaysia": "Asia", "Singapore": "Asia", "Pakistan": "Asia",
    "Bangladesh": "Asia", "Sri Lanka": "Asia", "Cambodia": "Asia",
    "Iran": "Asia", "Israel": "Asia", "Turkey": "Asia", "Saudi Arabia": "Asia",
    "United Arab Emirates": "Asia", "Lebanon": "Asia", "Jordan": "Asia",
    "Qatar": "Asia", "Iraq": "Asia", "Syria": "Asia",
    # Africa
    "South Africa": "Africa", "Nigeria": "Africa", "Egypt": "Africa",
    "Morocco": "Africa", "Kenya": "Africa", "Tunisia": "Africa",
    "Algeria": "Africa", "Senegal": "Africa", "Ethiopia": "Africa",
    # Oceania
    "Australia": "Oceania", "New Zealand": "Oceania",
}


# Original language → continent, for languages that unambiguously belong to one.
# Excludes en/es/pt (spoken across continents) and ar (Middle East *and* North
# Africa) — those are decided by production country instead.
LANG_CONTINENT = {
    # Asia
    "ja": "Asia", "ko": "Asia", "zh": "Asia", "cn": "Asia", "yue": "Asia",
    "hi": "Asia", "ta": "Asia", "te": "Asia", "ml": "Asia", "kn": "Asia",
    "mr": "Asia", "bn": "Asia", "pa": "Asia", "gu": "Asia", "ur": "Asia",
    "ne": "Asia", "si": "Asia", "th": "Asia", "vi": "Asia", "id": "Asia",
    "ms": "Asia", "tl": "Asia", "fil": "Asia", "my": "Asia", "km": "Asia",
    "lo": "Asia", "mn": "Asia", "bo": "Asia", "ka": "Asia", "hy": "Asia",
    "az": "Asia", "kk": "Asia", "uz": "Asia", "ky": "Asia", "tg": "Asia",
    "fa": "Asia", "ps": "Asia", "he": "Asia", "tr": "Asia", "ku": "Asia",
    # Africa (Sub-Saharan + Afrikaans)
    "af": "Africa", "zu": "Africa", "xh": "Africa", "st": "Africa", "tn": "Africa",
    "sw": "Africa", "am": "Africa", "ti": "Africa", "om": "Africa", "so": "Africa",
    "yo": "Africa", "ig": "Africa", "ha": "Africa", "wo": "Africa", "sn": "Africa",
    "ny": "Africa", "rw": "Africa", "lg": "Africa", "mg": "Africa", "ln": "Africa",
    # Europe
    "fr": "Europe", "de": "Europe", "it": "Europe", "ru": "Europe", "pl": "Europe",
    "sv": "Europe", "da": "Europe", "nl": "Europe", "cs": "Europe", "hu": "Europe",
    "el": "Europe", "fi": "Europe", "no": "Europe", "nb": "Europe", "nn": "Europe",
    "ro": "Europe", "uk": "Europe", "be": "Europe", "sr": "Europe", "hr": "Europe",
    "bs": "Europe", "bg": "Europe", "sk": "Europe", "sl": "Europe", "et": "Europe",
    "lt": "Europe", "lv": "Europe", "is": "Europe", "ga": "Europe", "cy": "Europe",
    "ca": "Europe", "eu": "Europe", "gl": "Europe", "mt": "Europe", "lb": "Europe",
    "sq": "Europe", "mk": "Europe",
}

_WESTERN = {"Americas", "Europe", "Oceania"}


def _primary_continent(countries) -> set[str]:
    """Continent of the first production country that we recognise."""
    for c in countries or []:
        r = COUNTRY_REGION.get(c)
        if r:
            return {r}
    return set()


def regions_of(countries, lang=None) -> set[str]:
    """Continent(s) a film belongs to — biased against minor co-production noise.

    English-language films are classified ONLY by their Western production
    countries, so a Hollywood title with a small non-Western co-production credit
    (e.g. a 4th country) doesn't leak into Asia/Africa. Everything else uses its
    (unambiguous) original language when known, otherwise its primary country.
    """
    countries = countries or []
    if lang == "en":
        west = {COUNTRY_REGION.get(c) for c in countries} & _WESTERN
        return west or _primary_continent(countries)
    if lang in LANG_CONTINENT:
        return {LANG_CONTINENT[lang]}
    return _primary_continent(countries)


def _num(v):
    """Coerce to float, treating None and NaN as missing."""
    if v is None or v != v:        # v != v is True only for NaN
        return None
    return v


def decade_of(year) -> str | None:
    year = _num(year)
    if not year:
        return None
    y = int(year)
    if y < 1960:
        return "Pre-1960"
    d = (y // 10) * 10
    return "2020s" if d >= 2020 else f"{d}s"


def length_bucket(runtime) -> str | None:
    runtime = _num(runtime)
    if not runtime or runtime <= 0:
        return None
    if runtime < 90:
        return "lt90"
    if runtime < 120:
        return "90-120"
    if runtime < 150:
        return "120-150"
    if runtime < 180:
        return "150-180"
    return "gt180"


def status_of(m: dict) -> set[str]:
    """Derived labels — see module docstring; these are proxies, not ground truth."""
    s: set[str] = set()
    vc = _num(m.get("vote_count")) or 0
    va = _num(m.get("vote_average")) or 0
    kw = {k.lower() for k in (m.get("keywords") or [])}
    if vc >= 8000:
        s.add("Blockbuster")                       # widely seen (top ~5%)
    if va >= 7.8 and vc >= 2000:
        s.add("Award-winning")                     # acclaimed proxy
    if "independent film" in kw:
        s.add("Independent")
    if "cult film" in kw:
        s.add("Cult classic")
    return s


class FilterIndex:
    """Per-row precomputed facets + fast boolean masking."""

    def __init__(self, index: list[dict]):
        self.regions = [regions_of(m.get("countries"), m.get("original_language")) for m in index]
        self.decade = [decade_of(m.get("year")) for m in index]
        self.length = [length_bucket(m.get("runtime")) for m in index]
        self.status = [status_of(m) for m in index]
        self.genres = [set(m.get("genres") or []) for m in index]
        self.n = len(index)

    def mask(self, selected: dict[str, set[str]]) -> np.ndarray:
        """Boolean array: AND across categories, OR within a category."""
        m = np.ones(self.n, dtype=bool)
        if selected.get("region"):
            sel = selected["region"]
            m &= np.fromiter((bool(self.regions[i] & sel) for i in range(self.n)), bool, self.n)
        if selected.get("genre"):
            sel = selected["genre"]
            m &= np.fromiter((bool(self.genres[i] & sel) for i in range(self.n)), bool, self.n)
        if selected.get("status"):
            sel = selected["status"]
            m &= np.fromiter((bool(self.status[i] & sel) for i in range(self.n)), bool, self.n)
        if selected.get("decade"):
            sel = selected["decade"]
            m &= np.fromiter((self.decade[i] in sel for i in range(self.n)), bool, self.n)
        if selected.get("length"):
            sel = selected["length"]
            m &= np.fromiter((self.length[i] in sel for i in range(self.n)), bool, self.n)
        return m
