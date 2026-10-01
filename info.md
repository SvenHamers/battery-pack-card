# Battery Pack Card

A visual Lovelace card for 4s–32s lithium battery packs — SOC silhouette, headline stats, status pills, per-cell voltage + resistance grid (coloured by deviation from pack average), min/max summary, and a temperature strip. Read-only and click-through to entity details.

Add via the UI ("Add Card" → "Battery Pack Card") or in YAML with `type: custom:battery-pack-card` and a `prefix:` pointing at your BMS's entity naming. See [README](README.md) for the full entity list and config options.

Lots of batteries, not much screen? **Battery Stacked Pack Card** (same install, pick it under "Add card") draws each pack as its battery case, stacked in a cabinet; tap one to open its full Battery Pack Card.
