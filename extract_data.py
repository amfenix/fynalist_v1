#!/usr/bin/env python3
"""Extract JSON data from running API for static demo site using curl."""

import json
import os
import subprocess
import urllib.parse
from pathlib import Path

BASE_URL = "http://localhost:8000/api"
DATA_DIR = Path(__file__).parent / "data"

# Merchant IDs
MERCHANT_IDS = [30, 243, 405]

# Transaction IDs from ContractMismatch.tsx examples
TRANSACTION_IDS = [
    "dd129486-0b41-4b60-b023-b84834eb88d1",
    "dd120776-d050-44ad-a807-0881ec66b25c",
    "dd12603e-30b4-4893-b057-d1424ce10003",
    "dd12344d-722b-437d-8666-aef69eb17b61",
    "dd125369-f35e-4e36-907d-239111edb4a9",
    "dd12df73-641f-40f2-872f-0778b2be7e61",
    "dd121f11-f763-405d-98ce-842f34c35c6c",
    "dd1206b0-34ca-46be-9295-16e931c93e1a",
    "dd125d74-2755-45aa-9417-7fd1d713c029",
    "dd12856f-3ac4-47cb-b29d-def4dccf6fb8",
    "dd128d1b-8ba1-41cd-927e-d026dffc34ed",
    "dd122799-534a-4e19-877f-1a10553825e0",
    "dd12018c-c025-4f86-9430-b97bc8106d51",
    "dd125388-c220-4011-9761-e146588451e5",
    "dd121522-c0ea-46d9-9074-a9e409521d16",
    "dd51749a-4664-4f9b-8834-3996c32a24bc",
    "dd51011c-8d82-4970-b29b-d3fe460d8505",
    "dd118c65-bbb1-4e92-bbd7-570c1f43529b",
    "dd110d81-b79a-4732-8640-e3a9b27252be",
    "dd11abab-cfff-44eb-98e4-6eab31e07281",
    "dd11fe33-3411-4063-81b5-b690c12a9d05",
    "dd11f147-bc61-440a-9c57-da3ee1555c33",
    "dd112beb-08f1-4704-a9d7-50641a87ffab",
    "dd51e51b-0bd3-4836-bdcb-f1c6a7461a18",
    "dd51e08a-dc97-4661-8bb7-62b80ee14c90",
    "dd5125eb-e841-4243-9671-fe970e4889e1",
    "dd1165e7-c8f8-4f36-8491-0aba02258787",
    "dd1164da-0615-4722-a71b-b7e57527be28",
    "dd115ffb-fc94-463d-91db-f1d97fbeeec6",
    "dd529820-7122-4654-a460-780793c69d2d",
    "dd529e47-1d23-4cc9-93c3-09f358f1ce81",
    "dd52ccfb-a405-4f6e-9ea3-817937b7ecdb",
    "dd110f78-8797-478d-b3e6-71f00e2ed4a9",
    "dd1172bf-ffe6-4722-b158-53b800aeea29",
    "dd11e06e-ab40-4983-b765-e37a72e63a9c",
    "dd1230a4-aeee-4348-bb78-108c86a228a9",
    "dd122c66-a05a-4222-8f58-096a6ee93695",
    "dd126839-98c9-471f-a2c2-e3627e5b3321",
    "dd125455-3bae-440c-890a-938b482232e7",
    "dd12b879-ce1f-4f32-b053-947ff3f01206",
    "dd121dc7-5631-4b65-bc0e-f7b61e65ab15",
    "dd12bd17-a537-4da0-9a8e-57281544f63a",
    "dd1241e1-dd57-4836-ac8a-c16299efb867",
    "dd124584-e716-4f4b-acc7-6054a3a32888",
    "dd529fe7-95f5-4682-b09e-2281b7358158",
    "dd516e91-6817-4d4a-82bf-028d4734a783",
    "dd518512-77dd-4aaf-98b6-2838cac63908",
]


def fetch_json(path: str) -> dict | list | None:
    """Fetch JSON from API endpoint using curl."""
    url = f"{BASE_URL}{path}"
    try:
        result = subprocess.run(
            ["curl", "-s", "--max-time", "30", url],
            capture_output=True,
            text=True
        )
        if result.returncode == 0 and result.stdout:
            return json.loads(result.stdout)
        else:
            print(f"  ERROR fetching {url}: {result.stderr}")
            return None
    except Exception as e:
        print(f"  ERROR fetching {url}: {e}")
        return None


def save_json(data: dict | list, filepath: Path):
    """Save JSON to file."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  Saved: {filepath.name}")


def extract_merchants():
    """Extract merchant list."""
    print("\n=== Extracting merchants list ===")
    data = fetch_json("/merchants")
    if data:
        save_json(data, DATA_DIR / "merchants.json")


def extract_merchant_details():
    """Extract merchant details, monthly, plans, stability."""
    for merchant_id in MERCHANT_IDS:
        print(f"\n=== Extracting merchant {merchant_id} ===")

        # Merchant detail
        data = fetch_json(f"/merchants/{merchant_id}")
        if data:
            save_json(data, DATA_DIR / "merchants" / f"{merchant_id}.json")

        # Monthly stats
        data = fetch_json(f"/merchants/{merchant_id}/monthly")
        if data:
            save_json(data, DATA_DIR / "monthly" / f"{merchant_id}.json")

        # Plans list
        data = fetch_json(f"/merchants/{merchant_id}/plans")
        if data:
            save_json(data, DATA_DIR / "plans" / f"{merchant_id}.json")

            # Extract each plan detail
            print(f"  Extracting {len(data)} plan details...")
            for plan in data:
                plan_key = plan.get("plan_key")
                if plan_key:
                    encoded_key = urllib.parse.quote(plan_key, safe="")
                    plan_data = fetch_json(f"/merchants/{merchant_id}/plans/{encoded_key}")
                    if plan_data:
                        # Use safe filename
                        safe_key = plan_key.replace(":", "_").replace("/", "_")
                        save_json(plan_data, DATA_DIR / "plans" / "details" / f"{safe_key}.json")

        # Stability
        data = fetch_json(f"/merchants/{merchant_id}/stability")
        if data:
            save_json(data, DATA_DIR / "stability" / f"{merchant_id}.json")


def extract_transactions():
    """Extract transaction details and why explanations."""
    print(f"\n=== Extracting {len(TRANSACTION_IDS)} transactions ===")
    for i, tx_id in enumerate(TRANSACTION_IDS, 1):
        print(f"  [{i}/{len(TRANSACTION_IDS)}] {tx_id[:8]}...")

        # Transaction detail
        data = fetch_json(f"/transactions/{tx_id}")
        if data:
            save_json(data, DATA_DIR / "transactions" / f"{tx_id}.json")

        # Why explanation
        data = fetch_json(f"/transactions/{tx_id}/why")
        if data:
            save_json(data, DATA_DIR / "transactions" / "why" / f"{tx_id}.json")


def main():
    print("=" * 60)
    print("Extracting JSON data from API for static demo")
    print("=" * 60)
    print(f"Base URL: {BASE_URL}")
    print(f"Data dir: {DATA_DIR}")

    # Create directories
    (DATA_DIR / "merchants").mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "monthly").mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "plans" / "details").mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "stability").mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "transactions" / "why").mkdir(parents=True, exist_ok=True)

    extract_merchants()
    extract_merchant_details()
    extract_transactions()

    print("\n" + "=" * 60)
    print("Extraction complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
