#!/usr/bin/env python3
"""
Builds the small datasets the app ships (data/security.csv, data/intrusion.csv)
from the full ones in data/full/. These are what the training block downloads
and what a lecturer edits and uploads back.

    python3 scripts/data/make_app_datasets.py [--security-rows 200] [--intrusion-per-category 30]

Deterministic: rows are picked by position after sorting, no random numbers.

data/security.csv   EC, TP, Lat, SR, split, row_id
    200 of the 250 labelled rows of data/full/security/security_labeling.csv
    (SR = SR_expert, else SR_proposed, else SR_base), 140 train / 60 test.
    Every dominant rule keeps its share, rare rules are kept whole, so all six
    rules of the controller fire on the training rows.

data/intrusion.csv  NP, Rate, We, IP, label, category, split
    30 rows per category of CICIoT2023 (8 categories, 240 rows): 20 train,
    5 validation and 5 test rows of data/full/intrusion/intrusion.csv, spread
    over the whole range of Rate within the category. IP comes from
    data/full/intrusion/label_to_ip.csv.
"""
import argparse
import csv
import os
from collections import defaultdict

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
FULL = os.path.join(ROOT, "data", "full")


def read(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)


def spread(rows, n):
    """n rows evenly spaced over a sorted list (all of them when n >= len)."""
    if n >= len(rows):
        return list(rows)
    if n <= 0:
        return []
    return [rows[round(i * (len(rows) - 1) / (n - 1))] if n > 1 else rows[len(rows) // 2] for i in range(n)]


def largest_remainder(weights, total):
    """Integer shares of `total` proportional to weights (sum is exact)."""
    raw = {k: total * w / sum(weights.values()) for k, w in weights.items()}
    shares = {k: int(v) for k, v in raw.items()}
    for k in sorted(raw, key=lambda k: raw[k] - shares[k], reverse=True)[: total - sum(shares.values())]:
        shares[k] += 1
    return shares


def security(target_rows):
    rows = read(os.path.join(FULL, "security", "security_labeling.csv"))
    labelled = []
    for r in rows:
        sr = next((r[c] for c in ("SR_expert", "SR_proposed", "SR_base") if r.get(c, "").strip() != ""), None)
        if sr is None:
            continue
        labelled.append({**r, "SR": sr})
    split_share = {"train": 0.7, "test": 0.3}
    out = []
    for split, share in split_share.items():
        of_split = [r for r in labelled if r["split"] == split]
        want = round(target_rows * share)
        by_rule = defaultdict(list)
        for r in of_split:
            by_rule[r["dominant_rule"]].append(r)
        # Rare rules (≤ 5 rows) are kept whole; the rest share the remainder.
        keep = {k: v for k, v in by_rule.items() if len(v) <= 5}
        rest = {k: len(v) for k, v in by_rule.items() if k not in keep}
        shares = largest_remainder(rest, want - sum(len(v) for v in keep.values()))
        for rule in sorted(by_rule):
            group = sorted(by_rule[rule], key=lambda r: float(r["SR"]))
            out.extend(group if rule in keep else spread(group, shares[rule]))
    out.sort(key=lambda r: int(r["row_id"]))
    header = ["EC", "TP", "Lat", "SR", "split", "row_id"]
    write(os.path.join(ROOT, "data", "security.csv"), header, [[r[c] for c in header] for r in out])
    train = sum(r["split"] == "train" for r in out)
    print(f"data/security.csv: {len(out)} rows ({train} train / {len(out) - train} test)")


def intrusion(per_category):
    mapping = {r["label"]: r["IP_target"] for r in read(os.path.join(FULL, "intrusion", "label_to_ip.csv"))}
    per_split = {"train": round(per_category * 2 / 3), "validation": None, "test": None}
    rest = per_category - per_split["train"]
    per_split["validation"] = rest // 2
    per_split["test"] = rest - per_split["validation"]
    all_rows = read(os.path.join(FULL, "intrusion", "intrusion.csv"))
    out = []
    for split, n in per_split.items():
        by_cat = defaultdict(list)
        for r in all_rows:
            if r["split"] == split:
                by_cat[r["category"]].append(r)
        for cat in sorted(by_cat):
            group = sorted(by_cat[cat], key=lambda r: (float(r["Rate"]), r["label"]))
            for r in spread(group, n):
                out.append([r["NP"], r["Rate"], r["We"], mapping[r["label"]], r["label"], r["category"], split])
    order = {"train": 0, "validation": 1, "test": 2}
    out.sort(key=lambda r: (order[r[6]], r[5], float(r[1])))
    header = ["NP", "Rate", "We", "IP", "label", "category", "split"]
    write(os.path.join(ROOT, "data", "intrusion.csv"), header, out)
    counts = {s: sum(r[6] == s for r in out) for s in order}
    print(f"data/intrusion.csv: {len(out)} rows ({counts['train']} train / {counts['validation']} validation / {counts['test']} test)")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--security-rows", type=int, default=200)
    p.add_argument("--intrusion-per-category", type=int, default=30)
    a = p.parse_args()
    security(a.security_rows)
    intrusion(a.intrusion_per_category)


if __name__ == "__main__":
    main()
