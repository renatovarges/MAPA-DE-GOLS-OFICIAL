
import sys

def fix_mixed_binary(filename):
    print(f"Attempting binary mixed fix for {filename}...")
    try:
        with open(filename, 'rb') as f:
            data = f.read()
            
        print(f"File size: {len(data)} bytes")
        
        # The append started with this comment in UTF-8
        split_marker_str = "// Nova função dedicada"
        split_marker_bytes = split_marker_str.encode('utf-8')
        
        # Search for the marker in binary
        split_idx = data.find(split_marker_bytes)
        
        if split_idx == -1:
            print("Could not find split marker in binary. Trying subset...")
            # Try just "// Nova"
            split_marker_bytes = b"// Nova"
            split_idx = data.find(split_marker_bytes)
            
        if split_idx == -1:
             print("CRITICAL: Marker not found even as partial.")
             # Let's try to detect if the whole file is just UTF-16LE
             # Look for 'function' in utf-16le
             func_bytes = "function".encode('utf-16le')
             if func_bytes in data:
                 print("Detected UTF-16LE content widely.")
             else:
                 print("Structure unclear.")
             return

        print(f"Split found at byte {split_idx}")
        
        part1_bytes = data[:split_idx]
        part2_bytes = data[split_idx:]
        
        # Part 1 is likely UTF-16LE (PowerShell default)
        part1_text = ""
        try:
            part1_text = part1_bytes.decode('utf-16le')
            print("Part 1 decoded successfully as UTF-16LE")
        except UnicodeDecodeError:
            print("Part 1 failed UTF-16LE decode. Trying utf-8...")
            try:
                part1_text = part1_bytes.decode('utf-8')
                print("Part 1 decoded as UTF-8 (maybe it was just double-encoded?)")
            except:
                print("Part 1 failed distinct decode strategies.")
                part1_text = part1_bytes.decode('utf-8', errors='replace')

        # Part 2 is UTF-8 (we appended it)
        part2_text = ""
        try:
            part2_text = part2_bytes.decode('utf-8')
            print("Part 2 decoded successfully as UTF-8")
        except:
             print("Part 2 failed UTF-8 decode.")
             part2_text = part2_bytes.decode('utf-8', errors='replace')
             
        # Combine
        full_text = part1_text + part2_text
        
        # Write back as clean UTF-8
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(full_text)
            
        print("File saved as normalized UTF-8.")
        
    except Exception as e:
        print(f"Error: {e}")

fix_mixed_binary('script.js')
