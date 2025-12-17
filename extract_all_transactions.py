#!/usr/bin/env python3
"""Extract all transaction details for IDs found in existing JSON data."""

import json
import os
import re
import subprocess
from pathlib import Path

BASE_URL = "http://localhost:8000/api"
DATA_DIR = Path(__file__).parent / "data"
TX_DIR = DATA_DIR / "transactions"
WHY_DIR = TX_DIR / "why"

def find_all_transaction_ids() -> set[str]:
    """Find all unique transaction IDs in existing JSON files."""
    tx_ids = set()
    pattern = re.compile(r'"transaction_id":\s*"([a-f0-9-]{36})"')

    for json_file in DATA_DIR.rglob("*.json"):
        # Skip transaction files themselves
        if "transactions" in str(json_file):
            continue
        try:
            content = json_file.read_text(encoding="utf-8")
            matches = pattern.findall(content)
            tx_ids.update(matches)
        except Exception as e:
            print(f"  Error reading {json_file}: {e}")

    return tx_ids


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
            return None
    except Exception as e:
        print(f"  ERROR fetching {url}: {e}")
        return None


def save_json(data: dict | list, filepath: Path):
    """Save JSON to file."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def main():
    print("=" * 60)
    print("Extracting all transaction details")
    print("=" * 60)

    # Create directories
    TX_DIR.mkdir(parents=True, exist_ok=True)
    WHY_DIR.mkdir(parents=True, exist_ok=True)

    # Find all transaction IDs
    print("\nScanning existing JSON files for transaction IDs...")
    tx_ids = find_all_transaction_ids()
    print(f"Found {len(tx_ids)} unique transaction IDs")

    # Check which are already extracted
    existing = set()
    for f in TX_DIR.glob("*.json"):
        if f.name != "why":
            existing.add(f.stem)

    missing = tx_ids - existing
    print(f"Already extracted: {len(existing)}")
    print(f"Need to extract: {len(missing)}")

    if not missing:
        print("\nAll transactions already extracted!")
        return

    # Extract missing transactions
    print(f"\nExtracting {len(missing)} transactions...")
    success = 0
    failed = 0

    for i, tx_id in enumerate(sorted(missing), 1):
        print(f"  [{i}/{len(missing)}] {tx_id[:12]}...", end=" ")

        # Transaction detail
        data = fetch_json(f"/transactions/{tx_id}")
        if data:
            save_json(data, TX_DIR / f"{tx_id}.json")

            # Why explanation
            why_data = fetch_json(f"/transactions/{tx_id}/why")
            if why_data:
                save_json(why_data, WHY_DIR / f"{tx_id}.json")

            success += 1
            print("OK")
        else:
            failed += 1
            print("FAILED")

    print("\n" + "=" * 60)
    print(f"Extraction complete!")
    print(f"Success: {success}, Failed: {failed}")
    print("=" * 60)


if __name__ == "__main__":
    main()
