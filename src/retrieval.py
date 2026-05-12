import requests
import time
import json

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
        # Add the pagination token if we have one
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

    with open("data/data.json", "w", encoding="utf-8") as f:
        json.dump(all_data, f, indent=4)

    print(f"Success! Total rows retrieved: {len(all_data)}")