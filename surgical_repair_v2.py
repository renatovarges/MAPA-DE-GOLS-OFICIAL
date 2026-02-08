
import sys

def surgical_repair_utf16le(filename):
    print(f"Surgical repair (UTF-16LE logic) for {filename}...")
    try:
        with open(filename, 'rb') as f:
            data = f.read()
            
        print(f"File size: {len(data)}")
        
        # Search for "// Nova" in UTF-16LE
        # / = 2F, space = 20, N = 4E, o = 6F, v = 76, a = 61
        marker_le = b'\x2f\x00\x2f\x00\x20\x00\x4e\x00\x6f\x00\x76\x00\x61\x00'
        
        idx = data.find(marker_le)
        
        if idx == -1:
            print("CRITICAL: UTF-16LE marker not found! Trying just //")
            marker_le_short = b'\x2f\x00\x2f\x00'
            idx = data.find(marker_le_short)
            if idx == -1:
                print("CRITICAL: Even short marker not found.")
                return
            else:
                print("Warning: Found short marker. Checking if it's really the transition.")
                
        print(f"Found transition at {idx}")
        
        part1 = data[:idx] # Valid UTF-8
        part2_le = data[idx:] # UTF-16LE bytes
        
        # Decode Part 2
        try:
            part2_text = part2_le.decode('utf-16le')
            print("Part 2 decoded successfully from UTF-16LE.")
            # Check if it looks right
            if "Nova função" in part2_text or "drawMarkerLegendNew" in part2_text:
                print("Part 2 verified: looks like the function.")
            else:
                print("Part 2 decoded but content is suspicious:\n" + part2_text[:100])
                
        except Exception as e:
            print(f"Part 2 decode failed: {e}")
            return
            
        # Re-encode Part 2 as UTF-8
        part2_utf8 = part2_text.encode('utf-8')
        
        # Combine
        final_data = part1 + part2_utf8
        
        with open(filename, 'wb') as f:
            f.write(final_data)
            
        print("File normalized to full UTF-8.")
        
    except Exception as e:
        print(f"Error: {e}")

surgical_repair_utf16le('script.js')
