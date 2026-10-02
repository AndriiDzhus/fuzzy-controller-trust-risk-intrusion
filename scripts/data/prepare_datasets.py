#!/usr/bin/env python3
"""
Builds the training datasets of the Security (ANFIS) and Intrusion (GA)
controllers from the source datasets. Only the controller inputs are kept.

    python3 scripts/data/prepare_datasets.py --datasets <DATASETS dir>

Source files (inside --datasets):
    6G_IoT_Beamforming_Dataset.csv       6G IoT Intelligent Management Dataset
    CICIOT23/train/train.csv             CICIoT2023, merged version
    CICIOT23/validation/validation.csv   (46 features + label)
    CICIOT23/test/test.csv

Output (inside --out, default data/full/):
    security/security_labeling.csv       250 rows for the expert: SR_expert to fill
    intrusion/intrusion.csv              NP, Rate, We, label, category, split
                                         (4000 train / 1600 validation / 1600 test)
    intrusion/label_to_ip.csv            label -> IP_target, draft for the expert

The script is deterministic (fixed seed). An existing security_labeling.csv
or label_to_ip.csv is never overwritten, so expert work is not lost; pass
--force to rebuild them. The small datasets the app ships (data/*.csv) are
built from these by scripts/data/make_app_datasets.py.
"""
import argparse
import os
import sys

import numpy as np
import pandas as pd

SEED = 42

# ---------------------------------------------------------------------------
# Security: 6G IoT Intelligent Management Dataset
# ---------------------------------------------------------------------------

SECURITY_COLUMNS = {
    "EC": "Energy Consumption (kWh/Gb)",
    "TP": "Transmit Power (dBm)",
    "Lat": "Latency (ms)",
}

# Base (expert) model, identical to src/controllers/securityController.js
SECURITY_PEAKS = {"EC": (0.025, 0.05), "TP": (20.0, 40.0), "Lat": (5.0, 10.0)}
SECURITY_RULES = [
    (("low", "low", "low"), 0.0),
    (("medium", "medium", "medium"), 20.0),
    (("high", "low", "low"), 40.0),
    (("medium", "high", "medium"), 60.0),
    (("high", "medium", "high"), 80.0),
    (("high", "high", "high"), 100.0),
]
LABELING_SIZE = 250
LABELING_TEST_SHARE = 0.3


def triangle(x, a, b, c):
    x = np.asarray(x, dtype=float)
    left = np.where(b > a, (x - a) / (b - a if b > a else 1.0), 1.0)
    right = np.where(c > b, (c - x) / (c - b if c > b else 1.0), 1.0)
    mu = np.minimum(left, right)
    mu[(x < a) | (x > c)] = 0.0
    return np.clip(mu, 0.0, 1.0)


def security_memberships(df):
    mu = {}
    for key, (peak, top) in SECURITY_PEAKS.items():
        x = df[key].to_numpy()
        mu[key] = {
            "low": triangle(x, 0.0, 0.0, peak),
            "medium": triangle(x, 0.0, peak, top),
            "high": triangle(x, peak, top, top),
        }
    return mu


def security_base_output(df):
    """Rule weights (product), normalised weights and SR of the base model."""
    mu = security_memberships(df)
    weights = np.stack(
        [mu["EC"][ec] * mu["TP"][tp] * mu["Lat"][lat] for (ec, tp, lat), _ in SECURITY_RULES],
        axis=1,
    )
    total = weights.sum(axis=1)
    norm = np.divide(weights, total[:, None], out=np.zeros_like(weights), where=total[:, None] > 0)
    consequents = np.array([c for _, c in SECURITY_RULES])
    sr = np.where(total > 0, norm @ consequents, np.nan)
    return weights, norm, sr


