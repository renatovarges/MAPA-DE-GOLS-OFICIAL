
import sys
import re

def smart_fix_mojibake(filename):
    print(f"Attempting SMART mojibake fix for {filename}...")
    try:
        with open(filename, 'r', encoding='utf-8', errors='replace') as f:
            full_text = f.read()
            
        print(f"File read. Length: {len(full_text)}")
        
        # Split point
        split_marker = "function drawMarkerLegendNew"
        parts = full_text.split(split_marker)
        
        if len(parts) < 2:
            print("CRITICAL: Split marker not found!")
            return

        corrupt_part = parts[0]
        good_part = split_marker + parts[1]
        
        # Smart Regex Replace
        # Look for sequences of Latin-1 characters (0080-00FF)
        # These are the ones involved in Double Encoding (UTF-8 bytes interpreted as Latin-1)
        # E.g. Ã (C3), ª (AA), etc.
        
        def replace_callback(match):
            seq = match.group(0)
            try:
                # Try to inverse
                raw = seq.encode('cp1252')
                decoded = raw.decode('utf-8')
                # If success, use it
                return decoded
            except:
                # If fail (e.g. invalid utf-8 sequence), keep original
                return seq

        # Regex for Latin-1 range
        # Python regex can use \u0080-\u00FF
        fixed_corrupt_part = re.sub(r'[\u0080-\u00FF]+', replace_callback, corrupt_part)
        
        # Check if it worked
        if "Assistência" in fixed_corrupt_part:
            print("Verified: Assistência restored.")
        else:
            print("Warning: Assistência NOT found (maybe it wasn't broken or fix failed?)")
            
        final_text = fixed_corrupt_part + good_part
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(final_text)
            
        print("Smart fix applied.")

    except Exception as e:
        print(f"Error: {e}")

smart_fix_mojibake('script.js')
