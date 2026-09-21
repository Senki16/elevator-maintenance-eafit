"""
Elevator maintenance: brand comparison and cost-reduction analysis
====================================================================

Source: "Mantenimiento_Ascensores" presentation (Universidad EAFIT).

IMPORTANT — the presentation itself contains no numeric cost or
performance data. It only gives QUALITATIVE statements:
  * three elevator brands used at the university: Estilo, Schindler,
    Mitsubishi (slide 16-17), each with a short description of its
    warranty, maintenance technology and standards compliance;
  * three qualitative "ways to reduce costs" (slide 18):
      1) adopt a foreign standard stricter than the Colombian one,
      2) modernize/upgrade some elevators for energy efficiency
         (checking spare-part availability),
      3) reduce the number of elevators at the university.

To turn that into a numeric analysis, every number below marked in the
ASSUMPTIONS block is an ILLUSTRATIVE placeholder, not a figure from the
deck. Replace them with your real quotes / utility bills / maintenance
contracts and the rest of the script (scoring, payback, charts) will
recompute automatically.
"""

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

import os
OUT_DIR = os.path.dirname(os.path.abspath(__file__))  # outputs land next to this script
os.makedirs(OUT_DIR, exist_ok=True)

# ---------------------------------------------------------------------
# 1) ASSUMPTIONS — edit these with real numbers when you have them
# ---------------------------------------------------------------------

# Qualitative scores (1-5) inferred from slide 17's description of each
# brand's warranty, maintenance technology and standards compliance.
BRAND_QUALITATIVE = pd.DataFrame({
    "brand": ["Estilo", "Schindler", "Mitsubishi"],
    "warranty_years": [2, np.nan, np.nan],          # only Estilo's is stated
    "predictive_tech_score": [2, 5, 5],              # deck: "less predictive" vs "advanced" / "highly technological, remote monitoring"
    "standards_breadth_score": [3, 5, 5],            # "relevant" vs "strict ISO/EN" / "rigorous ISO/JIS"
    "local_support_score": [5, 3, 3],                # Estilo = "Colombian company" -> assume easier local support/spares
})

# Illustrative annual cost figures per elevator (COP, in millions) —
# REPLACE with real maintenance-contract and energy figures.
ASSUMPTIONS = {
    "n_elevators_total": 12,          # how many elevators the university operates
    "annual_maintenance_cost_per_unit": 18.0,   # $M COP/year, current contract, per elevator
    "annual_energy_cost_per_unit": 6.0,         # $M COP/year, per elevator
    "modernization_capex_per_unit": 80.0,       # $M COP, one-off upgrade cost (slide 18, option 2)
    "modernization_energy_savings_pct": 0.30,   # upgraded models' promised efficiency gain
    "modernization_maintenance_savings_pct": 0.15,  # fewer failures once upgraded
    "stricter_standard_extra_inspection_cost_pct": 0.10,  # slide 18, option 1: incremental compliance/inspection cost
    "elevator_reduction_count": 2,              # slide 18, option 3: how many units to decommission
    "n_years_horizon": 5,
}

# ---------------------------------------------------------------------
# 2) Brand composite score (weighted, min-max normalized)
# ---------------------------------------------------------------------

df = BRAND_QUALITATIVE.copy()
weights = {"predictive_tech_score": 0.4, "standards_breadth_score": 0.35, "local_support_score": 0.25}

for col in weights:
    lo, hi = df[col].min(), df[col].max()
    df[col + "_norm"] = 1.0 if hi == lo else (df[col] - lo) / (hi - lo)

df["composite_score"] = sum(df[c + "_norm"] * w for c, w in weights.items())
df = df.sort_values("composite_score", ascending=False).reset_index(drop=True)

print("=== Brand comparison (from slide 17, scored 0-1) ===")
print(df[["brand", "predictive_tech_score", "standards_breadth_score",
          "local_support_score", "composite_score"]].to_string(index=False))