def build_security(datasets_dir, out_dir, force):
    src = os.path.join(datasets_dir, "6G_IoT_Beamforming_Dataset.csv")
    raw = pd.read_csv(src)
    df = pd.DataFrame({key: raw[col] for key, col in SECURITY_COLUMNS.items()})
    df.insert(0, "row_id", raw.index + 1)  # 1-based row number in the source file

    os.makedirs(out_dir, exist_ok=True)
    labeling_path = os.path.join(out_dir, "security_labeling.csv")
    if os.path.exists(labeling_path) and not force:
        print(f"security: {labeling_path} exists, kept (use --force to rebuild)")
        return

    weights, norm, sr = security_base_output(df)
    df["dominant_rule"] = norm.argmax(axis=1) + 1
    df["SR_base"] = np.round(sr, 1)

    rng = np.random.default_rng(SEED)
    chosen = set()
    # Rules 1 and 3 fire on few rows: take every row where they fire noticeably.
    for rule in (0, 2):
        chosen.update(np.flatnonzero(weights[:, rule] > 0.05).tolist())
    # Fill the rest evenly over the dominant rules, then at random.
    groups = {r: rng.permutation(np.flatnonzero(df["dominant_rule"].to_numpy() == r)).tolist()
              for r in range(1, 7)}
    while len(chosen) < LABELING_SIZE and any(groups.values()):
        for r in range(1, 7):
            while groups[r] and groups[r][0] in chosen:
                groups[r].pop(0)
            if groups[r] and len(chosen) < LABELING_SIZE:
                chosen.add(groups[r].pop(0))
    sample = df.loc[sorted(chosen)].copy()

    # 70 / 30 split, stratified by the dominant rule.
    sample["split"] = "train"
    for _, idx in sample.groupby("dominant_rule").groups.items():
        idx = rng.permutation(list(idx))
        n_test = int(round(len(idx) * LABELING_TEST_SHARE))
        sample.loc[idx[:n_test], "split"] = "test"
    sample["SR_expert"] = ""
    sample["SR_base"] = sample["SR_base"].map(lambda v: f"{v:.1f}")

    cols = ["row_id", "EC", "TP", "Lat", "SR_base", "SR_expert", "split", "dominant_rule"]
    sample[cols].to_csv(labeling_path, index=False, float_format="%.6f")
    counts = sample["dominant_rule"].value_counts().sort_index().to_dict()
    print(f"security: {len(sample)} rows for labeling -> {labeling_path}")
    print(f"          by dominant rule {counts}, split {sample['split'].value_counts().to_dict()}")


# ---------------------------------------------------------------------------
# Intrusion: CICIoT2023 (merged version)
# ---------------------------------------------------------------------------

INTRUSION_COLUMNS = {"NP": "Number", "Rate": "Rate", "We": "Weight"}

# Seven attack categories of CICIoT2023 plus benign traffic.
CATEGORY_BY_LABEL = {
    "BenignTraffic": "Benign",
    "DDoS-ACK_Fragmentation": "DDoS", "DDoS-HTTP_Flood": "DDoS", "DDoS-ICMP_Flood": "DDoS",
    "DDoS-ICMP_Fragmentation": "DDoS", "DDoS-PSHACK_Flood": "DDoS", "DDoS-RSTFINFlood": "DDoS",
    "DDoS-SYN_Flood": "DDoS", "DDoS-SlowLoris": "DDoS", "DDoS-SynonymousIP_Flood": "DDoS",
    "DDoS-TCP_Flood": "DDoS", "DDoS-UDP_Flood": "DDoS", "DDoS-UDP_Fragmentation": "DDoS",
    "DoS-HTTP_Flood": "DoS", "DoS-SYN_Flood": "DoS", "DoS-TCP_Flood": "DoS", "DoS-UDP_Flood": "DoS",
    "Mirai-greeth_flood": "Mirai", "Mirai-greip_flood": "Mirai", "Mirai-udpplain": "Mirai",
    "Recon-HostDiscovery": "Recon", "Recon-OSScan": "Recon", "Recon-PingSweep": "Recon",
    "Recon-PortScan": "Recon", "VulnerabilityScan": "Recon",
    "DNS_Spoofing": "Spoofing", "MITM-ArpSpoofing": "Spoofing",
    "DictionaryBruteForce": "BruteForce",
    "BrowserHijacking": "Web", "Backdoor_Malware": "Web", "CommandInjection": "Web",
    "SqlInjection": "Web", "Uploading_Attack": "Web", "XSS": "Web",
}

