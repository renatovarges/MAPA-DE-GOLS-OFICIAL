
import sys

def fix_mojibake(filename):
    print(f"Attempting mojibake fix (ASCII marker) for {filename}...")
    try:
        with open(filename, 'r', encoding='utf-8', errors='replace') as f:
            full_text = f.read()
            
        print(f"File read. Length: {len(full_text)}")
        
        # Use ASCII marker to avoid encoding pitfalls
        split_marker = "function drawMarkerLegendNew"
        
        parts = full_text.split(split_marker)
        
        if len(parts) < 2:
            print(f"CRITICAL: Split marker '{split_marker}' not found!")
            return

        # Part 0 is corrupt top
        # We need to include the marker in the good part (or handling it)
        # The marker is the start of the function definition.
        corrupt_part = parts[0]
        # The good part starts with the function definition
        good_part = split_marker + parts[1]
        
        print(f"Split OK. Corrupt part len: {len(corrupt_part)}")
        
        # FIX MOJIBAKE
        # Try cp1252 inversion
        try:
            # We use 'ignore' to drop chars that can't be encoded in cp1252 (like maybe some weird unicode that crept in)
            # but main text should be fine.
            raw_bytes = corrupt_part.encode('cp1252', errors='ignore')
            fixed_top = raw_bytes.decode('utf-8')
            print("Successfully inverted encoding (cp1252)!")
            
        except Exception as e:
            print(f"Inversion failed: {e}")
            fixed_top = corrupt_part

        final_text = fixed_top + good_part
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(final_text)
            
        print("File saved with mojibake fix.")

    except Exception as e:
        print(f"Error: {e}")

fix_mojibake('script.js')
