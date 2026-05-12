import requests
import time
import json
import os


DATA_FILE = "../data/data.json"


def initial_retrieval():
    base_url = "https://data.zeeker.sg/zeeker-judgements/judgments.json"
    params = {
        "_nocol": "content_text",
        "_size": 1000,
        "_shape": "objects" # Keeps rows as a list of dicts
    }

    all_data = []
    next_token = None

    while True:
        # Add the pagination token if we hadata ve one
        if next_token:
            params["_next"] = next_token
        
        print(f"Fetching data... (current count: {len(all_data)})")
        response = requests.get(base_url, params=params)
        data = response.json()
        
        # Append the rows from this page to our main list
        all_data.extend(data["rows"])
        
        # Get the next token. If it's missing or null, we're done!
        next_token = data.get("next")
        if not next_token:
            break
            
        # Optional: Small sleep to be polite to the server
        time.sleep(0.5)

    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(all_data, f, indent=4)

    print(f"Success! Total rows retrieved: {len(all_data)}")



def incremental_update():
    # 1. Load existing data
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            all_data = json.load(f)
    else:
        all_data = []

    # Create a set of existing hash IDs for instant lookups
    existing_hashes = {row["id"] for row in all_data}
    
    # Find the highest rowid we currently have
    last_rowid = max([row.get("rowid", 0) for row in all_data]) if all_data else 0
    print(f"Last recorded rowid: {last_rowid}")

    base_url = "https://data.zeeker.sg/zeeker-judgements/judgments.json"
    params = {
        "_nocol": "content_text",
        "_size": 1000,
        "_shape": "objects",
        "rowid__gt": last_rowid, # Datasette's built-in "Greater Than" operator
        "_sort": "rowid"
    }

    new_records = []
    next_token = None

    while True:
        if next_token:
            params["_next"] = next_token
        
        try:
            response = requests.get(base_url, params=params)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            print(f"Error fetching data: {e}")
            break
        
        rows = data.get("rows", [])
        if not rows:
            break
            
        for row in rows:
            # DOUBLE CHECK: Only add if the unique hash ID isn't already in our set
            if row["id"] not in existing_hashes:
                new_records.append(row)
                existing_hashes.add(row["id"])
        
        print(f"Fetched {len(rows)} rows, {len(new_records)} are new...")

        next_token = data.get("next")
        if not next_token:
            break

    # 4. Save if we found anything
    if new_records:
        all_data.extend(new_records)
        os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(all_data, f, indent=4, ensure_ascii=False)
        print(f"Success! Added {len(new_records)} new records. Total: {len(all_data)}")
    else:
        print("Everything is up to date.")

if __name__ == "__main__":
    incremental_update()