# Draft expert mapping label -> intrusion probability, on the centres of the
# output terms: none 0, low 30, medium 60, high 100. The expert edits it.
DRAFT_IP_BY_CATEGORY = {
    "Benign": 0,        # normal traffic
    "Recon": 30,        # reconnaissance: an attack is being prepared
    "Spoofing": 60,     # traffic is intercepted or redirected
    "BruteForce": 60,   # credentials are being guessed
    "Web": 60,          # exploitation attempts
    "DoS": 100,         # the device is under attack
    "DDoS": 100,
    "Mirai": 100,       # botnet traffic: the device is compromised
}
DRAFT_IP_OVERRIDES = {"Backdoor_Malware": 100}  # a backdoor means the device is compromised

# Rows per category; inside a category, rows are spread evenly over labels.
PER_CATEGORY = {"train": 500, "validation": 200, "test": 200}


def sample_split(path, per_category, rng):
    print(f"intrusion: reading {path} ...", flush=True)
    df = pd.read_csv(path, usecols=list(INTRUSION_COLUMNS.values()) + ["label"])
    df = df.rename(columns={v: k for k, v in INTRUSION_COLUMNS.items()})
    unknown = sorted(set(df["label"]) - set(CATEGORY_BY_LABEL))
    if unknown:
        sys.exit(f"unknown labels in {path}: {unknown}")
    df["category"] = df["label"].map(CATEGORY_BY_LABEL)
    df = df.replace([np.inf, -np.inf], np.nan).dropna(subset=["NP", "Rate", "We"])

    parts = []
    for category, cat_df in df.groupby("category"):
        labels = sorted(cat_df["label"].unique())
        quota = per_category
        # Even share per label; small labels give their remainder to the others.
        counts = cat_df["label"].value_counts()
        remaining = sorted(labels, key=lambda lab: counts[lab])
        for i, label in enumerate(remaining):
            share = quota // (len(remaining) - i)
            n = min(share, counts[label])
            parts.append(cat_df[cat_df["label"] == label].sample(n=n, random_state=int(rng.integers(1 << 31))))
            quota -= n
    out = pd.concat(parts).sample(frac=1.0, random_state=SEED).reset_index(drop=True)
    return out[["NP", "Rate", "We", "label", "category"]]


def build_intrusion(datasets_dir, out_dir, force):
    base = os.path.join(datasets_dir, "CICIOT23")
    os.makedirs(out_dir, exist_ok=True)
    rng = np.random.default_rng(SEED)
    samples = []
    for split, per_category in PER_CATEGORY.items():
        path = os.path.join(base, split, f"{split}.csv")
        sample = sample_split(path, per_category, rng)
        sample["split"] = split
        samples.append(sample)
        print(f"intrusion: {split}: {len(sample)} rows, by category {sample['category'].value_counts().sort_index().to_dict()}")
    target = os.path.join(out_dir, "intrusion.csv")
    pd.concat(samples).to_csv(target, index=False, float_format="%.6f")
    print(f"intrusion: {sum(len(s) for s in samples)} rows -> {target}")

    mapping_path = os.path.join(out_dir, "label_to_ip.csv")
    if os.path.exists(mapping_path) and not force:
        print(f"intrusion: {mapping_path} exists, kept (use --force to rebuild)")
        return
    rows = []
    for label, category in sorted(CATEGORY_BY_LABEL.items(), key=lambda kv: (kv[1], kv[0])):
        rows.append({
            "label": label,
            "category": category,
            "IP_target": DRAFT_IP_OVERRIDES.get(label, DRAFT_IP_BY_CATEGORY[category]),
        })
    pd.DataFrame(rows).to_csv(mapping_path, index=False)
    print(f"intrusion: {len(rows)} labels -> {mapping_path} (draft, to be checked by the expert)")


def main():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--datasets", required=True, help="folder with the source datasets")
    parser.add_argument("--out", default=os.path.join(root, "data", "full"), help="output folder (default: data/full/)")
    parser.add_argument("--only", choices=["security", "intrusion"], help="build one controller only")
    parser.add_argument("--force", action="store_true", help="rebuild the expert files too")
    args = parser.parse_args()

    if args.only in (None, "security"):
        build_security(args.datasets, os.path.join(args.out, "security"), args.force)
    if args.only in (None, "intrusion"):
        build_intrusion(args.datasets, os.path.join(args.out, "intrusion"), args.force)


if __name__ == "__main__":
    main()
