
try:
    with open('script.js', 'r', encoding='utf-8') as f:
        content = f.read()
        
    print(f"File read successfully. Length: {len(content)}")
    
    if "Assistência" in content:
        print("PASS: 'Assistência' found correct.")
    else:
        print("FAIL: 'Assistência' NOT found.")
        # check for mojibake just in case
        if "AssistÃªncia" in content:
            print("FAIL: Found 'AssistÃªncia' (mojibake).")
            
    if "drawMarkerLegendNew" in content:
        print("PASS: 'drawMarkerLegendNew' found.")
    else:
        print("FAIL: 'drawMarkerLegendNew' NOT found.")
        
except Exception as e:
    print(f"Error reading file: {e}")
