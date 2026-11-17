"""Fetch BLS OEWS wage benchmarks used for estimated pay on jobs without a salary.

Uses the official BLS public API (no key: ~25 requests/day, 25 series each), so
the pull is deliberately small (6 requests):

  * national annual 10th/25th/50th/75th/90th percentile wages for one
    representative occupation (SOC) per job_function, and
  * each state's all-occupation median wage, used as a regional index
    (state median / national median).

Writes ml/data/pay_benchmarks.json and prints the SQL values for the
public.pay_benchmarks / public.pay_state_index tables.

    python ml/pay_benchmarks.py [--year 2025]
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path

API = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
# One representative 2018 SOC occupation per public.classify_job_function() value.
FUNCTION_SOC = {
    "engineering": ("151252", "Software Developers"),
    "data": ("152051", "Data Scientists"),
    "design": ("151255", "Web and Digital Interface Designers"),
    "product": ("131111", "Management Analysts"),
    "marketing": ("131161", "Market Research Analysts and Marketing Specialists"),
    "sales": ("414012", "Sales Representatives, Wholesale and Manufacturing"),
    "finance": ("132011", "Accountants and Auditors"),
    "operations": ("131082", "Project Management Specialists"),
    "people": ("131071", "Human Resources Specialists"),
    "legal": ("232011", "Paralegals and Legal Assistants"),
    "healthcare": ("291141", "Registered Nurses"),
    "education": ("252021", "Elementary School Teachers"),
    "customer_support": ("434051", "Customer Service Representatives"),
    "other": ("000000", "All Occupations"),
}
# OEWS datatype codes: annual 10th, 25th, median, 75th, 90th percentile.
PERCENTILES = {"11": "p10", "12": "p25", "13": "p50", "14": "p75", "15": "p90"}
# OEWS top-codes very high wages (shown as "#"); this is the published cap.
TOP_CODE = 239_200
STATE_FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09", "DE": "10",
    "DC": "11", "FL": "12", "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18", "IA": "19",
    "KS": "20", "KY": "21", "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27",
    "MS": "28", "MO": "29", "MT": "30", "NE": "31", "NV": "32", "NH": "33", "NJ": "34", "NM": "35",
    "NY": "36", "NC": "37", "ND": "38", "OH": "39", "OK": "40", "OR": "41", "PA": "42", "RI": "44",
    "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49", "VT": "50", "VA": "51", "WA": "53",
    "WV": "54", "WI": "55", "WY": "56",
}


def national_series(soc: str, datatype: str) -> str:
    return f"OEUN0000000000000{soc}{datatype}"


def state_series(fips: str, soc: str, datatype: str) -> str:
    return f"OEUS{fips}00000000000{soc}{datatype}"


def fetch(series: list[str], year: int) -> dict[str, int | None]:
    out: dict[str, int | None] = {}
    for i in range(0, len(series), 25):
        body = json.dumps({"seriesid": series[i:i + 25], "startyear": str(year), "endyear": str(year)}).encode()
        req = urllib.request.Request(API, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.load(resp)
        if payload.get("status") != "REQUEST_SUCCEEDED":
            raise RuntimeError(f"BLS API: {payload.get('status')} {payload.get('message')}")
        for s in payload["Results"]["series"]:
            row = next((d for d in s["data"] if d.get("period") == "A01"), None)
            value = (row or {}).get("value", "")
            out[s["seriesID"]] = TOP_CODE if value.startswith("#") else int(value) if value.isdigit() else None
        time.sleep(1)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2025)
    args = ap.parse_args()

    nat = {(fn, p): national_series(soc, dt) for fn, (soc, _) in FUNCTION_SOC.items() for dt, p in PERCENTILES.items()}
    st = {code: state_series(fips, "000000", "13") for code, fips in STATE_FIPS.items()}
    values = fetch(list(nat.values()) + list(st.values()), args.year)

    benchmarks = {}
    for fn, (soc, title) in FUNCTION_SOC.items():
        row = {p: values.get(nat[(fn, p)]) for p in PERCENTILES.values()}
        missing = [p for p, v in row.items() if v is None]
        if missing:
            raise SystemExit(f"{fn} ({soc}) is missing {missing}")
        benchmarks[fn] = {"soc": soc, "occupation": title, **row}
    national_median = benchmarks["other"]["p50"]
    state_index = {code: round(values[s] / national_median, 3) for code, s in st.items() if values.get(s)}

    out = {"source": f"BLS OEWS May {args.year}, via api.bls.gov", "benchmarks": benchmarks, "state_index": state_index}
    path = Path(__file__).parent / "data" / "pay_benchmarks.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(out, indent=2) + "\n")
    print(f"wrote {path}")

    print("\ninsert into public.pay_benchmarks (job_function, soc_code, occupation, p10, p25, p50, p75, p90) values")
    print(",\n".join(
        f"  ('{fn}', '{b['soc']}', '{b['occupation']}', {b['p10']}, {b['p25']}, {b['p50']}, {b['p75']}, {b['p90']})"
        for fn, b in benchmarks.items()) + ";")
    print("\ninsert into public.pay_state_index (state, wage_index) values")
    print(",\n".join(f"  ('{c}', {v})" for c, v in sorted(state_index.items())) + ";")


if __name__ == "__main__":
    main()
