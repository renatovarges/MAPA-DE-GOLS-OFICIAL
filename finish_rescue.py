
import sys

def finish_rescue(filename):
    print(f"Finalizing rescue for {filename}...")
    try:
        # 1. Read the current "Garbage" as UTF-8
        # The file contains UTF-8 sequences that represent chars whose UTF-16LE bytes are the original file.
        with open(filename, 'r', encoding='utf-8', errors='replace') as f:
            garbage_text = f.read()
            
        print(f"Read {len(garbage_text)} chars.")
        
        # 2. Encode as UTF-16LE to recover the source bytes
        original_bytes = garbage_text.encode('utf-16le')
        
        print(f"Recovered {len(original_bytes)} bytes.")
        print(f"Header: {original_bytes[:20].hex()}")
        # Expect EF BB BF 2F 2F ...
        
        # 3. These bytes ARE the original utf-8 file.
        # We can just write them.
        
        with open(filename, 'wb') as f:
            f.write(original_bytes)
            
        print("File restored successfully.")
        
    except Exception as e:
        print(f"Error: {e}")

finish_rescue('script.js')