fig, ax = plt.subplots(figsize=(6, 4))
ax.bar(df["brand"], df["composite_score"], color=["#2b6cb0", "#2f855a", "#c05621"])
ax.set_ylabel("Composite score (0-1)")
ax.set_title("Elevator brand comparison\n(qualitative scoring from the presentation)")
ax.set_ylim(0, 1)
for i, v in enumerate(df["composite_score"]):
    ax.text(i, v + 0.02, f"{v:.2f}", ha="center")
fig.tight_layout()
fig.savefig(f"{OUT_DIR}/brand_comparison.png", dpi=150)
plt.close(fig)

# ---------------------------------------------------------------------
# 3) Cost-reduction strategies (slide 18)
# ---------------------------------------------------------------------

A = ASSUMPTIONS
n = A["n_elevators_total"]
years = np.arange(0, A["n_years_horizon"] + 1)
baseline_annual = n * (A["annual_maintenance_cost_per_unit"] + A["annual_energy_cost_per_unit"])
baseline_cumulative = baseline_annual * years

# --- Option 1: adopt a stricter foreign standard -> higher inspection/compliance cost, no savings modeled
opt1_annual = baseline_annual * (1 + A["stricter_standard_extra_inspection_cost_pct"])
opt1_cumulative = opt1_annual * years

# --- Option 2: modernize elevators -> upfront capex, then lower maintenance + energy cost
capex = n * A["modernization_capex_per_unit"]
opt2_annual_after = n * (
    A["annual_maintenance_cost_per_unit"] * (1 - A["modernization_maintenance_savings_pct"]) +
    A["annual_energy_cost_per_unit"] * (1 - A["modernization_energy_savings_pct"])
)
opt2_cumulative = capex + opt2_annual_after * years
annual_savings_opt2 = baseline_annual - opt2_annual_after
payback_years = capex / annual_savings_opt2 if annual_savings_opt2 > 0 else float("inf")

# --- Option 3: reduce elevator count -> immediate proportional maintenance+energy savings
n_reduced = n - A["elevator_reduction_count"]
opt3_annual = n_reduced * (A["annual_maintenance_cost_per_unit"] + A["annual_energy_cost_per_unit"])
opt3_cumulative = opt3_annual * years

print("\n=== Cost-reduction strategies (slide 18), 5-year horizon, $M COP ===")
summary = pd.DataFrame({
    "strategy": [
        "Baseline (no change)",
        "1) Adopt stricter foreign standard",
        "2) Modernize elevators",
        "3) Reduce elevator count",
    ],
    "year0_outlay": [0, 0, capex, 0],
    "annual_run_cost_after": [baseline_annual, opt1_annual, opt2_annual_after, opt3_annual],
    "cumulative_5y_cost": [baseline_cumulative[-1], opt1_cumulative[-1], opt2_cumulative[-1], opt3_cumulative[-1]],
})
summary["savings_vs_baseline_5y"] = summary["cumulative_5y_cost"].iloc[0] - summary["cumulative_5y_cost"]
print(summary.to_string(index=False))
print(f"\nModernization (option 2) simple payback period: {payback_years:.1f} years")
summary.to_csv(f"{OUT_DIR}/cost_strategy_summary.csv", index=False)

fig, ax = plt.subplots(figsize=(7, 4.5))
ax.plot(years, baseline_cumulative, label="Baseline (no change)", marker="o")
ax.plot(years, opt1_cumulative, label="1) Stricter foreign standard", marker="o")
ax.plot(years, opt2_cumulative, label="2) Modernize elevators", marker="o")
ax.plot(years, opt3_cumulative, label="3) Reduce elevator count", marker="o")
ax.set_xlabel("Year")
ax.set_ylabel("Cumulative cost ($M COP)")
ax.set_title("Cumulative cost by strategy (illustrative assumptions)")
ax.legend()
fig.tight_layout()
fig.savefig(f"{OUT_DIR}/cost_strategy_projection.png", dpi=150)
plt.close(fig)

print(f"\nCharts saved: {OUT_DIR}/brand_comparison.png, {OUT_DIR}/cost_strategy_projection.png")
print(f"Table saved:  {OUT_DIR}/cost_strategy_summary.csv")
