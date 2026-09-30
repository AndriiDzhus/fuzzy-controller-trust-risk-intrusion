#!/usr/bin/env python3
"""
Proposes expert security-risk values SR for data/security/security_labeling.csv
by a documented risk matrix, as a starting point for the expert.

    python3 scripts/data/propose_security_labels.py            # adds / updates SR_proposed
    python3 scripts/data/propose_security_labels.py --fill     # also copies it into empty SR_expert

1. Every input gets a severity zone z in [0, 2]: 0 normal, 1 elevated,
   2 critical, piecewise linear between the anchors below.
     Lat, ms   2 -> 0   4 -> 1   8 -> 2   (URLLC 1 ms / 6G 0.1–1 ms; 5G eMBB 4 ms;
                                           control plane target 10 ms)
     TP, dBm  14 -> 0  23 -> 1  30 -> 2   (LoRa EU 14 dBm; max of IoT UE power
                                           class 3 = 23 dBm; 30 dBm = 1 W)
     EC, kWh/Gb 0.02 -> 0  0.03 -> 1  0.04 -> 2   (no norm exists: +50 % and
                                           2x of the efficient baseline 0.02)
2. SR follows a risk matrix over the sorted zones (z1 >= z2 >= z3), which
   reproduces all 6 rules of table 3.1 at the integer zones:
     (0,0,0)   0   all normal                          rule 1
     (1,0,0)  10
     (1,1,0)  15
     (1,1,1)  20   everything elevated                  rule 2
     (2,0,0)  40   one critical, the rest normal         rule 3
     (2,1,0)  50
     (2,1,1)  60   one critical, two elevated            rule 4
     (2,2,0)  70
     (2,2,1)  80   two critical, one elevated            rule 5
     (2,2,2) 100   all critical                          rule 6
   Between integer zones SR is interpolated trilinearly, so it is continuous.
"""
import argparse
import itertools
import os

import numpy as np
import pandas as pd

ANCHORS = {
    "Lat": ([2.0, 4.0, 8.0], [0.0, 1.0, 2.0]),
    "TP": ([14.0, 23.0, 30.0], [0.0, 1.0, 2.0]),
    "EC": ([0.02, 0.03, 0.04], [0.0, 1.0, 2.0]),
}

MATRIX = {
    (0, 0, 0): 0, (1, 0, 0): 10, (1, 1, 0): 15, (1, 1, 1): 20,
    (2, 0, 0): 40, (2, 1, 0): 50, (2, 1, 1): 60,
    (2, 2, 0): 70, (2, 2, 1): 80, (2, 2, 2): 100,
}


def zone(symbol, x):
    xs, zs = ANCHORS[symbol]
    return float(np.interp(x, xs, zs))  # constant outside the anchors


def table(a, b, c):
    return MATRIX[tuple(sorted((a, b, c), reverse=True))]


def risk(ec, tp, lat):
    z = [zone("EC", ec), zone("TP", tp), zone("Lat", lat)]
    lo = [min(int(np.floor(v)), 1) for v in z]  # cell of the 3x3x3 grid
    t = [v - l for v, l in zip(z, lo)]
    sr = 0.0
    for corner in itertools.product((0, 1), repeat=3):
        w = np.prod([t[i] if corner[i] else 1 - t[i] for i in range(3)])
        sr += w * table(*[lo[i] + corner[i] for i in range(3)])
    return sr, z


def main():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default=os.path.join(root, "data/security/security_labeling.csv"))
    parser.add_argument("--fill", action="store_true", help="copy SR_proposed into empty SR_expert cells")
    args = parser.parse_args()

    # Consistency with table 3.1: rule prototypes -> integer zones.
    for zones, expected in [((0, 0, 0), 0), ((1, 1, 1), 20), ((2, 0, 0), 40),
                            ((1, 2, 1), 60), ((2, 1, 2), 80), ((2, 2, 2), 100)]:
        assert table(*zones) == expected

    df = pd.read_csv(args.file, dtype={"SR_expert": str})
    out = df.apply(lambda r: risk(r.EC, r.TP, r.Lat), axis=1)
    df["SR_proposed"] = [f"{sr:.1f}" for sr, _ in out]
    df["zones"] = [" ".join(f"{v:.2f}" for v in z) for _, z in out]
    if args.fill:
        empty = df["SR_expert"].isna() | (df["SR_expert"].str.strip() == "")
        df.loc[empty, "SR_expert"] = df.loc[empty, "SR_proposed"]
    cols = ["row_id", "EC", "TP", "Lat", "SR_base", "SR_proposed", "SR_expert", "split", "dominant_rule", "zones"]
    df[[c for c in cols if c in df.columns]].to_csv(args.file, index=False)

    sr = df["SR_proposed"].astype(float)
    print(f"SR_proposed for {len(df)} rows -> {args.file}")
    print(sr.describe().round(1).to_string())
    print("by 20-point band:", np.histogram(sr, bins=[0, 20, 40, 60, 80, 100.01])[0].tolist())


if __name__ == "__main__":
    main()
