# LiftCare · EAFIT — proposal website

Static website (no build step, no API keys) that presents the EAFIT elevator maintenance study in English.

| File | Content |
|---|---|
| `index.html` | Overview: elevator components, design figures, brand comparison |
| `standards.html` | NTC 5926-1, NTC 4349 and international references |
| `simulator.html` | Maintenance-plan simulator (12-month schedule) and 5-year cost comparison |
| `styles.css` | Shared Apple-style responsive styles |
| `sim.js` | Simulator logic (mirrors `02_Analysis/elevator_cost_analysis.py`) |
| `img/` | Figures from the deck |

All figures in the simulator are illustrative placeholders, not EAFIT data.

## Run locally

```bash
python -m http.server 8000
```

## Deploy on Vercel

Import the repo, set **Root Directory** to `website`, Framework Preset *Other*, and deploy.
