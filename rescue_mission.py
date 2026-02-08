
import sys

def rescue_mission(filename):
    print(f"Attempting rescue for {filename}...")
    try:
        # 1. Read the current garbage (UTF-8)
        with open(filename, 'r', encoding='utf-8', errors='replace') as f:
            garbage_text = f.read()
            
        print(f"Read {len(garbage_text)} chars of garbage.")
        
        # 2. Re-create the bytes that produced this garbage
        # We assume we produced this by decoding 'source_bytes' as 'utf-16le'
        # So source_bytes = garbage_text.encode('utf-16le')
        
        try:
            source_bytes = garbage_text.encode('utf-16le')
            print(f"Recovered {len(source_bytes)} source bytes.")
            print(f"First 20 bytes: {source_bytes[:20].hex()}")
            
            # 3. Try to decode these bytes as UTF-16BE
            try:
                candidate_text = source_bytes.decode('utf-16be')
                print(f"Decoded as UTF-16BE (First 100 chars):")
                print(candidate_text[:100])
                
                if "const" in candidate_text[:100] or "import" in candidate_text[:100] or "//" in candidate_text[:100]:
                    print("SUCCESS! UTF-16BE candidate looks like code.")
                    # Save it!
                    with open('script_rescued.js', 'w', encoding='utf-8') as f:
                        f.write(candidate_text)
                    print("Saved to script_rescued.js")
                    return
            except Exception as e:
                print(f"UTF-16BE decode failed: {e}")

            # 4. Try other encodings if BE fails?
            # Maybe it was just data shifted by 1 byte?
            # shift bytes
            try:
                shifted_bytes = source_bytes[1:]
                candidate_text = shifted_bytes.decode('utf-16le')
                 # logic: off-by-one error in byte stream
                print(f"Decoded as UTF-16LE (Shifted 1 byte):")
                print(candidate_text[:100])
                 
                if "const" in candidate_text[:100]:
                     print("SUCCESS! Shifted LE looks like code.")
                     with open('script_rescued.js', 'w', encoding='utf-8') as f:
                        f.write(candidate_text)
                     return
            except:
                pass
                
        except Exception as e:
            print(f"Could not encode back to utf-16le: {e}")

    except Exception as e:
        print(f"Error: {e}")

rescue_mission('script.js')
